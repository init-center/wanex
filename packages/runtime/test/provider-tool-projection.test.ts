import { describe, expect, it } from "vitest"
import {
  AnthropicAdapter,
  OpenAICompatibleAdapter,
  consumeProviderStream,
  type ProviderFetch,
  type ProviderToolDefinition
} from "../src/provider/index.js"
import { testConversationModel } from "./model-endpoint-fixture.js"

const tools: readonly ProviderToolDefinition[] = [
  {
    name: "lookup",
    description: "Look up one query.",
    inputSchema: {
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
      additionalProperties: false
    }
  }
]

describe("provider tool projection", () => {
  it("projects normalized tools and named choice to OpenAI wire fields", async () => {
    const bodies: unknown[] = []
    const adapter = new OpenAICompatibleAdapter({
      providerId: "openai",
      model: testConversationModel("model"),
      baseUrl: "https://api.example/v1",
      apiKey: "secret",
      fetch: openAIFetch(bodies)
    })
    await consumeProviderStream({
      provider: adapter,
      request: {
        messages: [],
        tools,
        toolChoice: { name: "lookup" },
        parallelToolCalls: true
      }
    })
    expect(bodies[0]).toMatchObject({
      tools: [{
        type: "function",
        function: {
          name: "lookup",
          description: "Look up one query.",
          parameters: { type: "object" }
        }
      }],
      tool_choice: { type: "function", function: { name: "lookup" } },
      parallel_tool_calls: true
    })
  })

  it("projects required choice and serial control to Anthropic wire fields", async () => {
    const bodies: unknown[] = []
    const adapter = new AnthropicAdapter({
      providerId: "anthropic",
      model: testConversationModel("claude"),
      baseUrl: "https://api.example/v1",
      apiKey: "secret",
      fetch: anthropicFetch(bodies)
    })
    await consumeProviderStream({
      provider: adapter,
      request: {
        messages: [],
        tools,
        toolChoice: "required",
        parallelToolCalls: false
      }
    })
    expect(bodies[0]).toMatchObject({
      tools: [{
        name: "lookup",
        description: "Look up one query.",
        input_schema: { type: "object" }
      }],
      tool_choice: { type: "any", disable_parallel_tool_use: true }
    })
  })
})

function openAIFetch(bodies: unknown[]): ProviderFetch {
  return async (_input, init) => {
    bodies.push(JSON.parse(init.body))
    return response([
      'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n"
    ])
  }
}

function anthropicFetch(bodies: unknown[]): ProviderFetch {
  return async (_input, init) => {
    bodies.push(JSON.parse(init.body))
    return response([
      'data: {"type":"message_start","message":{"usage":{"input_tokens":1}}}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n',
      'data: {"type":"message_stop"}\n\n'
    ])
  }
}

function response(chunks: readonly string[]) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: (async function* () { yield* chunks })(),
    async text() { return "" }
  }
}
