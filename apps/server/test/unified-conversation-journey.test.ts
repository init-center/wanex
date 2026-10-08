import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterEach, expect, it } from "vitest"
import { createRemoteAssistantAgentHostComposition } from "@wanex/assistant-host"
import { bootstrapWanexStorage, type BootstrappedWanexStorage } from "@wanex/runtime/bootstrap"
import { EnvSecretProvider, SecretResolver } from "@wanex/runtime/secrets"
import { startWanexServerInternal } from "../src/start.js"
import { startConversationProvider } from "./support/conversation-provider.js"
import { createHttpsFetch, createTestCertificate } from "./support/tls.js"

const execFileAsync = promisify(execFile)
const serviceBin = join(import.meta.dirname, `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`)
const closers: (() => Promise<void>)[] = []

afterEach(async () => { while (closers.length) await closers.pop()!() })

/**
 * Route 20E-1A: one canonical Session carries ordinary chat, dynamic directory
 * access, reading, Git-free direct modification, isolated Proposal review,
 * model switching and regeneration through the same remote Surface contract.
 */
it("carries chat, dynamic access, edits, proposal review, model switch and regeneration in one Session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wanex-unified-journey-"))
  closers.push(() => rm(directory, { recursive: true, force: true }))
  const repository = join(directory, "repository")
  await execFileAsync("git", ["init", "--quiet", repository])
  await writeFile(join(repository, "app.txt"), "v0")
  for (const args of [["config", "user.name", "Wanex Test"], ["config", "user.email", "test@wanex.local"], ["config", "core.autocrlf", "false"], ["add", "."], ["commit", "-m", "initial"]]) {
    await execFileAsync("git", ["-C", repository, ...args])
  }
  const notes = join(directory, "notes")
  await mkdir(notes)
  await writeFile(join(notes, "todo.txt"), "draft notes\n")

  const certificate = await createTestCertificate()
  closers.push(() => certificate.close())
  const provider = await startConversationProvider({ accessPath: notes })
  closers.push(() => provider.close())
  let runtime: BootstrappedWanexStorage | undefined
  const server = await startWanexServerInternal({
    config: {
      hostId: "server:unified", dataRoot: join(directory, "data"), profileId: "unified",
      listener: { hostname: "127.0.0.1", port: 0 },
      workspace: { initialRoots: [{ id: "project", path: repository, effects: ["read", "write", "create", "remove"] }] }
    },
    serviceBin, tls: certificate,
    authentication: { ownerSubjectId: "remote-user", async authenticateBearerToken(token) { return token === "test-bearer" ? { subjectId: "remote-user", expiresAt: Date.now() + 60_000 } : null } },
    secretResolver: new SecretResolver([new EnvSecretProvider({ WORKSPACE_TEST_KEY: "fixture" })]),
    modelEndpoints: { endpoints: [provider.primary, provider.secondary], activeEndpointId: provider.primary.id }
  }, {
    async bootstrapStorage(options) {
      runtime = await bootstrapWanexStorage(options)
      return runtime
    }
  })
  closers.push(() => server.close())
  const client = await createRemoteAssistantAgentHostComposition({
    messageUrl: server.endpoint.messageUrl, getBearerToken: () => "test-bearer",
    fetch: createHttpsFetch(certificate.cert), clientId: "remote-unified"
  })
  closers.push(() => client.close())
  const stream = client.startEvents()
  await stream.ready
  const surface = client.client
  const sessionId = "unified-session"

  const readOperation = async () => {
    const result = await surface.readTrackedConversationOperation({ sessionId })
    return result.ok && result.value.kind === "assistant.conversation-operation.found"
      ? result.value.operation
      : undefined
  }
  const turns = () => runtime!.storage.listSessionTurns({ sessionId })
  const settle = async (count: number) => {
    await expect.poll(async () => (await turns()).length, { timeout: 10_000 }).toBe(count)
    await expect.poll(async () => (await turns()).at(-1)?.state, { timeout: 10_000 }).toBe("succeeded")
    await expect.poll(async () => (await readOperation())?.state, { timeout: 10_000 }).toBe("succeeded")
  }
  const submit = async (idempotencyKey: string, text: string) => {
    await expect(surface.submitConversationOperation({ sessionId, idempotencyKey, text })).resolves.toMatchObject({ ok: true })
  }

  // 1. Ordinary chat with no directory selection, project, or mode switch.
  await submit("chat-1", "hello before any files")
  await settle(1)
  expect(JSON.stringify(await surface.readSessionTranscript({ sessionId }))).toContain("chat reply from primary-model: hello before any files")

  // 2. The conversation asks for an unconfigured directory; one canonical approval continues the same Turn.
  await submit("access-1", JSON.stringify({ tool: "access", effects: ["read", "write"], scope: "session", reason: "edit the user's notes", readPath: "todo.txt" }))
  await expect.poll(async () => (await readOperation())?.approvals?.items.length ?? 0, { timeout: 10_000 }).toBe(1)
  const approval = (await readOperation())!.approvals!.items[0]!
  expect(JSON.stringify(approval)).not.toContain(notes)
  expect(JSON.stringify(approval)).toContain("write")
  await expect(surface.resolveTrackedConversationApproval({
    sessionId, approvalId: approval.approvalId, expectedApprovalRevision: approval.approvalRevision,
    decision: "approve_once", reason: "allow notes access", idempotencyKey: "approve-access-1"
  })).resolves.toMatchObject({ ok: true })
  await settle(2)
  expect(JSON.stringify(await surface.readSessionTranscript({ sessionId }))).toContain("draft notes")

  // 3. A later Turn modifies the granted directory directly, without Git or a project registration.
  await submit("direct-1", JSON.stringify({ tool: "direct", changes: [{ path: "todo.txt", kind: "update", baseText: "draft notes\n", targetText: "final notes\n" }] }))
  await settle(3)
  expect(await readFile(join(notes, "todo.txt"), "utf8")).toBe("final notes\n")
  const directTranscript = await surface.readSessionTranscript({ sessionId })
  const directChange = directTranscript.ok && directTranscript.value.kind === "assistant.session-transcript.found"
    ? directTranscript.value.transcript.rows.flatMap((row) => row.workspaceChanges ?? []).find((change) => change.changeKind === "direct")
    : undefined
  expect(directChange).toBeDefined()
  await expect(surface.readWorkspaceChange({ sessionId, changeRef: directChange!.changeRef })).resolves.toMatchObject({ ok: true, value: { status: "applied" } })
  await expect(surface.undoWorkspaceChange({ sessionId, changeRef: directChange!.changeRef, idempotencyKey: "undo-direct-1" })).resolves.toMatchObject({ ok: true, value: { outcome: "applied" } })
  expect(await readFile(join(notes, "todo.txt"), "utf8")).toBe("draft notes\n")
  await expect(surface.reapplyWorkspaceChange({ sessionId, changeRef: directChange!.changeRef, idempotencyKey: "reapply-direct-1" })).resolves.toMatchObject({ ok: true, value: { outcome: "applied" } })
  expect(await readFile(join(notes, "todo.txt"), "utf8")).toBe("final notes\n")
  await writeFile(join(notes, "todo.txt"), "external notes\n")
  await expect(surface.undoWorkspaceChange({ sessionId, changeRef: directChange!.changeRef, idempotencyKey: "undo-direct-conflict-1" })).resolves.toMatchObject({ ok: true, value: { outcome: "conflicted" } })
  expect(await readFile(join(notes, "todo.txt"), "utf8")).toBe("external notes\n")

  // 4. The Host-authorized repository receives an isolated Proposal reviewed through the same Surface.
  await submit("isolated-1", JSON.stringify({ rootId: "project", changes: [{ path: "app.txt", kind: "update", baseText: "v0", targetText: "v1" }] }))
  await settle(4)
  expect(await readFile(join(repository, "app.txt"), "utf8")).toBe("v0")
  const transcriptWithProposal = await surface.readSessionTranscript({ sessionId })
  const proposalChange = transcriptWithProposal.ok && transcriptWithProposal.value.kind === "assistant.session-transcript.found"
    ? transcriptWithProposal.value.transcript.rows.flatMap((row) => row.workspaceChanges ?? []).find((change) => change.changeKind === "proposal")
    : undefined
  expect(proposalChange).toBeDefined()
  await expect(surface.readWorkspaceChange({ sessionId, changeRef: proposalChange!.changeRef })).resolves.toMatchObject({
    ok: true, value: { status: "proposed", files: [{ path: "app.txt", kind: "update", after: { text: "v1" } }] }
  })
  await expect(surface.decideWorkspaceChange({ sessionId, changeRef: proposalChange!.changeRef, decision: "approve", idempotencyKey: "approve-proposal-1" })).resolves.toMatchObject({ ok: true, value: { status: "approved" } })
  await expect(surface.applyWorkspaceChange({ sessionId, changeRef: proposalChange!.changeRef, idempotencyKey: "apply-proposal-1" })).resolves.toMatchObject({ ok: true, value: { outcome: "applied" } })
  expect(await readFile(join(repository, "app.txt"), "utf8")).toBe("v1")
  await expect(surface.undoWorkspaceChange({ sessionId, changeRef: proposalChange!.changeRef, idempotencyKey: "undo-proposal-1" })).resolves.toMatchObject({ ok: true, value: { outcome: "applied" } })
  expect(await readFile(join(repository, "app.txt"), "utf8")).toBe("v0")
  await expect(surface.reapplyWorkspaceChange({ sessionId, changeRef: proposalChange!.changeRef, idempotencyKey: "reapply-proposal-1" })).resolves.toMatchObject({ ok: true, value: { outcome: "applied" } })
  expect(await readFile(join(repository, "app.txt"), "utf8")).toBe("v1")

  // 5. Switching the model affects only new Turns; admitted Turns keep their frozen binding.
  const bindingsBeforeSwitch = (await turns()).map((turn) => turn.executionBinding.digest)
  await expect(surface.setActiveModelEndpoint({ endpointId: provider.secondary.id })).resolves.toMatchObject({ ok: true })
  await submit("chat-2", "hello after switching")
  await settle(5)
  expect(JSON.stringify(await surface.readSessionTranscript({ sessionId }))).toContain("chat reply from secondary-model: hello after switching")

  // 6. Regeneration creates an explicit new Turn linked to the original, which stays intact.
  await expect(surface.regenerateTrackedConversationOperation({ sessionId })).resolves.toMatchObject({ ok: true })
  await settle(6)
  const allTurns = await turns()
  expect(allTurns.map((turn) => turn.executionBinding.modelEndpoint.endpointId)).toEqual([
    provider.primary.id, provider.primary.id, provider.primary.id, provider.primary.id,
    provider.secondary.id, provider.secondary.id
  ])
  expect(allTurns.slice(0, 4).map((turn) => turn.executionBinding.digest)).toEqual(bindingsBeforeSwitch)
  expect(allTurns[5]!.regeneratesTurnId).toBe(allTurns[4]!.id)
  expect(allTurns[4]!.state).toBe("succeeded")
  expect(allTurns.every((turn) => turn.sessionId === sessionId)).toBe(true)
  expect(provider.requests.filter((request) => request.lastUser === "hello after switching").map((request) => request.model)).toEqual(["secondary-model", "secondary-model"])

  // Approval continuation never duplicated the access request's user input.
  const accessTurnInputs = (await runtime!.storage.listSessionMessages({ sessionId }))
    .filter((message) => message.role === "user" && JSON.stringify(message).includes("edit the user's notes"))
  expect(accessTurnInputs).toHaveLength(1)

  // No trusted path leaks into the client-visible transcript.
  const finalTranscript = JSON.stringify(await surface.readSessionTranscript({ sessionId }))
  expect(finalTranscript).not.toContain(await realpath(notes))
  expect(finalTranscript).not.toContain(await realpath(repository))
  stream.close()
  await stream.closed
})
