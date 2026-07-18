import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { JsonValue } from "@wanex/protocol"
import { createStorageTestStore } from "../src/testing.js"

const serviceBin = join(import.meta.dirname, "../../../target/debug/wanex-system-service")
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("durable tool execution storage", () => {
  it("begins idempotently, rejects conflict, and finishes idempotently", async () => {
    const store = await createStore()
    await store.createSession({ id: "session_tools" })
    const request = beginRequest("call_1", { status: "allow", reason: "test" })
    const first = await store.beginToolExecution(request)
    const begun = first.execution
    expect(first.created).toBe(true)
    expect(begun).toMatchObject({ state: "running", attempt: 1, toolCallId: "call_1" })
    await expect(store.beginToolExecution(request)).resolves.toEqual({
      execution: begun,
      created: false
    })
    await expect(store.beginToolExecution({ ...request, toolName: "other" }))
      .rejects.toThrow("conflicting repeated tool execution begin")

    const finished = await store.finishToolExecution({
      executionId: begun.id,
      state: "succeeded",
      result: { ok: true },
      isError: false
    })
    expect(finished).toMatchObject({ state: "succeeded", result: { ok: true } })
    await expect(store.finishToolExecution({
      executionId: begun.id,
      state: "succeeded",
      result: { ok: true },
      isError: false
    })).resolves.toEqual(finished)
    await expect(store.listToolExecutions({ runId: "run_tools" }))
      .resolves.toMatchObject([{ id: begun.id, state: "succeeded" }])
  })

  it("records denied decisions and explicit recovery transitions", async () => {
    const store = await createStore()
    await store.createSession({ id: "session_tools" })
    const denied = (await store.beginToolExecution(
      beginRequest("call_denied", { status: "deny", reason: "policy" })
    )).execution
    expect(denied.state).toBe("denied")
    await expect(store.finishToolExecution({
      executionId: denied.id,
      state: "failed",
      error: { reason: "forbidden" }
    })).rejects.toThrow("not running")

    const running = (await store.beginToolExecution(
      beginRequest("call_recover", { status: "allow", reason: "test" })
    )).execution
    const retry = await store.recoverToolExecution({ executionId: running.id, action: "retry" })
    expect(retry).toMatchObject({ state: "running", attempt: 2 })
    const recovery = await store.recoverToolExecution({
      executionId: running.id,
      action: "require_recovery"
    })
    expect(recovery?.state).toBe("recovery_required")

    const events = await store.queryEvents({ scope: { runId: "run_tools" }, limit: 20 })
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "tool.execution.begun",
      "tool.execution.recovered"
    ]))
  })
})

async function createStore() {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-tool-storage-"))
  tempDirs.push(storeDir)
  return createStorageTestStore({ kind: "local-system-service", mode: "oneshot", storeDir, serviceBin })
}

function beginRequest(toolCallId: string, permission: JsonValue) {
  return {
    sessionId: "session_tools",
    runId: "run_tools",
    inputId: "input_tools",
    principalId: "principal_tools",
    toolCallId,
    toolName: "echo",
    input: { text: "hello" },
    descriptor: { name: "echo", risk: "read_only", idempotent: true },
    permission,
    idempotencyKey: `tool:run_tools:${toolCallId}`
  }
}
