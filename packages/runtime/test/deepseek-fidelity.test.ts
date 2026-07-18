import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore } from "@wanex/storage/testing"
import { WanexSessionCore } from "../src/sessions/index.js"
import {
  DeepSeekThinkingAdapter,
  MissingRequiredProviderStateError,
  consumeProviderStream,
  type ProviderFetch
} from "../src/provider/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)
const tempDirs: string[] = []

afterEach(async () => {
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
    const sessionCore = new WanexSessionCore({
      storage: createStorageTestStore({
        kind: "local-system-service",
        mode: "oneshot",
        storeDir,
        serviceBin
      })
    })
    const adapter = createAdapter()
    const result = await consumeProviderStream({
      provider: adapter,
      request: { messages: [] }
    })

    const session = await sessionCore.create({ id: "ses_llm_fidelity" })
    const receipt = await sessionCore.admit({
      id: "inp_llm_fidelity",
      sessionId: session.id,
      principalId: "user_llm",
      idempotencyKey: "idem_llm",
      content: [{ type: "text", id: "part_user", text: "use a tool" }]
    })
    const claim = await sessionCore.claimRunner({
      sessionId: session.id,
      runnerId: "runner_llm",
      leaseMs: 60_000
    })
    expect(claim?.inputId).toBe(receipt.inputId)
    await sessionCore.completeRun({
      sessionId: session.id,
      runId: claim!.runId,
      inputId: claim!.inputId,
      runnerId: claim!.runnerId,
      leaseToken: claim!.leaseToken,
      assistantMessage: result.parts
    })

    const messages = await sessionCore.listMessages({ sessionId: session.id })
    const replay = adapter.buildReplayMessages([
      { role: "assistant", content: messages[0]!.content }
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
