import { createServer } from "node:http"
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ModelEndpoint } from "@wanex/protocol"
import { EnvSecretProvider, SecretResolver } from "@wanex/runtime/secrets"
import { createWorkspaceStore } from "@wanex/storage/workspace"
import { createAssistantHostHandle, startAssistantHostInternal, type StartedAssistantHost } from "../src/application/assistant.js"
import { createWorkspaceController } from "../src/workspace/controller.js"
import { createWorkspaceMutationTools } from "../src/workspace/mutation-tools.js"
import { createWorkspaceAccessStore } from "../src/workspace/access.js"
import { inspectWorkspaceRoot } from "../src/workspace/access-coordinator.js"
import { digest } from "../src/workspace/store.js"

const serviceBin = join(import.meta.dirname, `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`)
const closers: (() => Promise<void>)[] = []
const directories: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  while (closers.length) await closers.pop()!()
  while (directories.length) await rm(directories.pop()!, { recursive: true, force: true })
})

describe("User-granted conversation folders", () => {
  it("adds a folder to a new conversation, then reads, edits, revokes and reuses it without exposing paths", async () => {
    const notes = await directory()
    await writeFile(join(notes, "todo.txt"), "draft\n")
    const picker: { next: string | undefined } = { next: notes }
    const started = await start(async () => picker.next)
    const folders = started.shell.workspaceFolders

    expect(await folders.listWorkspaceFolders()).toEqual({
      kind: "assistant.workspace-folders", available: true, canPick: true, folders: [], recent: []
    })

    // A new conversation has no Session yet; the first folder reserves one.
    const granted = await folders.grantWorkspaceFolder({ access: "read_write", idempotencyKey: "grant-notes" })
    expect(granted.folders).toEqual([{ grantId: expect.any(String), name: basename(notes), access: "read_write" }])
    expect(JSON.stringify(granted)).not.toContain(await realpath(notes))
    const sessionId = granted.sessionId!
    const grantId = granted.folders[0]!.grantId
    expect(await folders.grantWorkspaceFolder({ access: "read_write", idempotencyKey: "grant-notes" })).toEqual(granted)

    // The first message of the new conversation lands in the reserved Session.
    const listed = await submit(started, undefined, sessionId, call("workspace_list_folders", {}))
    expect(JSON.stringify(listed)).toContain(grantId)
    expect(JSON.stringify(listed)).not.toContain(await realpath(notes))

    await submit(started, sessionId, sessionId, call("workspace_apply_changeset", {
      changes: [{ grantId, path: "todo.txt", kind: "update", baseText: "draft\n", targetText: "final\n" }]
    }))
    expect(await readFile(join(notes, "todo.txt"), "utf8")).toBe("final\n")
    expect(JSON.stringify(await submit(started, sessionId, sessionId, call("workspace_read_text", { path: "todo.txt", grantId })))).toContain("final")

    // Removing the folder stops later Turns immediately.
    const revoked = await folders.revokeWorkspaceFolder({ sessionId, grantId, idempotencyKey: "remove-notes" })
    expect(revoked.folders).toEqual([])
    const denied = await submit(started, sessionId, sessionId, call("workspace_read_text", { path: "todo.txt", grantId }))
    expect(denied.map((execution) => execution.state)).toEqual(["failed"])

    // Another conversation can reuse the folder from Recents without a picker.
    const other = await folders.listWorkspaceFolders({ sessionId: "ses_other" })
    expect(other.recent).toEqual([{ recentRef: expect.any(String), name: basename(notes), access: "read_write" }])
    picker.next = undefined
    const reused = await folders.regrantWorkspaceFolder({ sessionId: "ses_other", recentRef: other.recent[0]!.recentRef, idempotencyKey: "reuse-notes" })
    expect(reused.folders).toHaveLength(1)
    expect(reused.recent).toEqual([])
    const otherRead = await submit(started, "ses_other", "ses_other", call("workspace_read_text", { path: "todo.txt", grantId: reused.folders[0]!.grantId }))
    expect(JSON.stringify(otherRead)).toContain("final")

    // A cancelled picker changes nothing.
    expect(await folders.grantWorkspaceFolder({ sessionId: "ses_other", access: "read", idempotencyKey: "cancelled" })).toEqual(reused)
  })

  it("keeps read-only folders read-only and fails closed without a trusted picker", async () => {
    const docs = await directory()
    await writeFile(join(docs, "readme.txt"), "docs\n")
    const started = await start(async () => docs)
    const granted = await started.shell.workspaceFolders.grantWorkspaceFolder({ sessionId: "ses_docs", access: "read", idempotencyKey: "grant-docs" })
    const grantId = granted.folders[0]!.grantId
    expect(granted.folders[0]!.access).toBe("read")
    const write = await submit(started, "ses_docs", "ses_docs", call("workspace_apply_changeset", {
      changes: [{ grantId, path: "readme.txt", kind: "update", baseText: "docs\n", targetText: "changed\n" }]
    }))
    expect(write.map((execution) => execution.state)).toEqual(["failed"])
    expect(await readFile(join(docs, "readme.txt"), "utf8")).toBe("docs\n")

    const headless = await start(undefined)
    const listing = await headless.shell.workspaceFolders.listWorkspaceFolders()
    expect(listing).toMatchObject({ available: true, canPick: false })
    await expect(headless.shell.workspaceFolders.grantWorkspaceFolder({ sessionId: "ses_x", access: "read", idempotencyKey: "x" }))
      .rejects.toThrow("cannot open a folder picker")
  })

  it.each(["undo", "reapply"] as const)("rejects review %s after a granted directory is replaced, even with matching file content", async (operation) => {
    const fixture = await reviewFixture()
    const { started, notes, reference } = fixture
    if (operation === "reapply") {
      await expect(started.workspace!.review.undoChange({ ...reference, idempotencyKey: "prepare-undo" }))
        .resolves.toMatchObject({ outcome: "applied" })
    }
    const current = operation === "undo" ? "final\n" : "draft\n"
    const original = join(fixture.parent, "original-notes")
    await rename(notes, original)
    await mkdir(notes)
    await writeFile(join(notes, "todo.txt"), current)

    const mutate = operation === "undo"
      ? started.workspace!.review.undoChange.bind(started.workspace!.review)
      : started.workspace!.review.reapplyChange.bind(started.workspace!.review)
    await expect(mutate({ ...reference, idempotencyKey: "stale-review" })).rejects.toThrow("unavailable")
    expect(await started.workspace!.review.readChange(reference)).toMatchObject({ available: false, actions: [] })
    expect(await readFile(join(original, "todo.txt"), "utf8")).toBe(current)
    expect(await readFile(join(notes, "todo.txt"), "utf8")).toBe(current)
  })

  it.each(["undo", "reapply"] as const)("rejects review %s when the original grant expires before reconciliation", async (operation) => {
    const expiresAt = Date.now() + 60_000
    const { started, notes, reference, grantId } = await reviewFixture(expiresAt)
    if (operation === "reapply") {
      await expect(started.workspace!.review.undoChange({ ...reference, idempotencyKey: "prepare-undo" }))
        .resolves.toMatchObject({ outcome: "applied" })
    }
    const access = createWorkspaceAccessStore(started.runtime.storage, { hostId: "folders" })
    expect(await access.getGrant(grantId)).toMatchObject({ state: "active", expiresAt })
    const clock = vi.spyOn(Date, "now").mockReturnValue(expiresAt)
    try {
      const mutate = operation === "undo"
        ? started.workspace!.review.undoChange.bind(started.workspace!.review)
        : started.workspace!.review.reapplyChange.bind(started.workspace!.review)
      await expect(mutate({ ...reference, idempotencyKey: "expired-review" })).rejects.toThrow("unavailable")
      expect(await started.workspace!.review.readChange(reference)).toMatchObject({ available: false, actions: [] })
      expect(await access.getGrant(grantId)).toMatchObject({ state: "active", expiresAt })
      expect(await readFile(join(notes, "todo.txt"), "utf8")).toBe(operation === "undo" ? "final\n" : "draft\n")
    } finally { clock.mockRestore() }
  })

  it("keeps historical change content but denies undo after the user removes the folder", async () => {
    const { started, notes, reference, grantId } = await reviewFixture()
    await started.shell.workspaceFolders.revokeWorkspaceFolder({ sessionId: reference.sessionId, grantId, idempotencyKey: "revoke-review" })
    expect(await started.workspace!.review.readChange(reference)).toMatchObject({
      available: false, actions: [], files: [{ path: "todo.txt", before: { text: "draft\n" }, after: { text: "final\n" } }]
    })
    await expect(started.workspace!.review.undoChange({ ...reference, idempotencyKey: "revoked-review" }))
      .rejects.toThrow("unavailable")
    expect(await readFile(join(notes, "todo.txt"), "utf8")).toBe("final\n")
  })

  it("does not substitute a later valid grant for the original change's directory", async () => {
    const { started, parent, notes, reference, grantId } = await reviewFixture()
    await rename(notes, join(parent, "original-notes"))
    await mkdir(notes)
    await writeFile(join(notes, "todo.txt"), "final\n")
    const access = createWorkspaceAccessStore(started.runtime.storage, { hostId: "folders" })
    // Put the replacement first in the persisted key order to expose a root-list lookup.
    const idempotencyKey = Array.from({ length: 256 }, (_, index) => `replacement-${index}`).find((idempotency) =>
      digest(`wgrant_${digest({ kind: "user", hostId: "folders", sessionId: reference.sessionId, idempotency }).slice(0, 48)}`) < digest(grantId)
    )
    expect(idempotencyKey).toBeDefined()
    const replacement = await access.createUserGrant({
      sessionId: reference.sessionId, actorId: "assistant-user", idempotencyKey: idempotencyKey!,
      root: await inspectWorkspaceRoot(notes, ["read", "write", "create", "remove"])
    })
    expect((await access.listGrants({ sessionId: reference.sessionId }))[0]!.id).toBe(replacement.id)
    await expect(started.workspace!.review.undoChange({ ...reference, idempotencyKey: "replacement-review" }))
      .rejects.toThrow("unavailable")
    expect(await started.workspace!.review.readChange(reference)).toMatchObject({ available: false, actions: [] })
    expect(await readFile(join(parent, "original-notes", "todo.txt"), "utf8")).toBe("final\n")
    expect(await readFile(join(notes, "todo.txt"), "utf8")).toBe("final\n")

    await submit(started, reference.sessionId, reference.sessionId, call("workspace_apply_changeset", {
      changes: [{ grantId: replacement.id, path: "todo.txt", kind: "update", baseText: "final\n", targetText: "new authorized edit\n" }]
    }))
    expect(await readFile(join(notes, "todo.txt"), "utf8")).toBe("new authorized edit\n")
    expect(await readFile(join(parent, "original-notes", "todo.txt"), "utf8")).toBe("final\n")
  })
})

async function reviewFixture(expiresAt?: number) {
  const parent = await directory()
  const notes = join(parent, "notes")
  await mkdir(notes)
  await writeFile(join(notes, "todo.txt"), "draft\n")
  const started = await start(async () => notes)
  const sessionId = "ses_review"
  let grantId: string
  if (expiresAt === undefined) {
    const granted = await started.shell.workspaceFolders.grantWorkspaceFolder({ sessionId, access: "read_write", idempotencyKey: "grant-review" })
    grantId = granted.folders[0]!.grantId
  } else {
    await submit(started, sessionId, sessionId, "hello")
    const turn = (await started.runtime.storage.listSessionTurns({ sessionId }))[0]!
    const input = (await started.runtime.storage.listSessionInputs({ sessionId })).find((candidate) => candidate.id === turn.primaryInputId)!
    const access = createWorkspaceAccessStore(started.runtime.storage, { hostId: "folders" })
    const request = await access.createRequest({
      id: "waccess_review", hostId: "folders", principalId: input.principalId, sessionId,
      turnId: turn.id,
      scope: "session", root: await inspectWorkspaceRoot(notes, ["read", "write", "create", "remove"]),
      reason: "review expiry regression", idempotencyKey: "review-request", expiresAt, now: Date.now()
    })
    const decision = await access.decideRequest({
      requestId: request.id, expectedRevision: request.revision, actorId: input.principalId,
      decision: "approve", reason: "approved", idempotencyKey: "review-approved", now: Date.now()
    })
    grantId = decision.grant!.id
  }
  const executions = await submit(started, sessionId, sessionId, call("workspace_apply_changeset", {
    changes: [{ grantId, path: "todo.txt", kind: "update", baseText: "draft\n", targetText: "final\n" }]
  }))
  expect(await readFile(join(notes, "todo.txt"), "utf8")).toBe("final\n")
  const execution = executions[0]!
  const entries = await started.workspace!.review.listChanges({ sessionId, toolCalls: [{
    key: "review", turnId: execution.turnId, sourceMessageId: execution.sourceMessageId,
    toolCallId: execution.toolCallId, toolName: execution.toolName
  }] })
  expect(entries[0]!.changes).toHaveLength(1)
  const reference = { sessionId, changeRef: entries[0]!.changes[0]!.changeRef }
  expect(await started.workspace!.review.readChange(reference)).toMatchObject({ available: true, actions: ["undo"] })
  return { started, parent, notes, reference, grantId }
}

function call(name: string, input: unknown): string {
  return `CALL:${JSON.stringify({ name, input })}`
}

async function start(selectDirectory: (() => Promise<string | undefined>) | undefined): Promise<StartedAssistantHost> {
  const storeDir = await directory()
  const endpoint = await providerFixture()
  const started = await startAssistantHostInternal({
    storage: { kind: "store-dir", storeDir }, serviceBin, modelEndpoint: endpoint,
    secretResolver: new SecretResolver([new EnvSecretProvider({ WORKSPACE_TEST_KEY: "test-only" })]),
    workspace: { hostId: "folders", ...(selectDirectory === undefined ? {} : { selectDirectory }) }
  }, {
    create: async ({ runtime, workspace, serviceBin: configuredServiceBin }) =>
      await createWorkspaceController(runtime.storage, workspace, {
        serviceBin: configuredServiceBin,
        workspaceStore: createWorkspaceStore(runtime.transport),
        createMutationTools: (context) => createWorkspaceMutationTools(context)
      })
  })
  const handle = createAssistantHostHandle(started)
  closers.push(() => handle.close())
  return started
}

/** Submits one message and returns the Turn's Tool executions once it settles. */
async function submit(started: StartedAssistantHost, requestedSessionId: string | undefined, sessionId: string, text: string) {
  const before = await started.runtime.storage.listSessionTurns({ sessionId })
  const submission = await started.shell.submitConversationOperation({
    ...(requestedSessionId === undefined ? {} : { sessionId: requestedSessionId }), text
  })
  if (submission.kind.includes("rejected")) throw new Error(JSON.stringify(submission))
  await expect.poll(async () => (await started.runtime.storage.listSessionTurns({ sessionId })).length).toBe(before.length + 1)
  const turn = (await started.runtime.storage.listSessionTurns({ sessionId })).at(-1)!
  await expect.poll(async () => (await started.runtime.storage.getSessionTurn(turn.id))?.state, { timeout: 10_000 }).toBe("succeeded")
  return await started.runtime.storage.listToolExecutions({ turnId: turn.id })
}

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "wanex-workspace-folders-"))
  directories.push(path)
  return path
}

async function providerFixture(): Promise<ModelEndpoint> {
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { messages: { role: string; content: string }[] }
    const index = body.messages.map((message) => message.role).lastIndexOf("user")
    const text = body.messages[index]?.content ?? ""
    const hasResults = body.messages.slice(index + 1).some((message) => message.role === "tool")
    const call = text.startsWith("CALL:") ? JSON.parse(text.slice(5)) as { name: string; input: unknown } : undefined
    const delta = call !== undefined && !hasResults
      ? { tool_calls: [{ index: 0, id: "folder_call", type: "function", function: { name: call.name, arguments: JSON.stringify(call.input) } }] }
      : { content: "done" }
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" in delta ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  closers.push(() => new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections() }))
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("provider did not start")
  return {
    id: "folders-provider", connection: { id: "folders-provider", providerId: "openai-compatible", baseUrl: `http://127.0.0.1:${address.port}/v1`, secretRef: "env://WORKSPACE_TEST_KEY" },
    protocol: { id: "openai-chat-completions" },
    model: { id: "folders-model", operations: ["conversation"], inputModalities: ["text"], outputModalities: ["text"], features: ["tool_calling"], catalog: { source: "custom", catalogId: "test.folders", revision: "1" } }
  }
}
