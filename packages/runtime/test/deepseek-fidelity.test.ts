import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"
import {
  MissingRequiredProviderStateError,
  OpenAICompatibleAdapter,
  consumeProviderStream,
  type ProviderFetch
} from "../src/provider/index.js"
import { prepareProviderReplayResources } from "../src/resources/index.js"
import { WanexSessionCore } from "../src/sessions/index.js"
import { createStartedTurn } from "./durable-turn-test-fixture.js"
import { testConversationModel } from "./model-endpoint-fixture.js"

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

  it("reconstructs required reasoning replay after storage process replacement", async () => {
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

    const storageIndex = clients.indexOf(storage)
    if (storageIndex < 0) {
      throw new Error("DeepSeek test storage client is not registered")
    }
    clients.splice(storageIndex, 1)
    await storage.dispose()
    const reopened = createStorageTestStore({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })
    clients.push(reopened)
    const reopenedSession = new WanexSessionCore({ storage: reopened })
    const messages = await reopenedSession.listMessages({
      sessionId: fixture.execution.sessionId
    })
    const prepared = await prepareProviderReplayResources(
      reopened,
      {
        protocol: adapter.protocol,
        inputModalities: adapter.model.inputModalities
      },
      [{ role: "assistant", content: messages[1]!.content }]
    )
    const replay = adapter.buildReplayMessages(prepared)
    expect(replay[0]).toMatchObject({
      role: "assistant",
      reasoning_content: "durable reasoning"
    })
  })

  it("replays reasoning only for assistant tool-call turns", () => {
    const adapter = createAdapter()
    const reasoning = reasoningPart("private chain of thought")

    const [ordinary] = adapter.buildReplayMessages([{
      role: "assistant",
      content: [reasoning, { type: "text", id: "part_text", text: "Visible answer" }]
    }])
    expect(ordinary).toEqual({
      role: "assistant",
      content: "Visible answer"
    })

    const [reasoningOnly] = adapter.buildReplayMessages([{
      role: "assistant",
      content: [reasoning]
    }])
    expect(reasoningOnly).toEqual({
      role: "assistant",
      content: ""
    })

    const [toolCall] = adapter.buildReplayMessages([{
      role: "assistant",
      content: [
        reasoning,
        {
          type: "tool_call",
          id: "part_call",
          toolCallId: "call_1",
          toolName: "lookup",
          input: {}
        }
      ]
    }])
    expect(toolCall).toEqual({
      role: "assistant",
      content: "",
      reasoning_content: "private chain of thought",
      tool_calls: [{
        id: "call_1",
        type: "function",
        function: { name: "lookup", arguments: "{}" }
      }]
    })
  })

  it("never replays stored reasoning when the model forbids passback", () => {
    const adapter = new OpenAICompatibleAdapter({
      providerId: "deepseek",
      model: testConversationModel("deepseek-v4", {
        behavior: { reasoningReplay: "forbidden" }
      }),
      baseUrl: "https://api.example/v1",
      apiKey: "secret"
    })

    const [message] = adapter.buildReplayMessages([{
      role: "assistant",
      content: [
        reasoningPart("must remain local"),
        {
          type: "tool_call",
          id: "part_call",
          toolCallId: "call_1",
          toolName: "lookup",
          input: {}
        }
      ]
    }])

    expect(message).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [{
        id: "call_1",
        type: "function",
        function: { name: "lookup", arguments: "{}" }
      }]
    })
  })
})

function reasoningPart(text: string) {
  return {
    type: "reasoning" as const,
    id: "part_reasoning",
    text,
    visibility: "provider_replay_only" as const,
    providerState: {
      providerId: "deepseek",
      modelId: "deepseek-v4",
      stateKind: "reasoning" as const,
      replayPolicy: "required" as const,
      payload: { reasoning_content: text }
    }
  }
}

function createAdapter(): OpenAICompatibleAdapter {
  return new OpenAICompatibleAdapter({
    providerId: "deepseek",
    model: testConversationModel("deepseek-v4", {
      behavior: { reasoningReplay: "required" }
    }),
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
