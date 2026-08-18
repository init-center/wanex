import { describe, expect, it } from "vitest"
import type {
  ContextEpochRecord,
  MessagePart,
  SessionInputRecord,
  SessionMessageRecord,
  SessionTurnRecord
} from "@wanex/protocol"
import {
  SemanticContextCompiler,
  contextTextDigest,
  estimatePartTokens,
  prepareContextCompaction,
  reconstructContextCompaction,
  resolveContextCompactionPolicy,
  type ContextTokenEstimator
} from "../src/context/memory/index.js"
import { createTurnExecutionBinding } from "../src/execution/turn-binding.js"
import { fakeModelEndpoint } from "./model-endpoint-fixture.js"
import {
  toolResultContentDigest,
  toolResultPart
} from "../src/tools/index.js"

describe("@wanex/runtime/context semantic memory", () => {
  it("uses declared model limits and skips unknown input limits", () => {
    const unknown = executionBinding("unknown").modelEndpoint
    expect(resolveContextCompactionPolicy(unknown)).toBeNull()

    const bounded = executionBinding("bounded", 8_000, 1_024, 6_500)
      .modelEndpoint
    expect(resolveContextCompactionPolicy(bounded, {
      reserveInputTokens: 1_000,
      maxSummaryOutputTokens: 4_096
    })).toMatchObject({
      algorithm: "semantic-summary",
      modelContextWindowTokens: 8_000,
      modelMaxInputTokens: 6_500,
      waterlineTokens: 6_500,
      maxSummaryOutputTokens: 1_024
    })

    const contextBounded = executionBinding(
      "context-bounded",
      8_000,
      undefined,
      7_500
    ).modelEndpoint
    expect(resolveContextCompactionPolicy(contextBounded, {
      reserveInputTokens: 1_000
    })?.waterlineTokens).toBe(7_000)
  })

  it("uses a bounded token projection for immutable resources", () => {
    expect(estimatePartTokens({
      id: "part_resource",
      type: "resource",
      resourceId: "res_a2ui_payload",
      sha256: "a".repeat(64),
      sizeBytes: 128,
      kind: "artifact",
      mediaType: "application/json"
    })).toBe(16)
  })

  it("plans only complete old turns and serializes Tool resources without bytes", () => {
    const resource = {
      type: "resource" as const,
      resourceId: "resource_context_image",
      sha256: "f".repeat(64),
      sizeBytes: 1_024,
      kind: "image" as const,
      mediaType: "image/png"
    }
    const messages = [
      message(1, "turn_old_tool", "user", [text("old_user", "u".repeat(700))]),
      message(2, "turn_old_tool", "assistant", [{
        type: "tool_call",
        id: "tool_call_part",
        toolCallId: "call_context",
        toolName: "inspect",
        input: { target: "workspace" }
      }]),
      message(3, "turn_old_tool", "tool", [
        toolResultPart(
          "call_context",
          [
            { type: "text", text: "tool-output-".repeat(150) },
            resource
          ],
          false
        )
      ]),
      message(4, "turn_old_tool", "assistant", [text("old_final", "a".repeat(500))]),
      message(5, "turn_old_second", "user", [text("second_user", "b".repeat(900))]),
      message(6, "turn_old_second", "assistant", [text("second_reply", "c".repeat(900))]),
      message(7, "turn_recent", "user", [text("recent_user", "d".repeat(500))]),
      message(8, "turn_recent", "assistant", [text("recent_reply", "e".repeat(500))])
    ]
    const canonical = structuredClone(messages)
    const prepared = prepareContextCompaction({
      sessionId: "ses_context",
      messages,
      turns: [
        turn("turn_old_tool", "succeeded"),
        turn("turn_old_second", "succeeded"),
        turn("turn_recent", "succeeded")
      ],
      activeEpoch: null,
      modelEndpoint: executionBinding("planning", 6_000, 1_000).modelEndpoint,
      tokenEstimator: characterTokenEstimator(),
      policy: {
        reserveInputTokens: 1_000,
        keepRecentTokens: 100,
        minimumRecentTurns: 1,
        maxSummaryOutputTokens: 100,
        maxSerializedToolResultChars: 80,
        minimumTokenSavings: 1
      }
    })

    expect(prepared).toMatchObject({
      decision: "submit",
      reason: "above_waterline",
      evidence: {
        cutSequence: 6,
        cutMessageId: "msg_6",
        retainedFromSequence: 7,
        retainedFromMessageId: "msg_7"
      }
    })
    const serialized = prepared.providerMessages?.[1]?.content[0]
    expect(serialized).toMatchObject({ type: "text" })
    const sourceText = serialized?.type === "text" ? serialized.text : ""
    expect(sourceText).toContain("tool call id=call_context name=inspect")
    expect(sourceText).toContain("resource_context_image")
    expect(sourceText).toContain("[truncated ")
    expect(sourceText).not.toContain("bytes")
    expect(messages).toEqual(canonical)
  })

  it("reconstructs exact frozen evidence and rejects changed canonical input", () => {
    const messages = simpleConversation()
    const prepared = prepareContextCompaction({
      sessionId: "ses_context",
      messages,
      turns: [
        turn("turn_1", "succeeded"),
        turn("turn_2", "succeeded"),
        turn("turn_3", "succeeded")
      ],
      activeEpoch: null,
      modelEndpoint: executionBinding("reconstruct", 5_000, 500).modelEndpoint,
      tokenEstimator: characterTokenEstimator(),
      policy: compactPolicy()
    })
    if (prepared.evidence === undefined) {
      throw new Error("expected frozen compaction evidence")
    }
    const reconstructed = reconstructContextCompaction({
      evidence: prepared.evidence,
      messages,
      activeEpoch: null,
      tokenEstimator: characterTokenEstimator()
    })
    expect(reconstructed.sourceDigest).toBe(prepared.evidence.sourceDigest)
    expect(reconstructed.requestDigest).toBe(prepared.evidence.requestDigest)

    const changed = messages.map((item) =>
      item.sequence === 2
        ? { ...item, content: [text("changed", "changed canonical content")] }
        : item
    )
    expect(() => reconstructContextCompaction({
      evidence: prepared.evidence!,
      messages: changed,
      activeEpoch: null,
      tokenEstimator: characterTokenEstimator()
    })).toThrow(/source or request digest changed/)
  })

  it("merges the previous summary with only the new compacted span", async () => {
    const messages = simpleConversation()
    const previous = activeEpoch({
      id: "ctxepoch_previous",
      cut: messages[1]!,
      retained: messages[2]!,
      summary: "## Goal\nPrevious semantic checkpoint"
    })
    const prepared = prepareContextCompaction({
      sessionId: "ses_context",
      messages,
      turns: [
        turn("turn_1", "succeeded"),
        turn("turn_2", "succeeded"),
        turn("turn_3", "succeeded")
      ],
      activeEpoch: previous,
      modelEndpoint: executionBinding("incremental", 5_000, 500).modelEndpoint,
      tokenEstimator: characterTokenEstimator(),
      policy: compactPolicy()
    })
    expect(prepared.evidence).toMatchObject({
      previousEpochId: previous.id,
      previousSummaryDigest: previous.summaryDigest,
      cutSequence: 4,
      retainedFromSequence: 5
    })
    const sourcePart = prepared.providerMessages?.[1]?.content[0]
    const sourceText = sourcePart?.type === "text" ? sourcePart.text : ""
    expect(sourceText).toContain("Previous semantic checkpoint")
    expect(sourceText).toContain("new-span-marker")
    expect(sourceText).not.toContain("old-span-marker")

    const current = activeEpoch({
      id: "ctxepoch_current",
      cut: messages[3]!,
      retained: messages[4]!,
      previous,
      summary: "## Goal\nMerged semantic checkpoint"
    })
    const compiler = new SemanticContextCompiler({
      epochStore: {
        async getActiveContextEpoch() {
          return current
        }
      },
      tokenEstimator: characterTokenEstimator()
    })
    const canonical = structuredClone(messages)
    const compiled = await compiler.compile({
      sessionId: "ses_context",
      inputs: [systemInput()],
      messages
    })

    expect(compiled.epochId).toBe(current.id)
    expect(compiled.messages.map((item) => item.role)).toEqual([
      "system",
      "assistant",
      "user",
      "assistant"
    ])
    expect(compiled.messages[1]?.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Merged semantic checkpoint")
    })
    expect(compiled.messages.slice(2)).toEqual(
      messages.slice(4).map((item) => ({ role: item.role, content: item.content }))
    )
    expect(messages).toEqual(canonical)
    expect(compiled.stats.tokenEstimateAfter).toBeLessThan(
      compiled.stats.tokenEstimateBefore
    )
  })

  it("keeps the compiled provider prefix stable as complete turns append", async () => {
    const initialMessages = simpleConversation()
    const current = activeEpoch({
      id: "ctxepoch_prefix_stability",
      cut: initialMessages[3]!,
      retained: initialMessages[4]!,
      summary: "## Goal\nStable semantic checkpoint"
    })
    const compiler = new SemanticContextCompiler({
      epochStore: {
        async getActiveContextEpoch() {
          return current
        }
      },
      tokenEstimator: characterTokenEstimator()
    })
    const inputs = [systemInput()]
    const before = await compiler.compile({
      sessionId: "ses_context",
      inputs,
      messages: initialMessages
    })
    const appendedMessages = [
      ...initialMessages,
      message(7, "turn_4", "user", [text("later_user", "later question")]),
      message(8, "turn_4", "assistant", [text("later_reply", "later answer")])
    ]
    const after = await compiler.compile({
      sessionId: "ses_context",
      inputs,
      messages: appendedMessages
    })

    expect(after.epochId).toBe(before.epochId)
    expect(after.messages.slice(0, before.messages.length)).toEqual(before.messages)
    expect(after.messages.slice(before.messages.length)).toEqual([
      { role: "user", content: [text("later_user", "later question")] },
      { role: "assistant", content: [text("later_reply", "later answer")] }
    ])
  })

  it("never cuts through a non-terminal turn", () => {
    const messages = simpleConversation()
    const prepared = prepareContextCompaction({
      sessionId: "ses_context",
      messages,
      turns: [
        turn("turn_1", "succeeded"),
        turn("turn_2", "running"),
        turn("turn_3", "succeeded")
      ],
      activeEpoch: null,
      modelEndpoint: executionBinding("unsafe", 5_000, 500).modelEndpoint,
      tokenEstimator: characterTokenEstimator(),
      policy: compactPolicy()
    })
    expect(prepared).toMatchObject({
      decision: "skip",
      reason: "unsafe_turn_boundary"
    })
  })
})

function compactPolicy() {
  return {
    reserveInputTokens: 500,
    keepRecentTokens: 100,
    minimumRecentTurns: 1,
    maxSummaryOutputTokens: 100,
    maxSerializedToolResultChars: 100,
    minimumTokenSavings: 1
  } as const
}

function simpleConversation(): SessionMessageRecord[] {
  return [
    message(1, "turn_1", "user", [text("old_user", `old-span-marker ${"a".repeat(800)}`)]),
    message(2, "turn_1", "assistant", [text("old_reply", "b".repeat(700))]),
    message(3, "turn_2", "user", [text("new_user", `new-span-marker ${"c".repeat(800)}`)]),
    message(4, "turn_2", "assistant", [text("new_reply", "d".repeat(700))]),
    message(5, "turn_3", "user", [text("recent_user", "e".repeat(1_500))]),
    message(6, "turn_3", "assistant", [text("recent_reply", "f".repeat(1_500))])
  ]
}

function text(id: string, value: string): MessagePart {
  return { type: "text", id, text: value }
}

function message(
  sequence: number,
  turnId: string,
  role: SessionMessageRecord["role"],
  content: readonly MessagePart[]
): SessionMessageRecord {
  return {
    id: `msg_${sequence}`,
    sessionId: "ses_context",
    sequence,
    turnId,
    attemptId: `attempt_${turnId}`,
    ...(role === "user" ? { inputId: `input_${turnId}` } : {}),
    role,
    status: "completed",
    content,
    executionBindingDigest: `binding_${turnId}`,
    createdAt: sequence,
    updatedAt: sequence
  }
}

function turn(
  id: string,
  state: SessionTurnRecord["state"]
): SessionTurnRecord {
  return {
    id,
    sessionId: "ses_context",
    primaryInputId: `input_${id}`,
    jobId: `job_${id}`,
    state,
    executionBinding: executionBinding(id, 5_000, 1_000),
    maxSteps: 8,
    createdAt: 1,
    updatedAt: 1,
    ...(state === "running" ? {} : { finishedAt: 1 })
  }
}

function executionBinding(
  label: string,
  contextWindowTokens?: number,
  maxOutputTokens?: number,
  maxInputTokens?: number
) {
  const endpoint = fakeModelEndpoint(label)
  const model = {
    ...endpoint.model,
    ...(contextWindowTokens === undefined
      ? {}
      : {
          limits: {
            contextWindowTokens,
            ...(maxInputTokens === undefined
              ? {}
              : { maxInputTokens }),
            ...(maxOutputTokens === undefined
              ? {}
              : { maxOutputTokens })
          }
        })
  }
  return createTurnExecutionBinding({
    modelEndpoint: { ...endpoint, model },
    createdAt: 1
  })
}

function activeEpoch(options: {
  readonly id: string
  readonly cut: SessionMessageRecord
  readonly retained: SessionMessageRecord
  readonly previous?: ContextEpochRecord
  readonly summary: string
}): ContextEpochRecord {
  const previousSummaryDigest = options.previous?.summaryDigest
  if (options.previous !== undefined && previousSummaryDigest === undefined) {
    throw new Error("previous active epoch is missing its summary digest")
  }
  return {
    id: options.id,
    sessionId: "ses_context",
    jobId: `job_${options.id}`,
    state: "active",
    generationState: "succeeded",
    generationAttempt: 1,
    maxProviderAttempts: 2,
    ...(options.previous === undefined
      ? {}
      : {
          previousEpochId: options.previous.id,
          previousSummaryDigest: previousSummaryDigest!
        }),
    sourceHeadSequence: 6,
    sourceHeadMessageId: "msg_6",
    cutSequence: options.cut.sequence,
    cutMessageId: options.cut.id,
    retainedFromSequence: options.retained.sequence,
    retainedFromMessageId: options.retained.id,
    sourceDigest: "1".repeat(64),
    policy: { algorithm: "semantic-summary" },
    policyDigest: "2".repeat(64),
    modelEndpoint: executionBinding(options.id, 3_000, 500).modelEndpoint,
    requestDigest: "3".repeat(64),
    summary: options.summary,
    summaryDigest: contextTextDigest(options.summary),
    tokenEstimateBefore: 2_000,
    tokenEstimateAfter: 500,
    tokenSavings: 1_500,
    createdAt: 1,
    activatedAt: 2,
    finishedAt: 2,
    updatedAt: 2
  }
}

function systemInput(): SessionInputRecord {
  return {
    id: "input_system",
    sessionId: "ses_context",
    principalId: "instruction-runtime",
    idempotencyKey: "instruction-runtime:ses_context",
    inputType: "system",
    content: [text("system_instruction", "Follow project instructions")],
    status: "completed",
    createdAt: 0,
    updatedAt: 0
  }
}

function characterTokenEstimator(): ContextTokenEstimator {
  const estimatePartTokens: ContextTokenEstimator["estimatePartTokens"] = (part) => {
    if (part.type === "text" || part.type === "reasoning") {
      return part.text?.length ?? 0
    }
    if (part.type === "tool_result") {
      return part.content.reduce((total, item) => {
        if (item.type === "text") return total + item.text.length
        if (item.type === "json") return total + JSON.stringify(item.value).length
        return total + 16
      }, 0)
    }
    return 16
  }
  const estimatePartsTokens: ContextTokenEstimator["estimatePartsTokens"] =
    (parts) => parts.reduce((total, part) => total + estimatePartTokens(part), 0)
  return {
    estimatePartTokens,
    estimatePartsTokens,
    estimateMessagesTokens(messages) {
      return messages.reduce(
        (total, item) => total + 4 + estimatePartsTokens(item.content),
        0
      )
    }
  }
}
