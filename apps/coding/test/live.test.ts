import { describe, expect, it } from "vitest"
import type { ProviderRunEvent } from "@wanex/runtime/provider"
import { CodingLiveTurnProjection } from "../src/application/live.js"

const reference = {
  repositoryId: "repository_live",
  taskId: "task_live",
  sessionId: "session_live",
  inputId: "input_live",
  turnId: "turn_live",
  jobId: "job_live"
} as const

describe("Coding transient live Turn projection", () => {
  it("projects assistant text and safe Tool activity without leaking Provider data", () => {
    const projection = new CodingLiveTurnProjection(reference)
    expect(projection.read("project_live")).toMatchObject({
      projectId: "project_live",
      phase: "starting",
      assistantText: "",
      activities: []
    })

    expect(projection.applyProviderEvent(providerEvent({
      type: "reasoning_delta",
      partId: "reasoning",
      delta: "PRIVATE_REASONING"
    }))).toBe(true)
    expect(projection.applyProviderEvent(providerEvent({
      type: "provider_state",
      state: {
        providerId: "private-provider",
        modelId: "private-model",
        stateKind: "opaque",
        replayPolicy: "forbidden",
        payload: { secret: "PRIVATE_STATE" }
      }
    }))).toBe(false)
    expect(projection.applyProviderEvent(providerEvent({
      type: "text_delta",
      partId: "answer",
      delta: "Hello"
    }))).toBe(true)
    expect(projection.applyProviderEvent(providerEvent({
      type: "tool_call_start",
      index: 0,
      toolCallId: "private-call"
    }))).toBe(true)
    expect(projection.applyProviderEvent(providerEvent({
      type: "tool_call_delta",
      toolCallId: "private-call",
      toolNameDelta: "workspace_read",
      inputJsonDelta: JSON.stringify({ path: "/private/path" })
    }))).toBe(true)
    expect(projection.applyProviderEvent(providerEvent({
      type: "tool_call_end",
      toolCallId: "private-call"
    }))).toBe(true)

    const live = projection.read("project_live")
    expect(live).toMatchObject({
      phase: "tool_calling",
      assistantText: "Hello",
      activities: [{ ordinal: 1, name: "workspace_read", nameTruncated: false, state: "ready" }]
    })
    const serialized = JSON.stringify(live)
    expect(serialized).not.toContain("PRIVATE_REASONING")
    expect(serialized).not.toContain("PRIVATE_STATE")
    expect(serialized).not.toContain("private-provider")
    expect(serialized).not.toContain("private-model")
    expect(serialized).not.toContain("private-call")
    expect(serialized).not.toContain("private/path")
  })

  it("bounds UTF-8 text, Tool names, and activity count", () => {
    const projection = new CodingLiveTurnProjection(reference)
    projection.applyProviderEvent(providerEvent({
      type: "text_delta",
      partId: "large",
      delta: "界".repeat(40_000)
    }))
    const first = projection.read("project_live")
    expect(Buffer.byteLength(first.assistantText, "utf8")).toBeLessThanOrEqual(65_536)
    expect(Buffer.byteLength(first.assistantText, "utf8")).toBeGreaterThan(65_000)
    expect(first.assistantTextTruncated).toBe(true)

    projection.applyProviderEvent(providerEvent({
      type: "tool_call_start",
      index: 0,
      toolCallId: "bounded-call"
    }))
    projection.applyProviderEvent(providerEvent({
      type: "tool_call_delta",
      toolCallId: "bounded-call",
      toolNameDelta: "n".repeat(300)
    }))
    for (let index = 1; index < 40; index += 1) {
      projection.applyProviderEvent(providerEvent({
        type: "tool_call_start",
        index,
        toolCallId: `call-${index}`
      }))
    }
    const bounded = projection.read("project_live")
    expect(bounded.activities).toHaveLength(32)
    expect(Buffer.byteLength(bounded.activities[0]!.name!, "utf8")).toBe(256)
    expect(bounded.activities[0]!.nameTruncated).toBe(true)
    expect(bounded.activitiesTruncated).toBe(true)
  })

  it("ignores foreign and stale references and maps terminal Provider phases", () => {
    const projection = new CodingLiveTurnProjection(reference)
    expect(projection.applyProviderEvent(providerEvent({
      type: "text_delta",
      partId: "foreign",
      delta: "foreign"
    }, { turnId: "other_turn" }))).toBe(false)
    expect(projection.applyProviderEvent(providerEvent({
      type: "text_delta",
      partId: "answer",
      delta: "answer"
    }))).toBe(true)
    expect(projection.applyProviderEvent(providerEvent({
      type: "text_delta",
      partId: "stale",
      delta: "stale"
    }, { attemptId: "old_attempt" }))).toBe(false)
    expect(projection.applyProviderEvent(providerEvent({
      type: "finish",
      reason: "stop"
    }))).toBe(true)
    expect(projection.read("project_live").phase).toBe("settling")
    expect(projection.applyProviderEvent(providerEvent({
      type: "error",
      error: {
        category: "network",
        message: "private error",
        retryable: true,
        providerId: "private-provider",
        modelId: "private-model",
        phase: "stream"
      }
    }))).toBe(true)
    expect(projection.read("project_live").phase).toBe("failed")
  })

  it("accepts the next execution Attempt only after an explicit suspension boundary", () => {
    const projection = new CodingLiveTurnProjection(reference)
    expect(projection.applyProviderEvent(providerEvent({
      type: "text_delta",
      partId: "first",
      delta: "before approval"
    }))).toBe(true)
    expect(projection.applyProviderEvent(providerEvent({
      type: "text_delta",
      partId: "stale",
      delta: "must be ignored"
    }, { attemptId: "attempt_next" }))).toBe(false)
    projection.prepareNextAttempt()
    expect(projection.applyProviderEvent(providerEvent({
      type: "text_delta",
      partId: "second",
      delta: " after approval",
    }, { attemptId: "attempt_next" }))).toBe(true)
    expect(projection.read("project_live").assistantText).toBe(
      "before approval after approval",
    )
  })
})

function providerEvent(
  event: ProviderRunEvent["event"],
  overrides: Partial<ProviderRunEvent> = {}
): ProviderRunEvent {
  return {
    sessionId: reference.sessionId,
    inputId: reference.inputId,
    turnId: reference.turnId,
    jobId: reference.jobId,
    attemptId: "attempt_live",
    providerId: "provider_live",
    modelId: "model_live",
    event,
    ...overrides
  }
}
