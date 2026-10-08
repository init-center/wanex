import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterEach, expect, it } from "vitest"
import { createRemoteAssistantAgentHostComposition } from "@wanex/assistant-host"
import { bootstrapWanexStorage, type BootstrappedWanexStorage } from "@wanex/runtime/bootstrap"
import { EnvSecretProvider, SecretResolver } from "@wanex/runtime/secrets"
import { resolveLocalStore } from "@wanex/storage"
import { createWorkspaceStore } from "@wanex/storage/workspace"
import { startWanexServerInternal } from "../src/start.js"
import { createHttpsFetch, createTestCertificate } from "./support/tls.js"
import { startToolProvider } from "./support/tool-provider.js"

const execFileAsync = promisify(execFile)
const serviceBin = join(import.meta.dirname, `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`)
const closers: (() => Promise<void>)[] = []

afterEach(async () => { while (closers.length) await closers.pop()!() })

it("prepares an isolated proposal through TLS, without client paths, duplicate work or original writes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wanex-server-isolation-"))
  closers.push(() => rm(directory, { recursive: true, force: true }))
  const root = join(directory, "repository")
  await execFileAsync("git", ["init", "--quiet", root])
  await writeFile(join(root, "file.txt"), "original")
  for (const args of [["config", "user.name", "Wanex Test"], ["config", "user.email", "test@wanex.local"], ["config", "core.autocrlf", "false"], ["add", "."], ["commit", "-m", "initial"]]) {
    await execFileAsync("git", ["-C", root, ...args])
  }
  const certificate = await createTestCertificate()
  closers.push(() => certificate.close())
  const provider = await startToolProvider()
  closers.push(() => provider.close())
  let runtime: BootstrappedWanexStorage | undefined
  const dataRoot = join(directory, "data")
  const server = await startWanexServerInternal({
    config: {
      hostId: "server:isolation", dataRoot, profileId: "isolation",
      listener: { hostname: "127.0.0.1", port: 0 },
      workspace: { initialRoots: [{ id: "project", path: root, effects: ["read", "write", "create", "remove"] }] }
    },
    serviceBin, tls: certificate,
    authentication: { ownerSubjectId: "remote-user", async authenticateBearerToken(token) { return token === "test-bearer" ? { subjectId: "remote-user", expiresAt: Date.now() + 60_000 } : null } },
    secretResolver: new SecretResolver([new EnvSecretProvider({ WORKSPACE_TEST_KEY: "fixture" })]),
    modelEndpoints: { endpoints: [provider.endpoint], activeEndpointId: provider.endpoint.id }
  }, {
    async bootstrapStorage(options) {
      runtime = await bootstrapWanexStorage(options)
      return runtime
    }
  })
  closers.push(() => server.close())
  const client = await createRemoteAssistantAgentHostComposition({
    messageUrl: server.endpoint.messageUrl, getBearerToken: () => "test-bearer",
    fetch: createHttpsFetch(certificate.cert), clientId: "remote-isolation"
  })
  closers.push(() => client.close())
  const stream = client.startEvents()
  await stream.ready
  const request = {
    sessionId: "remote-isolated-session", idempotencyKey: "prepare-once",
    text: JSON.stringify({ rootId: "project", changes: [{ path: "file.txt", kind: "update", baseText: "original", targetText: "isolated" }] })
  }
  const submitted = await client.client.submitConversationOperation(request)
  expect(submitted).toMatchObject({ ok: true })
  expect(await client.client.submitConversationOperation(request)).toEqual(submitted)
  await expect.poll(async () => (await runtime!.storage.listSessionTurns({ sessionId: request.sessionId }))[0]?.state, { timeout: 10_000 }).toBe("succeeded")
  const turns = await runtime!.storage.listSessionTurns({ sessionId: request.sessionId })
  expect(turns).toHaveLength(1)
  const storage = createWorkspaceStore(runtime!.transport)
  const runs = await storage.listWorkspaceTaskRuns({})
  expect(runs).toHaveLength(1)
  expect(runs[0]?.run).toMatchObject({ state: "released", outcome: "proposed", rootIdentity: { hostId: "server:isolation", rootId: "project" } })
  expect(await storage.getWorkspaceChangeProposal({ proposalId: runs[0]!.run.proposalId! })).not.toBeNull()
  expect(JSON.stringify(await storage.getWorkspaceChangeSet({ changeSetId: runs[0]!.run.changeSetId! }))).toContain("isolated")
  expect(await readFile(join(root, "file.txt"), "utf8")).toBe("original")
  expect((await execFileAsync("git", ["-C", root, "branch", "--list", "wanex/runtime/*"])).stdout.trim()).toBe("")
  const location = resolveLocalStore({ rootDir: dataRoot, profileId: "isolation" })
  expect((await stat(join(location.storeDir, "workspace-worktrees"))).isDirectory()).toBe(true)
  const transcript = await client.client.readSessionTranscript({ sessionId: request.sessionId })
  expect(transcript).toMatchObject({ ok: true })
  expect(JSON.stringify(transcript)).toContain(runs[0]!.run.proposalId)
  expect(JSON.stringify(transcript)).not.toContain(await realpath(root))
  expect(JSON.stringify(transcript)).not.toContain(location.storeDir)

  const transcriptChanges = await client.client.readSessionTranscript({ sessionId: request.sessionId })
  const proposalChange = transcriptChanges.ok && transcriptChanges.value.kind === "assistant.session-transcript.found" ? transcriptChanges.value.transcript.rows.flatMap((row) => row.workspaceChanges ?? []).find((change) => change.changeKind === "proposal") : undefined
  expect(proposalChange).toBeDefined()
  const proposal = await client.client.readWorkspaceChange({ sessionId: request.sessionId, changeRef: proposalChange!.changeRef })
  expect(proposal).toMatchObject({ ok: true, value: { kind: "assistant.workspace-change", status: "proposed" } })
  await expect(client.client.readWorkspaceChange({ sessionId: "another-session", changeRef: proposalChange!.changeRef })).resolves.toMatchObject({ ok: false, error: { code: "command_error" } })
  expect(await readFile(join(root, "file.txt"), "utf8")).toBe("original")
  await expect(client.client.decideWorkspaceChange({ sessionId: request.sessionId, changeRef: proposalChange!.changeRef, decision: "approve", idempotencyKey: "approve-once" })).resolves.toMatchObject({ ok: true, value: { status: "approved" } })
  const applied = await client.client.applyWorkspaceChange({ sessionId: request.sessionId, changeRef: proposalChange!.changeRef, idempotencyKey: "apply-once" })
  expect(applied).toMatchObject({ ok: true, value: { kind: "assistant.workspace-change-mutation", outcome: "applied" } })
  const operationsBeforeRepeat = await storage.listWorkspaceChangeOperations({ changeSetId: runs[0]!.run.changeSetId! })
  await expect(client.client.applyWorkspaceChange({ sessionId: request.sessionId, changeRef: proposalChange!.changeRef, idempotencyKey: "apply-once" })).resolves.toMatchObject({ ok: true, value: { kind: "assistant.workspace-change-mutation", outcome: expect.stringMatching(/applied|failed/) } })
  expect(await storage.listWorkspaceChangeOperations({ changeSetId: runs[0]!.run.changeSetId! })).toHaveLength(operationsBeforeRepeat.length)
  expect(await readFile(join(root, "file.txt"), "utf8")).toBe("isolated")
  const undone = await client.client.undoWorkspaceChange({ sessionId: request.sessionId, changeRef: proposalChange!.changeRef, idempotencyKey: "undo-once" })
  expect(undone).toMatchObject({ ok: true, value: { kind: "assistant.workspace-change-mutation", outcome: "applied" } })
  expect(await readFile(join(root, "file.txt"), "utf8")).toBe("original")
  await expect(client.client.reapplyWorkspaceChange({ sessionId: request.sessionId, changeRef: proposalChange!.changeRef, idempotencyKey: "reapply-once" })).resolves.toMatchObject({ ok: true, value: { outcome: "applied" } })
  expect(await readFile(join(root, "file.txt"), "utf8")).toBe("isolated")
  await writeFile(join(root, "file.txt"), "external")
  const conflict = await client.client.undoWorkspaceChange({ sessionId: request.sessionId, changeRef: proposalChange!.changeRef, idempotencyKey: "undo-after-external" })
  expect(conflict).toMatchObject({ ok: true, value: { outcome: "conflicted", conflicts: expect.any(Array) } })
  expect(await readFile(join(root, "file.txt"), "utf8")).toBe("external")
  const executions = await runtime!.storage.listToolExecutions({ turnId: turns[0]!.id })
  expect(executions).toHaveLength(1)
  expect(executions[0]?.state).toBe("succeeded")
  stream.close()
  await stream.closed
})

it("keeps multiple remote workspace roots independent across isolation and direct mutation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wanex-server-multi-root-"))
  closers.push(() => rm(directory, { recursive: true, force: true }))
  const gitRootA = join(directory, "repository-a")
  const gitRootB = join(directory, "repository-b")
  const plainRoot = join(directory, "plain")
  for (const [root, file, content] of [[gitRootA, "a.txt", "A0"], [gitRootB, "b.txt", "B0"]] as const) {
    await execFileAsync("git", ["init", "--quiet", root])
    await writeFile(join(root, file), content)
    for (const args of [["config", "user.name", "Wanex Test"], ["config", "user.email", "test@wanex.local"], ["config", "core.autocrlf", "false"], ["add", "."], ["commit", "-m", "initial"]]) {
      await execFileAsync("git", ["-C", root, ...args])
    }
  }
  await mkdir(plainRoot, { recursive: true })
  await writeFile(join(plainRoot, "plain.txt"), "P0")

  const certificate = await createTestCertificate()
  closers.push(() => certificate.close())
  const provider = await startToolProvider()
  closers.push(() => provider.close())
  let runtime: BootstrappedWanexStorage | undefined
  const dataRoot = join(directory, "data")
  const server = await startWanexServerInternal({
    config: {
      hostId: "server:multi-root", dataRoot, profileId: "multi-root",
      listener: { hostname: "127.0.0.1", port: 0 },
      workspace: {
        initialRoots: [
          { id: "repo-a", path: gitRootA, effects: ["read", "write", "create", "remove"] },
          { id: "repo-b", path: gitRootB, effects: ["read", "write", "create", "remove"] },
          { id: "plain", path: plainRoot, effects: ["read", "write", "create", "remove"] }
        ]
      }
    },
    serviceBin, tls: certificate,
    authentication: { ownerSubjectId: "remote-user", async authenticateBearerToken(token) { return token === "test-bearer" ? { subjectId: "remote-user", expiresAt: Date.now() + 60_000 } : null } },
    secretResolver: new SecretResolver([new EnvSecretProvider({ WORKSPACE_TEST_KEY: "fixture" })]),
    modelEndpoints: { endpoints: [provider.endpoint], activeEndpointId: provider.endpoint.id }
  }, {
    async bootstrapStorage(options) {
      runtime = await bootstrapWanexStorage(options)
      return runtime
    }
  })
  closers.push(() => server.close())
  let client = await createRemoteAssistantAgentHostComposition({
    messageUrl: server.endpoint.messageUrl, getBearerToken: () => "test-bearer",
    fetch: createHttpsFetch(certificate.cert), clientId: "remote-multi-root"
  })
  const initialClient = client
  closers.push(() => initialClient.close())
  let stream = client.startEvents()
  await stream.ready

  const sessionId = "remote-multi-root-session"
  const submit = async (idempotencyKey: string, input: unknown) => {
    const result = await client.client.submitConversationOperation({
      sessionId, idempotencyKey, text: JSON.stringify(input)
    })
    expect(result).toMatchObject({ ok: true })
    await expect.poll(async () => (await runtime!.storage.listSessionTurns({ sessionId })).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1)
    await expect.poll(async () => {
      const turns = await runtime!.storage.listSessionTurns({ sessionId })
      return turns.at(-1)?.state
    }, { timeout: 10_000 }).toBe("succeeded")
  }

  await submit("repo-a-once", { rootId: "repo-a", changes: [{ path: "a.txt", kind: "update", baseText: "A0", targetText: "A1" }] })
  await submit("repo-b-once", { rootId: "repo-b", changes: [{ path: "b.txt", kind: "update", baseText: "B0", targetText: "B1" }] })
  const storage = createWorkspaceStore(runtime!.transport)
  const runs = await storage.listWorkspaceTaskRuns({})
  expect(runs).toHaveLength(2)
  const runByRoot = new Map(runs.map((entry) => [entry.run.rootIdentity.rootId, entry.run]))
  const runA = runByRoot.get("repo-a")
  const runB = runByRoot.get("repo-b")
  expect(runA).toMatchObject({ state: "released", outcome: "proposed", strategy: "git_worktree", rootIdentity: { hostId: "server:multi-root", rootId: "repo-a" } })
  expect(runB).toMatchObject({ state: "released", outcome: "proposed", strategy: "git_worktree", rootIdentity: { hostId: "server:multi-root", rootId: "repo-b" } })
  expect(runA?.rootIdentity.device).toBe(runB?.rootIdentity.device)
  expect(runA?.rootIdentity.inode).not.toBe(runB?.rootIdentity.inode)
  expect(runA?.proposalId).not.toBe(runB?.proposalId)
  expect(await readFile(join(gitRootA, "a.txt"), "utf8")).toBe("A0")
  expect(await readFile(join(gitRootB, "b.txt"), "utf8")).toBe("B0")

  const multiRootTranscript = await client.client.readSessionTranscript({ sessionId })
  const proposalChanges = multiRootTranscript.ok && multiRootTranscript.value.kind === "assistant.session-transcript.found" ? multiRootTranscript.value.transcript.rows.flatMap((row) => row.workspaceChanges ?? []).filter((change) => change.changeKind === "proposal") : []
  const proposalA = await client.client.readWorkspaceChange({ sessionId, changeRef: proposalChanges.find((change) => change.files.some((file) => file.path === "a.txt"))!.changeRef })
  const proposalB = await client.client.readWorkspaceChange({ sessionId, changeRef: proposalChanges.find((change) => change.files.some((file) => file.path === "b.txt"))!.changeRef })
  expect(proposalA).toMatchObject({ ok: true, value: { files: [{ path: "a.txt", kind: "update", after: { text: "A1" } }] } })
  expect(proposalB).toMatchObject({ ok: true, value: { files: [{ path: "b.txt", kind: "update", after: { text: "B1" } }] } })

  const refA = proposalChanges.find((change) => change.files.some((file) => file.path === "a.txt"))!.changeRef
  const refB = proposalChanges.find((change) => change.files.some((file) => file.path === "b.txt"))!.changeRef
  stream.close()
  await stream.closed
  await client.close()
  client = await createRemoteAssistantAgentHostComposition({
    messageUrl: server.endpoint.messageUrl, getBearerToken: () => "test-bearer",
    fetch: createHttpsFetch(certificate.cert), clientId: "remote-multi-root-reconnected"
  })
  const resumedClient = client
  closers.push(() => resumedClient.close())
  stream = client.startEvents()
  await stream.ready
  const repeated = await client.client.submitConversationOperation({
    sessionId, idempotencyKey: "repo-a-once",
    text: JSON.stringify({ rootId: "repo-a", changes: [{ path: "a.txt", kind: "update", baseText: "A0", targetText: "A1" }] })
  })
  expect(repeated).toMatchObject({ ok: true })
  expect(await runtime!.storage.listSessionTurns({ sessionId })).toHaveLength(2)
  expect(await storage.listWorkspaceTaskRuns({})).toHaveLength(2)
  const resumedTranscript = await client.client.readSessionTranscript({ sessionId })
  expect(resumedTranscript).toMatchObject({ ok: true, value: { kind: "assistant.session-transcript.found" } })
  expect(JSON.stringify(resumedTranscript)).toContain(refA)
  expect(JSON.stringify(resumedTranscript)).toContain(refB)
  await expect(client.client.decideWorkspaceChange({ sessionId, changeRef: refA, decision: "approve", idempotencyKey: "approve-repo-a" })).resolves.toMatchObject({ ok: true, value: { status: "approved" } })
  await expect(client.client.applyWorkspaceChange({ sessionId, changeRef: refA, idempotencyKey: "apply-repo-a" })).resolves.toMatchObject({ ok: true, value: { outcome: "applied" } })
  await expect(client.client.decideWorkspaceChange({ sessionId, changeRef: refB, decision: "approve", idempotencyKey: "approve-repo-b" })).resolves.toMatchObject({ ok: true, value: { status: "approved" } })
  await expect(client.client.applyWorkspaceChange({ sessionId, changeRef: refB, idempotencyKey: "apply-repo-b" })).resolves.toMatchObject({ ok: true, value: { outcome: "applied" } })
  expect(await readFile(join(gitRootA, "a.txt"), "utf8")).toBe("A1")
  expect(await readFile(join(gitRootB, "b.txt"), "utf8")).toBe("B1")

  await submit("plain-once", { tool: "direct", changes: [{ rootId: "plain", path: "plain.txt", kind: "update", baseText: "P0", targetText: "P1" }] })
  expect(await readFile(join(plainRoot, "plain.txt"), "utf8")).toBe("P1")
  expect(await storage.listWorkspaceTaskRuns({})).toHaveLength(2)
  expect(await readFile(join(gitRootA, "a.txt"), "utf8")).toBe("A1")
  expect(await readFile(join(gitRootB, "b.txt"), "utf8")).toBe("B1")

  const transcript = await client.client.readSessionTranscript({ sessionId })
  expect(transcript).toMatchObject({ ok: true })
  expect(JSON.stringify(transcript)).not.toContain(await realpath(gitRootA))
  expect(JSON.stringify(transcript)).not.toContain(await realpath(gitRootB))
  expect(JSON.stringify(transcript)).not.toContain(await realpath(plainRoot))
  stream.close()
  await stream.closed
})
