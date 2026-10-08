import { browserAssets } from "./support/browser-assets.js"
import { createServer } from "node:http"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ModelEndpoint, SubmitSessionTurnRequest } from "@wanex/protocol"
import { WorkspaceReadTextTool } from "@wanex/workspace/tools/read"
import { WorkspaceRuntime, WorkspaceTransactionCleanupRequiredError, WorkspaceTransactionRecoveryRequiredError } from "@wanex/workspace"
import { EnvSecretProvider, SecretResolver } from "@wanex/runtime/secrets"
import { createAssistantHostHandle, startAssistantHostInternal, type StartedAssistantHost } from "../src/application/assistant.js"
import type { WorkspaceHostOptions } from "../src/workspace/model.js"
import { parseLocalCliOptions } from "../src/cli/options.js"
import { startAssistantWebApp } from "../src/index.js"
import { digest } from "../src/workspace/store.js"
import { createWorkspaceAccessStore } from "../src/workspace/access.js"
import { createWorkspaceStore } from "@wanex/storage/workspace"
import { createStorageTestStore } from "@wanex/storage/testing"
import { createWorkspaceMutationTools } from "../src/workspace/mutation-tools.js"
import { createWorkspaceGitCapabilityTools } from "../src/workspace/git-capability-tools.js"
import { createIsolatedChangeTools } from "../src/workspace/isolated-changes/tools.js"
import { createWorkspaceController } from "../src/workspace/controller.js"

const serviceBin = join(import.meta.dirname, `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`)
const execFileAsync = promisify(execFile)
const closers: (() => Promise<void>)[] = []
const directories: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  while (closers.length) await closers.pop()!()
  while (directories.length) await rm(directories.pop()!, { recursive: true, force: true })
})

describe("Assistant Host durable workspace", () => {
  it("prepares isolated text changes in the same Session without changing original roots", async () => {
    const { started, first, second, provider } = await setup({ writable: true, isolation: true })
    await initializeRepository(first)
    await submit(started, "ses_isolated", "hello")
    await submit(started, "ses_isolated", isolated([{ path: "same.txt", kind: "update", baseText: "FIRST_FILE", targetText: "ISOLATED_EDIT" }]))
    const workspace = createWorkspaceStore(started.runtime.transport)
    const runs = await workspace.listWorkspaceTaskRuns({})
    expect(runs).toHaveLength(1)
    expect(runs[0]?.run).toMatchObject({ state: "released", outcome: "proposed", strategy: "git_worktree", rootIdentity: { hostId: "test", rootId: "first" } })
    const proposal = await workspace.getWorkspaceChangeProposal({ proposalId: runs[0]!.run.proposalId! })
    expect(proposal).not.toBeNull()
    const changes = await workspace.getWorkspaceChangeSet({ changeSetId: runs[0]!.run.changeSetId! })
    expect(JSON.stringify(changes)).toContain("ISOLATED_EDIT")
    expect(await readFile(join(first, "same.txt"), "utf8")).toBe("FIRST_FILE")
    expect(await execFileAsync("git", ["-C", first, "branch", "--list", "wanex/runtime/*"]).then((result) => result.stdout.trim())).toBe("")
    const toolResults = (await started.runtime.storage.listToolExecutions({ turnId: (await started.runtime.storage.listSessionTurns({ sessionId: "ses_isolated" })).at(-1)!.id }))
    expect(JSON.stringify(toolResults.map((item) => item.content))).not.toContain(first)
    expect(JSON.stringify(toolResults)).toContain(runs[0]!.run.proposalId)
    await submit(started, "ses_isolated", `CALL:${JSON.stringify({ name: "workspace_apply_changeset", input: { changes: [{ rootId: "second", path: "same.txt", kind: "update", baseText: "SECOND_FILE", targetText: "DIRECT_EDIT" }] } })}`)
    expect(await readFile(join(second, "same.txt"), "utf8")).toBe("DIRECT_EDIT")
    expect(await hasGitDirectory(second)).toBe(false)
    expect((await started.runtime.storage.listSessionTurns({ sessionId: "ses_isolated" }))).toHaveLength(3)
    expect(JSON.stringify(provider.requests.at(-1))).toContain("hello")
  })

  it("never falls back to direct editing for unavailable Git roots or conflicting baselines", async () => {
    const { started, first } = await setup({ writable: true, isolation: true })
    await submit(started, "ses_isolation_failure", isolated([{ path: "same.txt", kind: "update", baseText: "FIRST_FILE", targetText: "WRONG" }]))
    expect(await hasGitDirectory(first)).toBe(false)
    expect(await readFile(join(first, "same.txt"), "utf8")).toBe("FIRST_FILE")
    await initializeRepository(first)
    await submit(started, "ses_isolation_failure", isolated([{ path: "same.txt", kind: "update", baseText: "STALE", targetText: "WRONG" }]))
    const runs = await createWorkspaceStore(started.runtime.transport).listWorkspaceTaskRuns({})
    expect(runs).toHaveLength(1)
    expect(runs[0]?.run).toMatchObject({ state: "released", outcome: "execution_failed" })
    expect(runs[0]?.run.proposalId).toBeUndefined()
    expect(await readFile(join(first, "same.txt"), "utf8")).toBe("FIRST_FILE")
  })

  it("does not grant write or helper configuration through isolated change input", async () => {
    const { started, first } = await setup({ writable: true, isolation: true })
    await initializeRepository(first)
    const authority = await started.workspace!.port.readAuthority()
    await started.workspace!.port.setAuthority({ expectedRevision: authority.revision, roots: [{ id: "first", path: first, effects: ["read", "create"] }] })
    await submit(started, "ses_isolation_denied", isolated([{ path: "same.txt", kind: "update", baseText: "FIRST_FILE", targetText: "WRONG" }]))
    await submit(started, "ses_isolation_denied", `CALL:${JSON.stringify({ name: "workspace_prepare_isolated_changes", input: { rootId: "first", serviceBin: "/untrusted", changes: [{ path: "created.txt", kind: "create", targetText: "WRONG" }] } })}`)
    expect(await createWorkspaceStore(started.runtime.transport).listWorkspaceTaskRuns({})).toEqual([])
    expect(await readFile(join(first, "same.txt"), "utf8")).toBe("FIRST_FILE")
    await expect(readFile(join(first, "created.txt"))).rejects.toThrow()
  })

  it("rejects Git control paths before starting any isolated task", async () => {
    const { started, first } = await setup({ writable: true, isolation: true })
    await initializeRepository(first)
    for (const path of [".git", ".GIT/config", ".git./config", ".git:stream", "GIT~1/config"]) {
      const turn = await submit(started, "ses_control_paths", isolated([{ path, kind: "create", targetText: "WRONG" }]))
      expect((await started.runtime.storage.listToolExecutions({ turnId: turn.id }))[0]?.state).toBe("failed")
    }
    expect(await createWorkspaceStore(started.runtime.transport).listWorkspaceTaskRuns({})).toEqual([])
  })

  it("never executes repository hooks, fsmonitor or external diff for controlled isolated edits", async () => {
    const { started, first, outside } = await setup({ writable: true, isolation: true })
    await initializeRepository(first)
    const hooks = join(outside, "hooks")
    await mkdir(hooks)
    const marker = join(outside, "executed")
    const hook = join(hooks, "post-checkout")
    await writeFile(hook, `#!/bin/sh\nprintf 'ran' >> '${marker.replaceAll("\\", "/")}'\n`, { mode: 0o755 })
    await execFileAsync("git", ["-C", first, "config", "core.hooksPath", hooks])
    await execFileAsync("git", ["-C", first, "hook", "run", "post-checkout"])
    expect(await readFile(marker, "utf8")).toBe("ran")
    await rm(marker)
    await execFileAsync("git", ["-C", first, "config", "core.fsmonitor", hook])
    await execFileAsync("git", ["-C", first, "config", "diff.external", hook])
    await submit(started, "ses_no_hooks", isolated([{ path: "same.txt", kind: "update", baseText: "FIRST_FILE", targetText: "SAFE_EDIT" }]))
    const runs = await createWorkspaceStore(started.runtime.transport).listWorkspaceTaskRuns({})
    expect(runs[0]?.run).toMatchObject({ state: "released", outcome: "proposed" })
    await expect(stat(marker)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await readFile(join(first, "same.txt"), "utf8")).toBe("FIRST_FILE")
  })

  it.each(["clean", "smudge", "process"])("rejects executable Git %s filters without executing them or falling back", async (filter) => {
    const { started, first, outside } = await setup({ writable: true, isolation: true })
    await initializeRepository(first)
    const marker = join(outside, "filter-executed")
    const command = `printf 'ran' > '${marker.replaceAll("\\", "/")}'`
    await execFileAsync("git", ["-C", first, "config", `filter.unsafe.${filter}`, command])
    await writeFile(join(first, ".gitattributes"), "*.txt filter=unsafe\n")
    const turn = await submit(started, "ses_no_filter", isolated([{ path: "same.txt", kind: "update", baseText: "FIRST_FILE", targetText: "WRONG" }]))
    expect((await started.runtime.storage.listToolExecutions({ turnId: turn.id }))[0]?.state).toBe("failed")
    await expect(stat(marker)).rejects.toMatchObject({ code: "ENOENT" })
    const runs = await createWorkspaceStore(started.runtime.transport).listWorkspaceTaskRuns({})
    expect(runs[0]?.run.state).toBe("attention")
    expect(JSON.stringify(runs[0]?.run.failure)).toContain("executable Git filters")
    expect(await readFile(join(first, "same.txt"), "utf8")).toBe("FIRST_FILE")
    expect((await execFileAsync("git", ["-C", first, "branch", "--list", "wanex/runtime/*"])).stdout.trim()).toBe("")
  })

  it("retains the isolated worktree if executable filter configuration appears before collection", async () => {
    const { started, first, outside } = await setup({ writable: true, isolation: true })
    await initializeRepository(first)
    await writeFile(join(first, ".gitattributes"), "*.txt filter=unsafe\n")
    const marker = join(outside, "collection-filter-executed")
    const apply = WorkspaceRuntime.prototype.applyChangeSet
    vi.spyOn(WorkspaceRuntime.prototype, "applyChangeSet").mockImplementationOnce(async function (this: WorkspaceRuntime, request) {
      const result = await apply.call(this, request)
      await execFileAsync("git", ["-C", first, "config", "filter.unsafe.clean", `printf 'ran' > '${marker.replaceAll("\\", "/")}'`])
      return result
    })
    await submit(started, "ses_collection_filter", isolated([{ path: "same.txt", kind: "update", baseText: "FIRST_FILE", targetText: "PRESERVED" }]))
    const runs = await createWorkspaceStore(started.runtime.transport).listWorkspaceTaskRuns({})
    expect(runs[0]?.run.state).toBe("attention")
    expect(runs[0]?.run.proposalId).toBeUndefined()
    expect(JSON.stringify(runs[0]?.run.failure)).toContain("executable Git filters")
    await expect(stat(marker)).rejects.toMatchObject({ code: "ENOENT" })
    expect((await execFileAsync("git", ["-C", first, "branch", "--list", "wanex/runtime/*"])).stdout.trim()).not.toBe("")
    expect(await readFile(join(first, "same.txt"), "utf8")).toBe("FIRST_FILE")
  })

  it("keeps an admitted isolation directory and root after restart and selection changes", async () => {
    const { started, first, second, storeDir, workspace, provider } = await setup({ writable: true, isolation: true })
    await initializeRepository(first)
    await submit(started, "ses_isolated_restart", "hello")
    const text = isolated([{ path: "same.txt", kind: "update", baseText: "FIRST_FILE", targetText: "AFTER_RESTART" }])
    const prepared = await prepare(started, "ses_isolated_restart", "isolated_restart", text)
    await started.shell.dispose()
    const receipt = await started.runtime.storage.submitSessionTurn(prepared.request)
    prepared.context.commit()
    await started.workspace!.port.setContext({ sessionId: "ses_isolated_restart", expectedRevision: null, context: { rootIds: ["second"], cwd: second } })
    await createAssistantHostHandle(started).close()
    const restarted = await start(storeDir, provider.endpoint, { ...workspace, worktreeDirectory: join(second, "must-not-use") }, false, true)
    expect((await terminal(restarted, receipt.turn.id)).state).toBe("succeeded")
    const runs = await createWorkspaceStore(restarted.runtime.transport).listWorkspaceTaskRuns({})
    expect(runs).toHaveLength(1)
    expect(runs[0]?.run).toMatchObject({ state: "released", outcome: "proposed", rootIdentity: { rootId: "first" } })
    const replay = await restarted.runtime.storage.submitSessionTurn(prepared.request)
    expect(replay.turn.id).toBe(receipt.turn.id)
    expect(await createWorkspaceStore(restarted.runtime.transport).listWorkspaceTaskRuns({})).toHaveLength(1)
    expect(await readFile(join(first, "same.txt"), "utf8")).toBe("FIRST_FILE")
    await expect(stat(join(second, "must-not-use"))).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("rejects traversal and overlapping isolation directories before touching original files", async () => {
    const { started, first, outside, storeDir, workspace, provider } = await setup({ writable: true, isolation: true })
    await initializeRepository(first)
    const traversal = await submit(started, "ses_isolation_paths", isolated([{ path: "../secret.txt", kind: "create", targetText: "WRONG" }]))
    expect((await started.runtime.storage.listToolExecutions({ turnId: traversal.id }))[0]?.state).toBe("failed")
    expect(await readFile(join(outside, "secret.txt"), "utf8")).toBe("OUTSIDE_SECRET")
    await createAssistantHostHandle(started).close()
    const restarted = await start(storeDir, provider.endpoint, { ...workspace, worktreeDirectory: join(first, "must-not-create") }, false, true)
    const turn = await submit(restarted, "ses_overlap", isolated([{ path: "same.txt", kind: "update", baseText: "FIRST_FILE", targetText: "WRONG" }]))
    expect((await restarted.runtime.storage.listToolExecutions({ turnId: turn.id }))[0]?.state).toBe("failed")
    await expect(stat(join(first, "must-not-create"))).rejects.toMatchObject({ code: "ENOENT" })
    expect(await readFile(join(first, "same.txt"), "utf8")).toBe("FIRST_FILE")
  })

  it("preserves the prepared worktree for attention when authority is revoked after its transaction", async () => {
    const { started, first, storeDir } = await setup({ writable: true, isolation: true })
    await initializeRepository(first)
    const apply = WorkspaceRuntime.prototype.applyChangeSet
    vi.spyOn(WorkspaceRuntime.prototype, "applyChangeSet").mockImplementationOnce(async function (this: WorkspaceRuntime, request) {
      const result = await apply.call(this, request)
      const authority = await started.workspace!.port.readAuthority()
      await started.workspace!.port.setAuthority({ expectedRevision: authority.revision, roots: [] })
      return result
    })
    await started.shell.submitConversationOperation({ sessionId: "ses_isolation_revoke", text: isolated([{ path: "same.txt", kind: "update", baseText: "FIRST_FILE", targetText: "PRESERVED_EDIT" }]) })
    const turn = (await started.runtime.storage.listSessionTurns({ sessionId: "ses_isolation_revoke" }))[0]!
    expect((await terminal(started, turn.id)).state).toBe("failed")
    const runs = await createWorkspaceStore(started.runtime.transport).listWorkspaceTaskRuns({})
    expect(runs).toHaveLength(1)
    expect(runs[0]?.run.state).toBe("attention")
    expect(runs[0]?.run.proposalId).toBeUndefined()
    const worktreeList = (await execFileAsync("git", ["-C", first, "worktree", "list", "--porcelain", "-z"])).stdout
    const paths = worktreeList.split("\0").filter((entry) => entry.startsWith("worktree ")).map((entry) => entry.slice(9))
    const isolatedRoot = paths.find((path) => path.includes("workspace-worktrees"))
    expect(isolatedRoot).toBeDefined()
    expect(isolatedRoot).toContain(await realpath(storeDir))
    expect(await readFile(join(isolatedRoot!, "same.txt"), "utf8")).toBe("PRESERVED_EDIT")
    expect(await readFile(join(first, "same.txt"), "utf8")).toBe("FIRST_FILE")
  })

  it.each([WorkspaceTransactionCleanupRequiredError, WorkspaceTransactionRecoveryRequiredError])("retains worktree evidence for %s instead of collecting an uncertain transaction", async (Failure) => {
    const { started, first } = await setup({ writable: true, isolation: true })
    await initializeRepository(first)
    const apply = WorkspaceRuntime.prototype.applyChangeSet
    vi.spyOn(WorkspaceRuntime.prototype, "applyChangeSet").mockImplementationOnce(async function (this: WorkspaceRuntime, request) {
      const applied = await apply.call(this, request)
      throw new Failure(applied.transaction.snapshot.transaction.id, new Error("injected settlement failure"))
    })
    await submit(started, "ses_transaction_attention", isolated([{ path: "same.txt", kind: "update", baseText: "FIRST_FILE", targetText: "PRESERVED_EDIT" }]))
    const runs = await createWorkspaceStore(started.runtime.transport).listWorkspaceTaskRuns({})
    expect(runs).toHaveLength(1)
    expect(runs[0]?.run.state).toBe("attention")
    expect(runs[0]?.run.proposalId).toBeUndefined()
    expect((await execFileAsync("git", ["-C", first, "branch", "--list", "wanex/runtime/*"])).stdout.trim()).not.toBe("")
    expect(await readFile(join(first, "same.txt"), "utf8")).toBe("FIRST_FILE")
  })

  it("cancels a running isolated tool through the Turn and settles its Task before closing the Host", async () => {
    const { started, first } = await setup({ writable: true, isolation: true })
    await initializeRepository(first)
    const apply = WorkspaceRuntime.prototype.applyChangeSet
    let notifyEntered!: () => void
    const entered = new Promise<void>((resolve) => { notifyEntered = resolve })
    vi.spyOn(WorkspaceRuntime.prototype, "applyChangeSet").mockImplementationOnce(async function (this: WorkspaceRuntime, request) {
      notifyEntered()
      if (!request.signal?.aborted) {
        await new Promise<void>((resolve) => request.signal!.addEventListener("abort", () => resolve(), { once: true }))
      }
      return await apply.call(this, request)
    })
    await started.shell.submitConversationOperation({ sessionId: "ses_isolation_cancel", text: isolated([{ path: "same.txt", kind: "update", baseText: "FIRST_FILE", targetText: "CANCELLED_EDIT" }]) })
    await entered
    await started.shell.cancelTrackedConversationOperation({ sessionId: "ses_isolation_cancel", reason: "user stopped isolated changes" })
    const storage = createWorkspaceStore(started.runtime.transport)
    await expect.poll(async () => (await storage.listWorkspaceTaskRuns({}))[0]?.run.state, { timeout: 10_000 }).toBe("released")
    const runs = await storage.listWorkspaceTaskRuns({})
    expect(runs[0]?.run.outcome).toBe("cancelled")
    expect(runs[0]?.run.proposalId).toBeUndefined()
    const transactions = await storage.listWorkspaceChangeTransactions({ workspaceId: `isolated:${digest(runs[0]!.run.id)}` })
    expect(transactions).toHaveLength(1)
    expect(transactions.every((entry) => entry.transaction.state === "rolled_back")).toBe(true)
    expect(await readFile(join(first, "same.txt"), "utf8")).toBe("FIRST_FILE")
    expect((await execFileAsync("git", ["-C", first, "branch", "--list", "wanex/runtime/*"])).stdout.trim()).toBe("")
    await createAssistantHostHandle(started).close()
  })

  it("exposes the same journey through the existing authenticated Web conversation entry", async () => {
    const { started, storeDir, workspace, provider, first, second } = await setup()
    await createAssistantHostHandle(started).close()
    const app = await startAssistantWebApp({
      browserAssets,
      storage: { kind: "store-dir", storeDir }, serviceBin, workspace,
      modelEndpoints: { endpoints: [provider.endpoint], activeEndpointId: provider.endpoint.id },
      secretResolver: new SecretResolver([new EnvSecretProvider({ WORKSPACE_TEST_KEY: "test-only" })]),
      web: { hostname: "127.0.0.1", port: 0 }
    })
    closers.push(() => app.close())
    const html = await (await fetch(app.url)).text()
    const token = /data-host-session-token="([^"]+)"/u.exec(html)?.[1]
    expect(token).toBeDefined()
    for (const text of ["hello", read([join(first, "same.txt"), join(second, "same.txt")])]) {
      const response = await fetch(`${app.url}/wanex/assistant/request`, {
        method: "POST", headers: { "content-type": "application/json", "x-wanex-host-session": token! },
        body: JSON.stringify({ kind: "web.request", operation: "dispatchAction", requestId: crypto.randomUUID(), action: { type: "submit-conversation", input: { text } } })
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ ok: true, actionResult: { ok: true } })
      await expect.poll(async () => (await app.readSnapshot()).web.conversation.state, { timeout: 10_000 }).toBe("succeeded")
    }
    const last = JSON.stringify(provider.requests.at(-1))
    expect(last).toContain("hello")
    expect(last).toContain("FIRST_FILE")
    expect(last).toContain("SECOND_FILE")
  })

  it("reads two authorized directories in the original projectless conversation, without Git or project selection", async () => {
    const fixture = await setup()
    const { started, first, second, outside, provider } = fixture
    await submit(started, "ses_workspace", "hello")
    const initial = await started.runtime.storage.listSessionTurns({ sessionId: "ses_workspace" })
    await submit(started, "ses_workspace", read([join(first, "same.txt"), join(second, "same.txt")]))
    const replay = JSON.stringify(provider.requests.at(-1))
    expect(replay).toContain("FIRST_FILE")
    expect(replay).toContain("SECOND_FILE")
    expect(replay).toContain("FIRST_RULE")
    expect(replay).toContain("SECOND_RULE")
    expect(replay).toContain("hello")
    const turns = await started.runtime.storage.listSessionTurns({ sessionId: "ses_workspace" })
    expect(turns).toHaveLength(2)
    expect(turns[0]!.executionBinding).toEqual(initial[0]!.executionBinding)
    expect(turns[1]!.executionBinding.executionEnvironment?.policy.process).toMatchObject({ oneShot: false, managed: false })
    expect(await started.workspace!.port.readContext("ses_workspace")).toEqual({ revision: null, context: { rootIds: [] } })

    await submit(started, "ses_workspace", read([join(outside, "secret.txt"), join(first, "escape.txt")]))
    const denied = JSON.stringify(provider.requests.at(-1))
    expect(denied).not.toContain("OUTSIDE_SECRET")
    expect(denied).toMatch(/not authorized|admitted root|escapes/)
    const executions = await started.runtime.storage.listToolExecutions({ turnId: (await started.runtime.storage.listSessionTurns({ sessionId: "ses_workspace" })).at(-1)!.id })
    expect(executions).toHaveLength(2)
    expect(executions.every((execution) => execution.state === "failed")).toBe(true)
  })

  it("reconciles a persisted approval before restarting the Runtime worker", async () => {
    const { started, storeDir, workspace, provider, first } = await setup()
    const sessionId = "ses_workspace_approval_restart"
    const submission = await started.shell.submitConversationOperation({
      sessionId,
      text: `CALL:${JSON.stringify({
        name: "workspace_request_access",
        input: {
          path: first,
          effects: ["read"],
          scope: "session",
          reason: "read the dynamically authorized workspace"
        }
      })}`
    })
    if (submission.kind.includes("rejected")) throw new Error(JSON.stringify(submission))
    await expect.poll(async () => (await started.runtime.storage.listSessionTurns({ sessionId })).length).toBe(1)
    const turn = (await started.runtime.storage.listSessionTurns({ sessionId }))[0]!
    await expect.poll(async () => (await started.runtime.storage.getSessionTurn(turn.id))?.state).toBe("waiting")
    const pendingExecution = (await started.runtime.storage.listToolExecutions({ turnId: turn.id }))[0]!
    expect(pendingExecution.state).toBe("approval_required")
    expect((await createWorkspaceAccessStore(started.runtime.storage, { hostId: "test" }).listRequests({ sessionId }))[0]?.state).toBe("pending")

    await createAssistantHostHandle(started).close()
    const approvalStorage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    try {
      const approved = await approvalStorage.resolveToolExecutionApproval({
        executionId: pendingExecution.id,
        expectedApprovalRevision: pendingExecution.approvalRevision,
        decision: "approve_once",
        principalId: pendingExecution.principalId,
        reason: "approve before Host restart",
        idempotencyKey: "workspace-approval-restart"
      })
      expect(approved.execution.state).toBe("approved")
    } finally {
      await approvalStorage.dispose()
    }

    const restarted = await start(storeDir, provider.endpoint, workspace)
    const completed = await terminal(restarted, turn.id)
    expect(completed.state).toBe("succeeded")
    expect((await restarted.runtime.storage.listSessionTurns({ sessionId }))).toHaveLength(1)
    const executions = await restarted.runtime.storage.listToolExecutions({ turnId: turn.id })
    expect(executions).toHaveLength(1)
    expect(executions[0]).toMatchObject({ state: "succeeded", toolName: "workspace_request_access" })
    const access = createWorkspaceAccessStore(restarted.runtime.storage, { hostId: "test" })
    const request = (await access.listRequests({ sessionId }))[0]
    expect(request).toMatchObject({ state: "approved" })
    expect(request?.grantId).toBeDefined()
    expect(provider.requests.filter((body) => JSON.stringify(body).includes("workspace_request_access"))).toHaveLength(2)
  })

  it("keeps configured roots read-only while publishing the explicit access flow", async () => {
    const { started } = await setup()
    await submit(started, "ses_read_only", "hello")
    const prepared = await prepare(started, "ses_read_only", "read-only")
    const names = ((prepared.request.executionBinding.toolSnapshot as { tools?: readonly { descriptor?: { name?: string } }[] }).tools ?? [])
      .map((tool) => tool.descriptor?.name)
    expect(names).toContain("workspace_read_text")
    expect(names).toContain("workspace_review_changeset")
    expect(names).toContain("workspace_request_access")
    expect(names).not.toContain("workspace_git_capability")
    expect(names).toContain("workspace_apply_changeset")
    expect(names).not.toContain("workspace_undo_changeset")
    expect(names).not.toContain("workspace_reapply_changeset")
    prepared.context.rollback()
  })

  it("does not publish isolated changes in a read-only Workspace-capable Host", async () => {
    const { started } = await setup({ isolation: true })
    await submit(started, "ses_read_only_isolation", "hello")
    const prepared = await prepare(started, "ses_read_only_isolation", "read-only-isolation")
    const names = ((prepared.request.executionBinding.toolSnapshot as { tools?: readonly { descriptor?: { name?: string } }[] }).tools ?? [])
      .map((tool) => tool.descriptor?.name)
    expect(names).toContain("workspace_git_capability")
    expect(names).toContain("workspace_request_access")
    expect(names).not.toContain("workspace_prepare_isolated_changes")
    expect(names).toContain("workspace_apply_changeset")
    prepared.context.rollback()
  })

  it("publishes a read-only Git capability probe without creating repository state", async () => {
    const { started, first, provider } = await setup({ gitCapability: true })
    await submit(started, "ses_git_capability", "hello")
    const prepared = await prepare(started, "ses_git_capability", "git-capability", `CALL:${JSON.stringify({
      name: "workspace_git_capability",
      input: { rootId: "first" }
    })}`)
    const names = ((prepared.request.executionBinding.toolSnapshot as { tools?: readonly { descriptor?: { name?: string } }[] }).tools ?? [])
      .map((tool) => tool.descriptor?.name)
    expect(names).toContain("workspace_git_capability")
    prepared.context.commit()
    const receipt = await started.runtime.storage.submitSessionTurn(prepared.request)
    await terminal(started, receipt.turn.id)
    const result = JSON.stringify(provider.requests.at(-1))
    expect(result).toContain("not_repository")
    expect(result).toContain("git_worktree")
    expect(result).toContain('\\"strategy\\":\\"direct\\"')
    expect(await hasGitDirectory(first)).toBe(false)
  })

  it("reports a real repository as worktree-capable without changing Git state", async () => {
    const { started, first, provider } = await setup({ gitCapability: true })
    await execFileAsync("git", ["init", "--quiet", first])
    const headBefore = await readFile(join(first, ".git", "HEAD"), "utf8")
    await submit(started, "ses_git_available", `CALL:${JSON.stringify({
      name: "workspace_git_capability",
      input: { rootId: "first" }
    })}`)
    const result = JSON.stringify(provider.requests.at(-1))
    expect(result).toContain('\\"status\\":\\"available\\"')
    expect(result).toContain('\\"strategy\\":\\"git_worktree\\"')
    expect(await readFile(join(first, ".git", "HEAD"), "utf8")).toBe(headBefore)
  })

  it("supports cwd and root IDs without expanding authority, and isolates Session selections", async () => {
    const { started, first, second, outside, provider } = await setup()
    await submit(started, "ses_selection", "hello")
    await submit(started, "ses_other", "hello")
    await expect(started.workspace!.port.setContext({ sessionId: "ses_selection", expectedRevision: null, context: { rootIds: ["outside"] } })).rejects.toThrow("not authorized")
    await expect(started.workspace!.port.setContext({ sessionId: "ses_selection", expectedRevision: null, context: { rootIds: [], cwd: outside } })).rejects.toThrow("not authorized")
    await started.workspace!.port.setContext({ sessionId: "ses_selection", expectedRevision: null, context: { rootIds: ["first"], cwd: first } })
    await submit(started, "ses_selection", read(["same.txt", { path: "same.txt", rootId: "second" }]))
    expect(JSON.stringify(provider.requests.at(-1))).toContain("SECOND_FILE")
    expect(JSON.stringify(provider.requests.at(-1))).toContain("FIRST_FILE")
    expect(await started.workspace!.port.readContext("ses_other")).toEqual({ revision: null, context: { rootIds: [] } })
    await submit(started, "ses_other", read(["same.txt"]))
    expect(JSON.stringify(provider.requests.at(-1))).toContain("ambiguous")
    await expect(started.workspace!.port.setContext({ sessionId: "ses_selection", expectedRevision: null, context: { rootIds: ["second"], cwd: second } })).rejects.toThrow("revision conflict")
  })

  it("rejects a stale prepared admission atomically and returns existing idempotent receipts after updates", async () => {
    const { started } = await setup()
    await submit(started, "ses_atomic", "hello")
    const prepared = await prepare(started, "ses_atomic", "atomic")
    await started.workspace!.port.setContext({ sessionId: "ses_atomic", expectedRevision: null, context: { rootIds: ["first"] } })
    await expect(started.runtime.storage.submitSessionTurn(prepared.request)).rejects.toThrow("admission condition changed")
    expect(await started.runtime.storage.getSessionTurn(prepared.request.turnId!)).toBeNull()
    expect((await started.runtime.storage.listSessionInputs({ sessionId: "ses_atomic" })).some((input) => input.id === prepared.request.id)).toBe(false)
    prepared.context.rollback()
    const fresh = await prepare(started, "ses_atomic", "fresh")
    const receipt = await started.runtime.storage.submitSessionTurn(fresh.request)
    fresh.context.commit()
    await started.workspace!.port.setContext({ sessionId: "ses_atomic", expectedRevision: 1, context: { rootIds: ["second"] } })
    const repeated = await started.runtime.storage.submitSessionTurn(fresh.request)
    expect(repeated.turn.id).toBe(receipt.turn.id)
    expect(repeated.turn.executionBinding).toEqual(receipt.turn.executionBinding)
  })

  it("reconstructs a queued generation after restart even when files and selection change", async () => {
    const { started, first, second, provider, storeDir, workspace } = await setup()
    await submit(started, "ses_restart", "hello")
    await started.workspace!.port.setContext({ sessionId: "ses_restart", expectedRevision: null, context: { rootIds: ["first"], cwd: first } })
    const prepared = await prepare(started, "ses_restart", "restart", read([join(first, "same.txt")]))
    await started.shell.dispose()
    const receipt = await started.runtime.storage.submitSessionTurn(prepared.request)
    prepared.context.commit()
    await started.workspace!.port.setContext({ sessionId: "ses_restart", expectedRevision: 1, context: { rootIds: ["second"], cwd: second } })
    await writeFile(join(first, "AGENTS.md"), "CHANGED_RULE_MUST_NOT_REPLACE_ADMITTED_RULE")
    await createAssistantHostHandle(started).close()
    const restarted = await start(storeDir, provider.endpoint, workspace)
    await terminal(restarted, receipt.turn.id)
    expect(JSON.stringify(provider.requests.at(-1))).toContain("FIRST_RULE")
    expect(JSON.stringify(provider.requests.at(-1))).not.toContain("CHANGED_RULE_MUST_NOT_REPLACE_ADMITTED_RULE")
    expect((await restarted.runtime.storage.getSessionTurn(receipt.turn.id))?.executionBinding).toEqual(receipt.turn.executionBinding)
    expect((await restarted.workspace!.port.readContext("ses_restart")).context.rootIds).toEqual(["second"])
  })

  it("rejects revoked authority on queued work and does not restore initial roots on restart", async () => {
    const { started, provider, storeDir, workspace, first } = await setup()
    await submit(started, "ses_revoke", "hello")
    const prepared = await prepare(started, "ses_revoke", "revoke", read([join(first, "same.txt")]))
    await started.shell.dispose()
    const receipt = await started.runtime.storage.submitSessionTurn(prepared.request)
    prepared.context.commit()
    const authority = await started.workspace!.port.readAuthority()
    await started.workspace!.port.setAuthority({ expectedRevision: authority.revision, roots: [] })
    await createAssistantHostHandle(started).close()
    const previousCalls = provider.requests.length
    const restarted = await start(storeDir, provider.endpoint, workspace)
    const turn = await terminal(restarted, receipt.turn.id)
    expect(turn.state).toBe("failed")
    expect(JSON.stringify(turn.error)).toContain("revoked")
    expect(provider.requests).toHaveLength(previousCalls)
    expect((await restarted.workspace!.port.readAuthority()).roots).toEqual([])
  })

  it("inherits the parent's immutable roots rather than the parent's new selection", async () => {
    const { started, first } = await setup()
    await submit(started, "ses_parent", "hello")
    await started.workspace!.port.setContext({ sessionId: "ses_parent", expectedRevision: null, context: { rootIds: ["first"], cwd: first } })
    const parent = await prepare(started, "ses_parent", "parent")
    await started.workspace!.port.setContext({ sessionId: "ses_parent", expectedRevision: 1, context: { rootIds: ["second"] } })
    const child = await started.shell.trustedExecution.prepareExecutionBinding({
      sessionId: "ses_child", inputId: "input_child", turnId: "turn_child",
      content: [{ id: "part_child", type: "text", text: read(["same.txt"]) }],
      inheritedContextBinding: parent.request.executionBinding
    })
    expect(child.binding.toolSnapshot).toEqual(parent.request.executionBinding.toolSnapshot)
    expect(child.binding.contextEvidence).toEqual(parent.request.executionBinding.contextEvidence)
    expect(child.binding.admissionConditions?.some((condition) => condition.key.includes(".session."))).toBe(false)
    await started.runtime.storage.createSession({ id: "ses_child", kind: "agent" })
    const receipt = await started.runtime.storage.submitSessionTurn({
      sessionId: "ses_child", id: "input_child", turnId: "turn_child", principalId: "workspace-test", idempotencyKey: "child",
      content: [{ id: "part_child", type: "text", text: read(["same.txt"]) }], executionBinding: child.binding
    })
    child.context.commit()
    const completed = await terminal(started, receipt.turn.id)
    expect(completed.state, JSON.stringify(completed.error)).toBe("succeeded")
    parent.context.rollback()
  })

  it("fences authority revocation after a real in-flight file read before publishing its bytes", async () => {
    const { started, first, provider } = await setup()
    await submit(started, "ses_inflight", "hello")
    const invoke = WorkspaceReadTextTool.prototype.invoke
    let readCompleted = false
    vi.spyOn(WorkspaceReadTextTool.prototype, "invoke").mockImplementationOnce(async function (this: WorkspaceReadTextTool, invocation) {
      const result = await invoke.call(this, invocation)
      expect(JSON.stringify(result)).toContain("FIRST_FILE")
      readCompleted = true
      const authority = await started.workspace!.port.readAuthority()
      await started.workspace!.port.setAuthority({ expectedRevision: authority.revision, roots: [] })
      return result
    })
    await started.shell.submitConversationOperation({ sessionId: "ses_inflight", text: read([join(first, "same.txt")]) })
    const turn = (await started.runtime.storage.listSessionTurns({ sessionId: "ses_inflight" })).at(-1)!
    expect((await terminal(started, turn.id)).state).toBe("failed")
    expect(readCompleted).toBe(true)
    expect(JSON.stringify(provider.requests)).not.toContain("FIRST_FILE")
    const executions = await started.runtime.storage.listToolExecutions({ turnId: turn.id })
    expect(executions).toHaveLength(1)
    expect(executions[0]!.state).toBe("failed")
    expect(JSON.stringify(executions[0]!.content)).not.toContain("FIRST_FILE")
  })

  it("rejects delete/recreate ABA despite an identical config revision", async () => {
    const { started } = await setup()
    await submit(started, "ses_aba", "hello")
    await started.workspace!.port.setContext({ sessionId: "ses_aba", expectedRevision: null, context: { rootIds: ["first"] } })
    const prepared = await prepare(started, "ses_aba", "aba")
    const condition = prepared.request.executionBinding.admissionConditions!.find((item) => item.key.includes(".session."))!
    await started.runtime.storage.compareAndApplyConfigMutations({ conditions: [{ key: condition.key, expectedRevision: 1 }], puts: [], deletes: [condition.key] })
    await started.workspace!.port.setContext({ sessionId: "ses_aba", expectedRevision: null, context: { rootIds: ["second"] } })
    expect((await started.runtime.storage.getConfigEntry(condition.key))!.revision).toBe(1)
    await expect(started.runtime.storage.submitSessionTurn(prepared.request)).rejects.toThrow("admission condition changed")
    expect(await started.runtime.storage.getSessionTurn(prepared.request.turnId!)).toBeNull()
    prepared.context.rollback()
  })

  it("preserves fractional evidence and canonical hashes through the native JSON boundary", async () => {
    const { started } = await setup()
    const value = { "10": 1e21, "2": 0.000001, "\ue000": 1e-7, "\ud83d\ude00": 1773788458401.1233, integer: 3 }
    await started.runtime.storage.putConfig("workspace.canonical.test", value)
    const stored = (await started.runtime.storage.getConfigEntry("workspace.canonical.test"))!.value
    expect(stored).toEqual(value)
    expect(digest(stored)).toBe(digest(value))
    expect(digest(value)).toBe("bfa937b992d6105aba08bf2540550faa1de6deed23857bf9350d7a8845d0775d")
    expect(digest(value)).toBe(digest({ ...value, integer: 3.0 }))
  })

  it.each(["missing", "corrupt"])("fails closed when the admitted generation is %s after restart", async (kind) => {
    const { started, storeDir, workspace, provider } = await setup()
    await submit(started, "ses_broken", "hello")
    const prepared = await prepare(started, "ses_broken", "broken")
    await started.shell.dispose()
    const receipt = await started.runtime.storage.submitSessionTurn(prepared.request)
    prepared.context.commit()
    const condition = receipt.turn.executionBinding.admissionConditions!.find((entry) => entry.key.includes(".generation."))!
    const record = (await started.runtime.storage.getConfigEntry(condition.key))!
    await started.runtime.storage.compareAndApplyConfigMutations({
      conditions: [{ key: record.key, expectedRevision: record.revision }],
      puts: kind === "corrupt" ? [{ key: record.key, value: {} }] : [],
      deletes: kind === "missing" ? [record.key] : []
    })
    await createAssistantHostHandle(started).close()
    const before = provider.requests.length
    const restarted = await start(storeDir, provider.endpoint, workspace)
    const result = await terminal(restarted, receipt.turn.id)
    expect(result.state).toBe("failed")
    expect(JSON.stringify(result.error)).toContain("missing or corrupt")
    expect(provider.requests).toHaveLength(before)
  })

  it("freezes nested cwd instructions and supports concurrent independent Sessions", async () => {
    const { started, first, second, provider } = await setup()
    const nested = join(first, "nested")
    await mkdir(nested)
    await writeFile(join(nested, "AGENTS.md"), "NESTED_RULE")
    await writeFile(join(nested, "same.txt"), "NESTED_FILE")
    await Promise.all([submit(started, "ses_nested", "hello"), submit(started, "ses_parallel", "hello")])
    await started.workspace!.port.setContext({ sessionId: "ses_nested", expectedRevision: null, context: { rootIds: ["first"], cwd: nested } })
    await Promise.all([
      submit(started, "ses_nested", read(["same.txt"])),
      submit(started, "ses_parallel", read([join(second, "same.txt")]))
    ])
    expect(JSON.stringify(provider.requests)).toContain("NESTED_FILE")
    expect(provider.requests.some((body) => body.messages.some((message) =>
      typeof message.content === "string" && message.content.includes(`first:${join("nested", "AGENTS.md")}`)))).toBe(true)
    const other = provider.requests.filter((body) => body.messages.some((message) => message.role === "user" && message.content === read([join(second, "same.txt")])))
    expect(other.length).toBeGreaterThan(0)
    expect(JSON.stringify(other.map((body) => body.messages))).not.toContain("NESTED_RULE")
  })

  it("bounds file and scoped-context output without silently dropping project rules", async () => {
    const { started, first, provider } = await setup()
    await writeFile(join(first, "large.txt"), "z".repeat(90_000))
    await submit(started, "ses_bounded", read([join(first, "large.txt")]))
    const turn = (await started.runtime.storage.listSessionTurns({ sessionId: "ses_bounded" })).at(-1)!
    const executions = await started.runtime.storage.listToolExecutions({ turnId: turn.id })
    expect(Buffer.byteLength(JSON.stringify(executions[0]!.content))).toBeLessThan(70_000)
    await writeFile(join(first, "AGENTS.md"), "RULE".repeat(20_000))
    await submit(started, "ses_large_context", read([join(first, "same.txt")]))
    expect(JSON.stringify(provider.requests.at(-1))).toContain("scoped context exceeds")
    expect(JSON.stringify(provider.requests.at(-1))).not.toContain("FIRST_FILE")
  })

  it("does not activate changed skill bodies from an admitted catalog after restart", async () => {
    const { started, first, storeDir, workspace, provider } = await setup()
    const skill = join(first, ".agents", "skills", "review")
    await mkdir(skill, { recursive: true })
    const source = (body: string) => `---\nname: review\ndescription: Review files.\n---\n${body}\n`
    await writeFile(join(skill, "SKILL.md"), source("FROZEN_SKILL_BODY"))
    await submit(started, "ses_skill", "hello")
    const text = 'CALL:{"name":"workspace_activate_skill","input":{"rootId":"first","name":"review"}}'
    const prepared = await prepare(started, "ses_skill", "skill", text)
    await started.shell.dispose()
    const receipt = await started.runtime.storage.submitSessionTurn(prepared.request)
    prepared.context.commit()
    await writeFile(join(skill, "SKILL.md"), source("CHANGED_SKILL_MUST_NOT_RUN"))
    await createAssistantHostHandle(started).close()
    const restarted = await start(storeDir, provider.endpoint, workspace)
    expect((await terminal(restarted, receipt.turn.id)).state).toBe("succeeded")
    expect(JSON.stringify(provider.requests.at(-1))).toContain("skill_source_changed")
    expect(JSON.stringify(provider.requests.at(-1))).not.toContain("CHANGED_SKILL_MUST_NOT_RUN")
  })

  it("gives the local CLI an empty Workspace authority without granting a file", async () => {
    const provider = await providerFixture()
    const started = await start(await directory(), provider.endpoint)
    await submit(started, "ses_no_files", "hello")
    expect(JSON.stringify(provider.requests.at(-1))).not.toContain("workspace_read_text")
    expect(parseLocalCliOptions({ cwd: process.cwd(), artifactRoot: process.cwd(), args: [] }).workspace).toEqual({ hostId: "local-assistant" })
    const options = parseLocalCliOptions({ cwd: process.cwd(), artifactRoot: process.cwd(), args: ["--workspace-host-id", "local", "--workspace-roots-json", '[{"id":"repo","path":"."}]'] })
    expect(options.workspace).toEqual({ hostId: "local", initialRoots: [{ id: "repo", path: process.cwd() }] })
    const writable = parseLocalCliOptions({ cwd: process.cwd(), artifactRoot: process.cwd(), args: ["--workspace-host-id", "local", "--workspace-roots-json", '[{"id":"repo","path":".","effects":["read","write","create","remove"]}]'] })
    expect(writable.workspace?.initialRoots?.[0]?.effects).toEqual(["read", "write", "create", "remove"])
    expect(() => parseLocalCliOptions({ cwd: process.cwd(), artifactRoot: process.cwd(), args: ["--workspace-host-id", "local", "--workspace-roots-json", '[{"id":"repo","path":".","effects":["read",1]}]'] })).toThrow("effects must be an array of strings")
    expect(() => parseLocalCliOptions({ cwd: process.cwd(), artifactRoot: process.cwd(), args: ["--workspace-roots-json", "[]"] })).toThrow("explicit workspace-host-id")
  })

  it("applies, reviews, undoes, and reapplies independent changesets across multiple roots without Git", async () => {
    const { started, first, second, provider } = await setup({ writable: true })
    await submit(started, "ses_edit", "hello")
    const applyTurn = await submit(started, "ses_edit", `CALL:${JSON.stringify({
      name: "workspace_apply_changeset",
      input: {
        title: "Update two roots",
        changes: [
          { rootId: "first", path: "same.txt", kind: "update", baseText: "FIRST_FILE", targetText: "FIRST_CHANGED" },
          { rootId: "first", path: "created.txt", kind: "create", targetText: "CREATED_FILE" },
          { rootId: "first", path: "remove.txt", kind: "delete", baseText: "REMOVE_FILE" },
          { rootId: "second", path: "same.txt", kind: "update", baseText: "SECOND_FILE", targetText: "SECOND_CHANGED" }
        ]
      }
    })}`)
    const applyExecutions = await started.runtime.storage.listToolExecutions({ turnId: applyTurn.id })
    expect(JSON.stringify(applyExecutions)).toContain('"outcome":"succeeded"')
    await expect(readFile(join(first, "same.txt"), "utf8")).resolves.toBe("FIRST_CHANGED")
    await expect(readFile(join(first, "created.txt"), "utf8")).resolves.toBe("CREATED_FILE")
    await expect(readFile(join(first, "remove.txt"), "utf8")).rejects.toThrow()
    await expect(readFile(join(second, "same.txt"), "utf8")).resolves.toBe("SECOND_CHANGED")
    expect(await hasGitDirectory(first)).toBe(false)
    expect(await hasGitDirectory(second)).toBe(false)

    const changeSets = await createWorkspaceStore(started.runtime.transport).listWorkspaceChangeSets({})
    const firstChangeSet = changeSets.find((item) => item.workspaceId.endsWith(":first"))
    const secondChangeSet = changeSets.find((item) => item.workspaceId.endsWith(":second"))
    expect(firstChangeSet?.id).toBeDefined()
    expect(secondChangeSet?.id).toBeDefined()

    await submit(started, "ses_edit", `CALL:${JSON.stringify({
      name: "workspace_review_changeset",
      input: { rootId: "first", changeSetId: firstChangeSet!.id }
    })}`)
    expect(JSON.stringify(provider.requests.at(-1))).toContain(firstChangeSet!.id)

    await submit(started, "ses_edit", `CALL:${JSON.stringify({
      name: "workspace_undo_changeset",
      input: { rootId: "first", changeSetId: firstChangeSet!.id }
    })}`)
    await expect(readFile(join(first, "same.txt"), "utf8")).resolves.toBe("FIRST_FILE")
    await expect(readFile(join(first, "created.txt"), "utf8")).rejects.toThrow()
    await expect(readFile(join(first, "remove.txt"), "utf8")).resolves.toBe("REMOVE_FILE")
    await expect(readFile(join(second, "same.txt"), "utf8")).resolves.toBe("SECOND_CHANGED")

    await submit(started, "ses_edit", `CALL:${JSON.stringify({
      name: "workspace_reapply_changeset",
      input: { rootId: "first", changeSetId: firstChangeSet!.id }
    })}`)
    await expect(readFile(join(first, "same.txt"), "utf8")).resolves.toBe("FIRST_CHANGED")
    await expect(readFile(join(first, "created.txt"), "utf8")).resolves.toBe("CREATED_FILE")
    await expect(readFile(join(first, "remove.txt"), "utf8")).rejects.toThrow()

    await writeFile(join(first, "same.txt"), "EXTERNAL_EDIT")
    const conflictTurn = await submit(started, "ses_edit", `CALL:${JSON.stringify({
      name: "workspace_undo_changeset",
      input: { rootId: "first", changeSetId: firstChangeSet!.id }
    })}`)
    await expect(readFile(join(first, "same.txt"), "utf8")).resolves.toBe("EXTERNAL_EDIT")
    const executions = await started.runtime.storage.listToolExecutions({ turnId: conflictTurn.id })
    expect(JSON.stringify(executions)).toContain("conflicted")
  })

  it("does not grant file authority to unrelated non-interactive admissions", async () => {
    const { started } = await setup()
    for (const kind of ["scheduler", "connector", "agent", "system"]) {
      const prepared = await started.shell.trustedExecution.prepareExecutionBinding({
        sessionId: `ses_${kind}`, inputId: `input_${kind}`, turnId: `turn_${kind}`, origin: { kind },
        content: [{ id: `part_${kind}`, type: "text", text: "read a file" }]
      })
      expect(JSON.stringify(prepared.binding.toolSnapshot)).not.toContain("workspace_read_text")
      expect(prepared.binding.executionEnvironment).toBeUndefined()
      prepared.context.rollback()
    }
  })

  it("rejects an explicit environment that conflicts with Host-resolved authority", async () => {
    const { started } = await setup()
    await submit(started, "ses_environment", "hello")
    const prepared = await prepare(started, "ses_environment", "environment")
    const environment = prepared.request.executionBinding.executionEnvironment!
    for (const executionEnvironment of [
      { ...environment, environmentId: "another-host" },
      { ...environment, policy: { ...environment.policy, filesystem: { ...environment.policy.filesystem, maxReadBytes: 1 } } }
    ]) {
      await expect(started.shell.trustedExecution.prepareExecutionBinding({
        sessionId: "ses_environment", inputId: "input_conflict", turnId: "turn_conflict",
        content: [{ id: "part_conflict", type: "text", text: "read files" }], executionEnvironment
      })).rejects.toThrow(/execution environment/)
    }
    prepared.context.rollback()
  })

  it("canonicalizes aliases without expanding nested authority or accepting conflicting root IDs", async () => {
    const { started, first } = await setup()
    const nested = join(first, "nested")
    await mkdir(nested)
    const authority = await started.workspace!.port.readAuthority()
    const deduplicated = await started.workspace!.port.setAuthority({ expectedRevision: authority.revision, roots: [{ id: "z-alias", path: join(first, ".") }, { id: "a-primary", path: first }] })
    expect(deduplicated.roots).toEqual([{ id: "a-primary", path: await realpath(first) }])
    await expect(started.workspace!.port.setAuthority({ expectedRevision: deduplicated.revision, roots: [{ id: "parent", path: first }, { id: "child", path: nested }] })).rejects.toThrow("non-overlapping")
    await expect(started.workspace!.port.setAuthority({ expectedRevision: deduplicated.revision, roots: [{ id: "same", path: first }, { id: "same", path: nested }] })).rejects.toThrow("unique")
    await expect(started.workspace!.port.setAuthority({
      expectedRevision: deduplicated.revision,
      roots: [{ id: "read", path: first, effects: ["read"] }, { id: "write", path: join(first, "."), effects: ["read", "write"] }]
    })).rejects.toThrow("identical effects")
    expect((await started.workspace!.port.readAuthority()).revision).toBe(deduplicated.revision)
  })
})

async function setup(options: {
  readonly writable?: boolean
  readonly gitCapability?: boolean
  readonly isolation?: boolean
} = {}) {
  const storeDir = await directory()
  const first = await directory()
  const second = await directory()
  const outside = await directory()
  await writeFile(join(first, "same.txt"), "FIRST_FILE")
  await writeFile(join(first, "remove.txt"), "REMOVE_FILE")
  await writeFile(join(second, "same.txt"), "SECOND_FILE")
  await writeFile(join(first, "AGENTS.md"), "FIRST_RULE")
  await writeFile(join(second, "AGENTS.md"), "SECOND_RULE")
  await writeFile(join(outside, "secret.txt"), "OUTSIDE_SECRET")
  await symlink(join(outside, "secret.txt"), join(first, "escape.txt"))
  const provider = await providerFixture()
  const effects = options.writable ? ["read", "write", "create", "remove"] as const : undefined
  const workspace = {
    hostId: "test",
    initialRoots: [
      { id: "first", path: first, ...(effects === undefined ? {} : { effects }) },
      { id: "second", path: second, ...(effects === undefined ? {} : { effects }) }
    ]
  }
  const started = await start(storeDir, provider.endpoint, workspace, options.gitCapability === true, options.isolation === true)
  return { started, storeDir, first, second, outside, workspace, provider }
}

async function hasGitDirectory(root: string): Promise<boolean> {
  try {
    await (await import("node:fs/promises")).stat(join(root, ".git"))
    return true
  } catch {
    return false
  }
}

async function start(
  storeDir: string,
  endpoint: ModelEndpoint,
  workspace?: WorkspaceHostOptions,
  gitCapability = false,
  isolation = false
) {
  const baseOptions = { storage: { kind: "store-dir", storeDir }, serviceBin, modelEndpoint: endpoint,
    secretResolver: new SecretResolver([new EnvSecretProvider({ WORKSPACE_TEST_KEY: "test-only" })]),
  } as const
  if (workspace === undefined) {
    const started = await startAssistantHostInternal(baseOptions)
    const handle = createAssistantHostHandle(started)
    closers.push(() => handle.close())
    return started
  }
  const configuredWorkspace = workspace.worktreeDirectory !== undefined || !isolation
    ? workspace
    : { ...workspace, worktreeDirectory: join(storeDir, "workspace-worktrees") }
  const started = await startAssistantHostInternal({ ...baseOptions, workspace: configuredWorkspace }, {
    create: async ({ runtime, workspace: configuredWorkspace, serviceBin: configuredServiceBin }) =>
      await createWorkspaceController(runtime.storage, configuredWorkspace, {
        serviceBin: configuredServiceBin,
        workspaceStore: createWorkspaceStore(runtime.transport),
        ...(gitCapability || isolation ? { createCapabilityTools: createWorkspaceGitCapabilityTools } : {}),
        createMutationTools: (context) => [
          ...createWorkspaceMutationTools(context),
          ...(isolation ? createIsolatedChangeTools(context) : []),
        ],
      }),
  })
  const handle = createAssistantHostHandle(started)
  closers.push(() => handle.close())
  return started
}

function isolated(changes: readonly Record<string, string>[]): string {
  return `CALL:${JSON.stringify({ name: "workspace_prepare_isolated_changes", input: { rootId: "first", changes } })}`
}

async function initializeRepository(root: string): Promise<void> {
  await writeFile(join(root, ".gitignore"), "escape.txt\n")
  for (const args of [["init"], ["config", "user.name", "Wanex Test"], ["config", "user.email", "test@wanex.local"], ["config", "core.autocrlf", "false"], ["add", "."], ["commit", "-m", "initial"]]) {
    await execFileAsync("git", ["-C", root, ...args])
  }
}

async function submit(started: StartedAssistantHost, sessionId: string, text: string) {
  const before = await started.runtime.storage.listSessionTurns({ sessionId })
  const submission = await started.shell.submitConversationOperation({ sessionId, text })
  if (submission.kind.includes("rejected")) throw new Error(JSON.stringify(submission))
  await expect.poll(async () => (await started.runtime.storage.listSessionTurns({ sessionId })).length).toBe(before.length + 1)
  const turn = (await started.runtime.storage.listSessionTurns({ sessionId })).at(-1)!
  const result = await terminal(started, turn.id)
  expect(result.state, JSON.stringify(result.error)).toBe("succeeded")
  return result
}

async function terminal(started: StartedAssistantHost, turnId: string) {
  await expect.poll(async () => (await started.runtime.storage.getSessionTurn(turnId))?.state, { timeout: 10_000 }).not.toMatch(/queued|running|waiting/)
  const turn = await started.runtime.storage.getSessionTurn(turnId)
  if (turn === null) throw new Error("expected durable Turn")
  return turn
}

async function prepare(started: StartedAssistantHost, sessionId: string, id: string, text = "prepared") {
  const content = [{ id: `part_${id}`, type: "text" as const, text }]
  const prepared = await started.shell.trustedExecution.prepareExecutionBinding({ sessionId, inputId: `input_${id}`, turnId: `turn_${id}`, content })
  const request: SubmitSessionTurnRequest = {
    sessionId, id: `input_${id}`, turnId: `turn_${id}`, principalId: "workspace-test", idempotencyKey: `key_${id}`, content,
    executionBinding: prepared.binding
  }
  return { request, context: prepared.context }
}

function read(paths: readonly (string | { path: string; rootId: string })[]): string {
  return `READ:${JSON.stringify(paths)}`
}

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "wanex-workspace-host-"))
  directories.push(path)
  return path
}

async function providerFixture() {
  const requests: { messages: { role: string; content: unknown }[] }[] = []
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    requests.push(body)
    const messages = body.messages as { role: string; content: string }[]
    const index = messages.map((message) => message.role).lastIndexOf("user")
    const text = messages[index]?.content ?? ""
    const hasResults = messages.slice(index + 1).some((message) => message.role === "tool")
    response.writeHead(200, { "content-type": "text/event-stream" })
    const call = text.startsWith("CALL:") ? JSON.parse(text.slice(5)) as { name: string; input: unknown } : undefined
    const delta = call !== undefined && !hasResults ? {
      tool_calls: [{ index: 0, id: "custom_call", type: "function", function: { name: call.name, arguments: JSON.stringify(call.input) } }]
    } : text.startsWith("READ:") && !hasResults ? {
      tool_calls: (JSON.parse(text.slice(5)) as (string | { path: string; rootId: string })[]).map((target, index) => ({
        index, id: `read_${index}`, type: "function", function: { name: "workspace_read_text", arguments: JSON.stringify(typeof target === "string" ? { path: target } : target) }
      }))
    } : { content: "done" }
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" in delta ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  closers.push(() => new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections() }))
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("provider did not start")
  const endpoint: ModelEndpoint = {
    id: "workspace-provider", connection: { id: "workspace-provider", providerId: "openai-compatible", baseUrl: `http://127.0.0.1:${address.port}/v1`, secretRef: "env://WORKSPACE_TEST_KEY" },
    protocol: { id: "openai-chat-completions" },
    model: { id: "workspace-model", operations: ["conversation"], inputModalities: ["text"], outputModalities: ["text"], features: ["tool_calling", "parallel_tool_calls"], catalog: { source: "custom", catalogId: "test.workspace", revision: "1" } }
  }
  return { endpoint, requests }
}
