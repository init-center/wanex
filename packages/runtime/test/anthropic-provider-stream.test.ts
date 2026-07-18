import { describe, expect, it } from "vitest"
import {
  AnthropicAdapter,
  consumeProviderStream,
  type ProviderFetch
} from "../src/provider/index.js"

describe("Anthropic streaming provider", () => {
  it("translates text, thinking, tool input, usage, and finish", async () => {
    const requests: unknown[] = []
    const adapter = new AnthropicAdapter({
      modelId: "claude-fixture",
      baseUrl: "https://api.anthropic.example/v1",
      apiKey: "secret",
      fetch: fixtureFetch([
        { type: "message_start", message: { usage: { input_tokens: 12, cache_read_input_tokens: 3 } } },
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "consider" } },
        { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig" } },
        { type: "content_block_stop", index: 0 },
        { type: "content_block_start", index: 1, content_block: { type: "text", text: "I will " } },
        { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "check" } },
        { type: "content_block_stop", index: 1 },
        { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "tool_1", name: "lookup", input: {} } },
        { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"q":"wanex"}' } },
        { type: "content_block_stop", index: 2 },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 9 } },
        { type: "message_stop" }
      ], requests)
    })

    const result = await consumeProviderStream({ provider: adapter, request: { messages: [] } })
    expect(result.parts).toMatchObject([
      { type: "reasoning", text: "consider", providerState: { replayPolicy: "required" } },
      { type: "text", text: "I will check" },
      { type: "tool_call", toolCallId: "tool_1", toolName: "lookup", input: { q: "wanex" } }
    ])
    expect(result.usage).toMatchObject({ inputTokens: 12, outputTokens: 9, cacheReadTokens: 3 })
    expect(result.finish.reason).toBe("tool_calls")
    expect(adapter.buildReplayMessages([{ role: "assistant", content: result.parts }])[0])
      .toMatchObject({ content: [
        { type: "thinking", thinking: "consider", signature: "sig" },
        { type: "text", text: "I will check" },
        { type: "tool_use", id: "tool_1", name: "lookup" }
      ] })
    expect(requests[0]).toMatchObject({ stream: true, max_tokens: 4096 })
  })

  it("projects system context through the Anthropic top-level field", async () => {
    const requests: unknown[] = []
    const adapter = new AnthropicAdapter({
      modelId: "claude-fixture",
      baseUrl: "https://api.anthropic.example/v1",
      apiKey: "secret",
      fetch: fixtureFetch([
        { type: "message_start", message: { usage: { input_tokens: 1 } } },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 0 } },
        { type: "message_stop" }
      ], requests)
    })
    await consumeProviderStream({ provider: adapter, request: { messages: [
      { role: "system", content: [{ type: "text", id: "sys", text: "system policy" }] },
      { role: "user", content: [{ type: "text", id: "user", text: "hello" }] }
    ] } })
    expect(requests[0]).toMatchObject({
      system: "system policy",
      messages: [{ role: "user", content: "hello" }]
    })
  })
})

function fixtureFetch(events: readonly unknown[], requests: unknown[] = []): ProviderFetch {
  return async (_input, init) => {
    requests.push(JSON.parse(init.body))
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      body: chunks(
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")
      ),
      async text() {
        return ""
      }
    }
  }
}

async function* chunks(value: string) {
  for (let offset = 0; offset < value.length; offset += 11) {
    yield value.slice(offset, offset + 11)
  }
}
