import { describe, expect, it } from "vitest"
import {
  FakeProviderAdapter,
  ProviderStreamError,
  consumeProviderStream,
  type ProviderAdapter,
  type ProviderEvent
} from "../src/provider/index.js"
import { testConversationModel } from "./model-endpoint-fixture.js"

describe("provider stream contract", () => {
  it("assembles canonical text and terminal metadata", async () => {
    const events: ProviderEvent[] = []
    const result = await consumeProviderStream({
      provider: new FakeProviderAdapter({ responseText: "hello" }),
      request: { messages: [] },
      observe: (event) => events.push(event)
    })

    expect(events.map((event) => event.type)).toEqual(["text_delta", "finish"])
    expect(result.parts).toEqual([{ type: "text", id: "text_0", text: "hello" }])
    expect(result.finish.reason).toBe("stop")
  })

  it("assembles tool calls only after a complete lifecycle", async () => {
    const result = await consumeProviderStream({
      provider: new FakeProviderAdapter({ responseText: "unused", toolName: "lookup" }),
      request: { messages: [] }
    })

    expect(result.parts).toEqual([
      {
        type: "tool_call",
        id: "tool_call_0",
        toolCallId: "call_fake_0",
        toolName: "lookup",
        input: { source: "fake-provider" }
      }
    ])
  })

  it("fails closed on missing and duplicate terminal events", async () => {
    await expect(consumeProviderStream({ provider: scripted([
      { type: "text_delta", partId: "text", delta: "partial" }
    ]), request: { messages: [] } })).rejects.toMatchObject({
      detail: { category: "protocol", outputObserved: true }
    })

    await expect(consumeProviderStream({ provider: scripted([
      { type: "finish", reason: "stop" },
      { type: "finish", reason: "stop" }
    ]), request: { messages: [] } })).rejects.toBeInstanceOf(ProviderStreamError)
  })

  it("reports structured failure after partial output", async () => {
    await expect(consumeProviderStream({ provider: scripted([
      { type: "text_delta", partId: "text", delta: "partial" },
      { type: "error", error: {
        category: "server",
        message: "upstream failed",
        retryable: true,
        providerId: "scripted",
        modelId: "fixture",
        phase: "stream",
        statusCode: 503
      } }
    ]), request: { messages: [] } })).rejects.toMatchObject({
      detail: { category: "server", outputObserved: true, statusCode: 503 }
    })
  })

  it("fails closed on incomplete tool calls and invalid tool JSON", async () => {
    await expect(consumeProviderStream({ provider: scripted([
      { type: "tool_call_start", index: 0, toolCallId: "call_incomplete" },
      { type: "finish", reason: "tool_calls" }
    ]), request: { messages: [] } })).rejects.toMatchObject({
      detail: { category: "protocol", outputObserved: true }
    })

    await expect(consumeProviderStream({ provider: scripted([
      { type: "tool_call_start", index: 0, toolCallId: "call_invalid" },
      { type: "tool_call_delta", toolCallId: "call_invalid", toolNameDelta: "lookup", inputJsonDelta: "{" },
      { type: "tool_call_end", toolCallId: "call_invalid" },
      { type: "finish", reason: "tool_calls" }
    ]), request: { messages: [] } })).rejects.toMatchObject({
      detail: { category: "protocol", outputObserved: true }
    })
  })

  it("requires finish reason and assembled tool calls to agree", async () => {
    await expect(consumeProviderStream({ provider: scripted([
      { type: "finish", reason: "tool_calls" }
    ]), request: { messages: [] } })).rejects.toMatchObject({
      detail: {
        category: "protocol",
        message: "provider finished with tool_calls but emitted no tool call",
        outputObserved: false
      }
    })

    await expect(consumeProviderStream({ provider: scripted([
      { type: "tool_call_start", index: 0, toolCallId: "call_mismatch" },
      {
        type: "tool_call_delta",
        toolCallId: "call_mismatch",
        toolNameDelta: "lookup",
        inputJsonDelta: "{}"
      },
      { type: "tool_call_end", toolCallId: "call_mismatch" },
      { type: "finish", reason: "stop" }
    ]), request: { messages: [] } })).rejects.toMatchObject({
      detail: {
        category: "protocol",
        message: "provider emitted a tool call but finished with stop",
        outputObserved: true
      }
    })
  })

  it("normalizes an already-aborted request as a structured terminal error", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(consumeProviderStream({
      provider: new FakeProviderAdapter({ responseText: "unused" }),
      request: { messages: [], signal: controller.signal }
    })).rejects.toMatchObject({
      detail: { category: "aborted", retryable: false, outputObserved: false }
    })
  })

  it("ignores observer failure without changing provider completion", async () => {
    const result = await consumeProviderStream({
      provider: new FakeProviderAdapter({ responseText: "durable" }),
      request: { messages: [] },
      observe() { throw new Error("detached UI") }
    })
    expect(result.parts).toMatchObject([{ type: "text", text: "durable" }])
  })

  it("rejects decreasing cumulative usage", async () => {
    await expect(consumeProviderStream({ provider: scripted([
      { type: "usage", usage: { outputTokens: 10 } },
      { type: "usage", usage: { outputTokens: 9 } },
      { type: "finish", reason: "stop" }
    ]), request: { messages: [] } })).rejects.toMatchObject({
      detail: { category: "protocol", outputObserved: false }
    })
  })
})

function scripted(events: readonly ProviderEvent[]): ProviderAdapter {
  return {
    protocol: { id: "fake" },
    providerId: "scripted",
    model: testConversationModel("fixture"),
    async *stream() { yield* events },
    buildReplayMessages() { return [] }
  }
}
