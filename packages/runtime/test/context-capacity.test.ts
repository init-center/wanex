import { describe, expect, it } from "vitest"
import {
  estimateContextCapacity
} from "../src/context/capacity/index.js"
import { durableContextCapacityError } from "../src/context/capacity/durable-error.js"
import { testConversationModel } from "./model-endpoint-fixture.js"

describe("Runtime Provider request capacity projection", () => {
  it("serializes bounded deduplicated durable failure evidence", () => {
    const error = durableContextCapacityError({
      estimate: {
        replayTokens: 900,
        toolDefinitionTokens: 1,
        inputTokens: 901,
        inputResources: 0,
        requestedOutputTokens: 100,
        contextWindowTokens: 800,
        inputTokenCeiling: 700,
        tokenStatus: "exceeds",
        resourceStatus: "unknown",
        decision: "compact",
        reasons: ["input_tokens_exceeded", "input_tokens_exceeded"]
      },
      compactionAttempted: true,
      compactionReason: "r".repeat(2_000)
    })

    expect(error).toMatchObject({
      kind: "session_turn.context_capacity_exceeded",
      capacity: {
        reasons: ["input_tokens_exceeded"],
        inputTokens: 901,
        inputTokenCeiling: 700,
        compactionAttempted: true
      }
    })
    expect(error.message.length).toBeLessThanOrEqual(512)
    expect(error.capacity.compactionReason).toHaveLength(1_024)
  })

  it("keeps missing token limits explicit instead of guessing a window", () => {
    const estimate = estimateContextCapacity({
      messages: [{
        role: "user",
        content: [{ type: "text", id: "unknown", text: "hello" }]
      }],
      tools: [],
      model: testConversationModel("capacity_unknown"),
      maxOutputTokens: 4_096
    })

    expect(estimate).toMatchObject({
      tokenStatus: "unknown",
      resourceStatus: "unknown",
      decision: "dispatch"
    })
    expect(estimate.inputTokenCeiling).toBeUndefined()
  })

  it("counts Tool schemas as input and applies the independent input ceiling", () => {
    const estimate = estimateContextCapacity({
      messages: [{
        role: "user",
        content: [{ type: "text", id: "tool", text: "hello" }]
      }],
      tools: [{
        name: "large_schema",
        description: "d".repeat(400),
        inputSchema: { type: "object" }
      }],
      model: testConversationModel("capacity_tools", {
        limits: {
          contextWindowTokens: 10_000,
          maxInputTokens: 50,
          maxOutputTokens: 100
        }
      }),
      maxOutputTokens: 100
    })

    expect(estimate.toolDefinitionTokens).toBeGreaterThan(50)
    expect(estimate).toMatchObject({
      inputTokenCeiling: 50,
      tokenStatus: "exceeds",
      decision: "compact",
      reasons: ["input_tokens_exceeded"]
    })
  })

  it("counts direct and Tool-result resources across the complete replay", () => {
    const estimate = estimateContextCapacity({
      messages: [
        {
          role: "user",
          content: [{
            type: "resource",
            id: "resource_part",
            resourceId: "resource_direct",
            kind: "image",
            sizeBytes: 1,
            sha256: "a".repeat(64),
            bytes: new Uint8Array([1])
          }]
        },
        {
          role: "tool",
          content: [{
            type: "tool_result",
            id: "tool_result_part",
            toolCallId: "call_resource",
            contentDigest: "b".repeat(64),
            isError: false,
            content: [{
              type: "resource",
              resourceId: "resource_tool",
              kind: "image",
              sizeBytes: 1,
              sha256: "c".repeat(64),
              bytes: new Uint8Array([2])
            }]
          }]
        }
      ],
      tools: [],
      model: testConversationModel("capacity_resources", {
        inputModalities: ["text", "image"],
        limits: { maxInputResources: 1 }
      }),
      maxOutputTokens: 100
    })

    expect(estimate).toMatchObject({
      inputResources: 2,
      tokenStatus: "unknown",
      resourceStatus: "exceeds",
      decision: "compact",
      reasons: ["input_resources_exceeded"]
    })
  })
})
