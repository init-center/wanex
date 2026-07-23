import { createHash } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type {
  BeginToolExecutionReceipt,
  BeginToolExecutionRequest,
  JsonValue
} from "@wanex/protocol"
import { createStorageTestStore } from "../src/testing.js"

const serviceBin = join(import.meta.dirname, "../../../target/debug/wanex-system-service")
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("durable tool execution storage", () => {
  it("fences tool execution by exact source message and settles idempotently", async () => {
    const fixture = await createTurnFixture()
    const request = beginRequest(fixture, "call_allowed", "running", {
      status: "allow",
      reason: "test"
    })
    const first = await fixture.store.beginToolExecution(request)
    expect(first.created).toBe(true)
    expect(first.execution).toMatchObject({
      state: "running",
      attemptCount: 1,
      toolCallId: "call_allowed",
      turnId: fixture.turnId,
      sourceMessageId: fixture.sourceMessageId
    })
    expect(first.invocationAttempt).toMatchObject({
      sessionAttemptId: fixture.attemptId,
      attemptNumber: 1,
      state: "running"
    })
    await expect(fixture.store.beginToolExecution(request)).resolves.toEqual({
      execution: first.execution,
      invocationAttempt: first.invocationAttempt,
      created: false
    })
    await expect(
      fixture.store.beginToolExecution({
        ...request,
        descriptor: {
          name: "echo",
          risk: "read_only",
          idempotent: false
        }
      })
    ).rejects.toThrow("conflicting repeated tool execution begin")

    const finish = finishRequest(fixture, first)
    const finished = await fixture.store.finishToolExecution({
      ...finish,
      state: "succeeded",
      result: { ok: true },
      isError: false
    })
    expect(finished).toMatchObject({
      state: "succeeded",
      result: { ok: true }
    })
    await expect(
      fixture.store.finishToolExecution({
        ...finish,
        state: "succeeded",
        result: { ok: true },
        isError: false
      })
    ).resolves.toEqual(finished)
    await expect(
      fixture.store.listToolExecutions({ turnId: fixture.turnId })
    ).resolves.toMatchObject([
      { id: first.execution.id, state: "succeeded" }
    ])
    await expect(
      fixture.store.listToolExecutionAttempts({
        executionId: first.execution.id
      })
    ).resolves.toMatchObject([
      {
        id: first.invocationAttempt!.id,
        sessionAttemptId: fixture.attemptId,
        state: "succeeded"
      }
    ])

    await expect(
      fixture.store.beginToolExecution({
        ...beginRequest(fixture, "call_missing", "running", {
          status: "allow",
          reason: "test"
        }),
        idempotencyKey: "tool:missing"
      })
    ).rejects.toThrow(
      "tool execution call is not present in its source assistant message"
    )
  })

  it("persists denied and approval-required decisions without running state", async () => {
    const fixture = await createTurnFixture()
    const denied = (
      await fixture.store.beginToolExecution(
        beginRequest(fixture, "call_denied", "denied", {
          status: "deny",
          reason: "policy"
        })
      )
    ).execution
    expect(denied.state).toBe("denied")
    expect(denied).not.toHaveProperty("startedAt")
    expect(denied.finishedAt).toEqual(expect.any(Number))

    const approval = (
      await fixture.store.beginToolExecution(
        beginRequest(fixture, "call_approval", "approval_required", {
          status: "approval_required",
          reason: "human review"
        })
      )
    ).execution
    expect(approval.state).toBe("approval_required")
    expect(approval).not.toHaveProperty("startedAt")
    expect(approval).not.toHaveProperty("finishedAt")

    const events = await fixture.store.queryEvents({
      scope: { turnId: fixture.turnId },
      limit: 20
    })
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "tool.execution.denied",
        "tool.execution.approval_required"
      ])
    )
  })
})

async function createStore() {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-tool-storage-"))
  tempDirs.push(storeDir)
  return createStorageTestStore({
    kind: "local-system-service",
    mode: "oneshot",
    storeDir,
    serviceBin
  })
}

async function createTurnFixture() {
  const store = await createStore()
  const sessionId = "session_tools"
  const turnId = "turn_tools"
  const inputId = "input_tools"
  const jobId = "job_tools"
  const workerId = "worker_tools"
  await store.createSession({ id: sessionId, kind: "agent" })
  const submitted = await store.submitSessionTurn({
    id: inputId,
    turnId,
    sessionId,
    principalId: "principal_tools",
    idempotencyKey: "idem_tools",
    content: [{
      type: "text",
      id: "part_tools_user",
      text: "use tools"
    }],
    jobId,
    executionBinding: testTurnBinding()
  })
  const job = await store.claimJob({
    workerId,
    leaseMs: 60_000,
    kinds: ["session.turn"]
  })
  const started = await store.startSessionTurnAttempt({
    sessionId,
    turnId,
    inputId,
    jobId,
    workerId,
    leaseToken: job!.leaseToken!
  })
  const source = await store.appendSessionMessage({
    sessionId,
    turnId,
    attemptId: started.attempt.id,
    inputId,
    jobId,
    workerId,
    leaseToken: job!.leaseToken!,
    idempotencyKey: "tool_source",
    role: "assistant",
    content: [
      toolCall("call_allowed"),
      toolCall("call_denied"),
      toolCall("call_approval")
    ]
  })
  return {
    store,
    sessionId,
    turnId: submitted.turn.id,
    attemptId: started.attempt.id,
    inputId,
    sourceMessageId: source!.id,
    jobId,
    workerId,
    leaseToken: job!.leaseToken!
  }
}

function beginRequest(
  fixture: Awaited<ReturnType<typeof createTurnFixture>>,
  toolCallId: string,
  state: BeginToolExecutionRequest["state"],
  permission: JsonValue
): BeginToolExecutionRequest {
  return {
    sessionId: fixture.sessionId,
    turnId: fixture.turnId,
    attemptId: fixture.attemptId,
    inputId: fixture.inputId,
    sourceMessageId: fixture.sourceMessageId,
    jobId: fixture.jobId,
    workerId: fixture.workerId,
    leaseToken: fixture.leaseToken,
    principalId: "principal_tools",
    toolCallId,
    toolName: "echo",
    input: { text: "hello" },
    descriptor: {
      name: "echo",
      risk: "read_only",
      idempotent: true
    },
    permission,
    state,
    idempotencyKey: "tool:" + fixture.sourceMessageId + ":" + toolCallId
  }
}

function toolCall(toolCallId: string) {
  return {
    type: "tool_call" as const,
    id: "part_" + toolCallId,
    toolCallId,
    toolName: "echo",
    input: { text: "hello" }
  }
}

function finishRequest(
  fixture: Awaited<ReturnType<typeof createTurnFixture>>,
  receipt: BeginToolExecutionReceipt
) {
  return {
    sessionId: fixture.sessionId,
    turnId: fixture.turnId,
    sessionAttemptId: fixture.attemptId,
    inputId: fixture.inputId,
    jobId: fixture.jobId,
    workerId: fixture.workerId,
    leaseToken: fixture.leaseToken,
    executionId: receipt.execution.id,
    invocationAttemptId: receipt.invocationAttempt!.id
  }
}

function testTurnBinding() {
  const profile = {
    id: "profile_tools",
    kind: "fake",
    capabilities: { input: ["text"], output: ["text"] },
    providerId: "fake",
    modelId: "model_tools"
  } as const
  const provider = {
    profileId: profile.id,
    profileDigest: digestJson(profile),
    adapterId: profile.kind,
    providerId: profile.providerId,
    modelId: profile.modelId,
    capabilities: profile.capabilities
  } as const
  const binding = {
    createdAt: 1,
    provider,
    resources: [],
    recovery: {
      providerMaxAttempts: 1,
      idempotentToolMaxAttempts: 1
    }
  }
  return { digest: digestJson(binding), ...binding }
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)])
    )
  }
  return value
}
