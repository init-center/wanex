import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"
import {
  DeepSeekThinkingAdapter,
  MissingRequiredProviderStateError,
  consumeProviderStream,
  type ProviderFetch
} from "../src/provider/index.js"
import { createStartedTurn } from "./durable-turn-test-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []
const clients: StorageTestStore[] = []

afterEach(async () => {
  while (clients.length > 0) {
    await clients.pop()?.dispose()
  }
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("DeepSeek provider fidelity", () => {
  it("fails closed when required same-model reasoning state is missing", () => {
    const adapter = createAdapter()
    expect(() =>
      adapter.buildReplayMessages([
        {
          role: "assistant",
          content: [
            {
              type: "tool_call",
              id: "part_call",
              toolCallId: "call_1",
              toolName: "lookup",
              input: {}
            }
          ]
        }
      ])
    ).toThrow(MissingRequiredProviderStateError)
  })

  it("preserves streamed reasoning through durable session messages and replay", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-llm-fidelity-"))
    tempDirs.push(storeDir)
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })
    clients.push(storage)
    const adapter = createAdapter()
    const result = await consumeProviderStream({
      provider: adapter,
      request: { messages: [] }
    })

    const fixture = await createStartedTurn(storage, {
      suffix: "llm_fidelity",
      content: [{ type: "text", id: "part_user", text: "use a tool" }]
    })
    await fixture.session.appendMessage({
      ...fixture.execution,
      idempotencyKey: "deepseek_reasoning_message",
      role: "assistant",
      content: result.parts,
      providerState: result.providerState
    })

    const messages = await fixture.session.listMessages({
      sessionId: fixture.execution.sessionId
    })
    const replay = adapter.buildReplayMessages([
      { role: "assistant", content: messages[1]!.content }
    ])
    expect(replay[0]).toMatchObject({
      role: "assistant",
      reasoning_content: "durable reasoning"
    })
  })
})

function createAdapter(): DeepSeekThinkingAdapter {
  return new DeepSeekThinkingAdapter({
    modelId: "deepseek-v4",
    baseUrl: "https://api.deepseek.example/v1",
    apiKey: "secret",
    fetch: fixtureFetch()
  })
}

function fixtureFetch(): ProviderFetch {
  return async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    body: chunks(
      'data: {"choices":[{"delta":{"reasoning_content":"durable reasoning","content":"Calling tool.","tool_calls":[{"index":0,"id":"call_1","function":{"name":"lookup","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\n' +
        "data: [DONE]\n\n"
    ),
    async text() {
      return ""
    }
  })
}

async function* chunks(value: string) {
  for (let offset = 0; offset < value.length; offset += 13) {
    yield value.slice(offset, offset + 13)
  }
}
