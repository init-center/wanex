import { describe, expect, it } from "vitest"
import {
  DeepSeekThinkingAdapter,
  OpenAICompatibleAdapter,
  consumeProviderStream,
  type ProviderFetch
} from "../src/provider/index.js"

describe("OpenAI-compatible streaming provider", () => {
  it("parses split SSE text, reasoning, tool calls, usage, and finish", async () => {
    const requests: unknown[] = []
    const adapter = new OpenAICompatibleAdapter({
      providerId: "openai-compatible",
      modelId: "model-a",
      baseUrl: "https://api.example/v1/",
      apiKey: "secret",
      fetch: fixtureFetch([
        'data: {"choices":[{"delta":{"reasoning_content":"think "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"do", "tool_calls":[{"index":0,"id":"call_1","function":{"name":"look","arguments":"{\\"q\\":"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"ne","tool_calls":[{"index":0,"function":{"name":"up","arguments":"\\"wanex\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":4,"output_tokens_details":{"reasoning_tokens":2}}}\n\n',
        'data: [DONE]\n\n'
      ], requests)
    })

    const result = await consumeProviderStream({
      provider: adapter,
      request: { messages: [{ role: "user", content: [{ type: "text", id: "u", text: "hi" }] }] }
    })

    expect(requests[0]).toMatchObject({
      model: "model-a",
      stream: true,
      stream_options: { include_usage: true }
    })
    expect(result.parts).toMatchObject([
      { type: "reasoning", text: "think " },
      { type: "text", text: "done" },
      { type: "tool_call", toolCallId: "call_1", toolName: "lookup", input: { q: "wanex" } }
    ])
    expect(result.usage).toMatchObject({ inputTokens: 10, outputTokens: 4, reasoningTokens: 2 })
    expect(result.finish.reason).toBe("tool_calls")
  })

  it("classifies HTTP errors and retry-after", async () => {
    const adapter = new OpenAICompatibleAdapter({
      providerId: "openai",
      modelId: "model",
      baseUrl: "https://api.example/v1",
      apiKey: "secret",
      fetch: async () => ({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        body: null,
        headers: { get: () => "2" },
        async text() { return "limited" }
      })
    })
    await expect(consumeProviderStream({ provider: adapter, request: { messages: [] } }))
      .rejects.toMatchObject({ detail: { category: "rate_limit", retryable: true, retryAfterMs: 2000 } })
  })

  it("accepts normal EOF after finish and classifies malformed wire data", async () => {
    const eofAdapter = new OpenAICompatibleAdapter({
      providerId: "compatible",
      modelId: "model",
      baseUrl: "https://api.example/v1",
      apiKey: "secret",
      fetch: fixtureFetch([
        'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n'
      ])
    })
    await expect(consumeProviderStream({ provider: eofAdapter, request: { messages: [] } }))
      .resolves.toMatchObject({ finish: { reason: "stop" } })

    const malformedAdapter = new OpenAICompatibleAdapter({
      providerId: "compatible",
      modelId: "model",
      baseUrl: "https://api.example/v1",
      apiKey: "secret",
      fetch: fixtureFetch(["data: {not-json}\n\n"])
    })
    await expect(consumeProviderStream({ provider: malformedAdapter, request: { messages: [] } }))
      .rejects.toMatchObject({ detail: { category: "protocol", retryable: false } })
  })

  it("preserves required DeepSeek reasoning for same-model replay", async () => {
    const adapter = new DeepSeekThinkingAdapter({
      modelId: "deepseek-v4",
      baseUrl: "https://api.deepseek.example/v1",
      apiKey: "secret",
      fetch: fixtureFetch([
        'data: {"choices":[{"delta":{"reasoning_content":"private","tool_calls":[{"index":0,"id":"call_1","function":{"name":"lookup","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n'
      ])
    })
    const result = await consumeProviderStream({ provider: adapter, request: { messages: [] } })
    expect(result.parts[0]).toMatchObject({
      type: "reasoning",
      providerState: { replayPolicy: "required", payload: { reasoning_content: "private" } }
    })
    expect(adapter.buildReplayMessages([{ role: "assistant", content: result.parts }])[0])
      .toMatchObject({ reasoning_content: "private" })
  })
})

function fixtureFetch(
  chunks: readonly string[],
  requests: unknown[] = []
): ProviderFetch {
  return async (_input, init) => {
    requests.push(JSON.parse(init.body))
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      body: splitChunks(chunks.join(""), [1, 7, 2, 19, 3, 41]),
      async text() { return "" }
    }
  }
}

async function* splitChunks(value: string, sizes: readonly number[]) {
  let offset = 0
  let index = 0
  while (offset < value.length) {
    const size = sizes[index % sizes.length]!
    yield new TextEncoder().encode(value.slice(offset, offset + size))
    offset += size
    index += 1
  }
}
