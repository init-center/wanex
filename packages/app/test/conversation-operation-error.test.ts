import { describe, expect, it } from "vitest"
import type {
  JsonValue,
  SessionTurnContextCapacityFailure,
  SessionTurnRecord
} from "@wanex/protocol"
import { projectWanexAppConversationOperationError } from "../src/conversation-operation-error.js"

describe("Wanex App conversation capacity error projection", () => {
  it("projects valid durable evidence without exposing raw error text", () => {
    const error = projectWanexAppConversationOperationError(turn({
      kind: "session_turn.context_capacity_exceeded",
      message: "internal runtime wording",
      capacity: {
        reasons: ["input_tokens_exceeded", "input_resources_exceeded"],
        inputTokens: 901,
        inputTokenCeiling: 700,
        inputResources: 3,
        maxInputResources: 2,
        requestedOutputTokens: 100,
        compactionAttempted: true,
        compactionReason: "request still exceeds capacity after compaction"
      }
    }))

    expect(error).toEqual({
      code: "conversation_context_capacity_exceeded",
      category: "capacity",
      message:
        "This request exceeds the selected model's context and resource capacity.",
      modelEndpointId: "capacity-endpoint",
      capacity: {
        reasons: ["input_tokens_exceeded", "input_resources_exceeded"],
        inputTokens: 901,
        inputTokenCeiling: 700,
        inputResources: 3,
        maxInputResources: 2,
        requestedOutputTokens: 100,
        compactionAttempted: true,
        compactionReason: "request still exceeds capacity after compaction"
      }
    })
    expect(JSON.stringify(error)).not.toContain("internal runtime wording")
  })

  it.each([
    {
      title: "unknown kind",
      error: {
        kind: "forged.context_capacity",
        capacity: validCapacity()
      }
    },
    {
      title: "duplicate reasons",
      error: {
        kind: "session_turn.context_capacity_exceeded",
        message: "capacity failure",
        capacity: {
          ...validCapacity(),
          reasons: ["input_tokens_exceeded", "input_tokens_exceeded"]
        }
      }
    },
    {
      title: "inconsistent token evidence",
      error: {
        kind: "session_turn.context_capacity_exceeded",
        message: "capacity failure",
        capacity: {
          ...validCapacity(),
          inputTokens: 700
        }
      }
    },
    {
      title: "oversized arbitrary text",
      error: {
        kind: "session_turn.context_capacity_exceeded",
        message: "capacity failure",
        capacity: {
          ...validCapacity(),
          compactionReason: "secret".repeat(300)
        }
      }
    },
    {
      title: "oversized durable message",
      error: {
        kind: "session_turn.context_capacity_exceeded",
        message: "secret".repeat(100),
        capacity: validCapacity()
      }
    }
  ])("degrades $title to a bounded generic error", ({ error }) => {
    const projected = projectWanexAppConversationOperationError(
      turn(error as JsonValue)
    )

    expect(projected).toEqual({
      code: "conversation_operation_failed",
      category: "runtime",
      message: "conversation operation failed; see app diagnostics for details"
    })
    expect(JSON.stringify(projected)).not.toContain("secret")
  })
})

function validCapacity(): SessionTurnContextCapacityFailure {
  return {
    reasons: ["input_tokens_exceeded"],
    inputTokens: 901,
    inputTokenCeiling: 700,
    inputResources: 0,
    requestedOutputTokens: 100,
    compactionAttempted: true
  }
}

function turn(error: JsonValue): SessionTurnRecord {
  return {
    id: "turn_capacity",
    sessionId: "ses_capacity",
    primaryInputId: "inp_capacity",
    jobId: "job_capacity",
    state: "failed",
    executionBinding: {
      modelEndpoint: { endpointId: "capacity-endpoint" }
    } as SessionTurnRecord["executionBinding"],
    maxSteps: 8,
    error,
    createdAt: 1,
    updatedAt: 2,
    finishedAt: 2
  }
}
