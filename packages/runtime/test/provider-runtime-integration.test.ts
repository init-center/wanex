import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { JsonValue } from "@wanex/protocol"
import {
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"
import { WanexAgentRuntime } from "../src/host/index.js"
import type {
  ProviderAdapter,
  ProviderEvent,
  ProviderRequest,
  ProviderReplayMessage
} from "../src/provider/index.js"

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

describe("provider runtime integration", () => {
  it("submits and executes one bounded durable turn", async () => {
    const storage = await createStore()
    const runtime = new WanexAgentRuntime({
      storage,
      provider: new TextProvider("provider success")
    })

    const result = await runtime.submitAndRunUserTurn({
      sessionId: "ses_provider_success",
      inputId: "inp_provider_success",
      turnId: "turn_provider_success",
      jobId: "job_provider_success",
      principalId: "principal_provider_success",
      content: [{ type: "text", text: "hello" }]
    })

    expect(result.run.worker.status).toBe("completed")
    expect(result.receipt.job.kind).toBe("session.turn")
    expect(result.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant"
    ])
    expect(JSON.stringify(result.messages)).toContain("provider success")
  })

  it("settles provider request failure without leaving an active turn", async () => {
    const storage = await createStore()
    const runtime = new WanexAgentRuntime({
      storage,
      provider: new RequestErrorProvider()
    })

    const result = await runtime.submitAndRunUserTurn({
      sessionId: "ses_provider_failure",
      inputId: "inp_provider_failure",
      turnId: "turn_provider_failure",
      jobId: "job_provider_failure",
      principalId: "principal_provider_failure",
      content: [{ type: "text", text: "fail" }]
    })

    expect(result.run.worker.status).toBe("failed")
    expect(result.run.job?.state).toBe("failed")
    const [turn] = await runtime.session.listTurns({
      sessionId: result.session.id
    })
    expect(turn?.state).toBe("failed")
  })

  it("emits provider events with turn and attempt identity", async () => {
    const storage = await createStore()
    const observe = vi.fn()
    const runtime = new WanexAgentRuntime({
      storage,
      provider: new TextProvider("observed"),
      observeProviderEvent: observe
    })

    const result = await runtime.submitAndRunUserTurn({
      sessionId: "ses_provider_observer",
      inputId: "inp_provider_observer",
      turnId: "turn_provider_observer",
      jobId: "job_provider_observer",
      principalId: "principal_provider_observer",
      content: [{ type: "text", text: "observe" }]
    })

    expect(result.run.worker.status).toBe("completed")
    expect(observe).toHaveBeenCalled()
    expect(observe.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "ses_provider_observer",
      inputId: "inp_provider_observer",
      turnId: "turn_provider_observer",
      jobId: "job_provider_observer",
      providerId: "text-provider"
    })
    expect(observe.mock.calls[0]?.[0].attemptId).toMatch(/^attempt_/)
  })
})

async function createStore() {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-provider-runtime-"))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  return storage
}

class TextProvider implements ProviderAdapter {
  readonly kind = "fake" as const
  readonly capabilities = { input: ["text"], output: ["text"] } as const
  readonly providerId = "text-provider"
  readonly modelId = "text-model"

  constructor(private readonly text: string) {}

  async *stream(): AsyncIterable<ProviderEvent> {
    yield { type: "text_delta", partId: "part_text", delta: this.text }
    yield { type: "finish", reason: "stop" }
  }

  buildReplayMessages(messages: readonly ProviderReplayMessage[]): JsonValue[] {
    return messages as unknown as JsonValue[]
  }
}

class RequestErrorProvider implements ProviderAdapter {
  readonly kind = "fake" as const
  readonly capabilities = { input: ["text"], output: ["text"] } as const
  readonly providerId = "request-error"
  readonly modelId = "request-error-model"

  async *stream(_request: ProviderRequest): AsyncIterable<ProviderEvent> {
    yield {
      type: "error",
      error: {
        category: "authentication",
        message: "invalid credential",
        retryable: false,
        providerId: this.providerId,
        modelId: this.modelId,
        phase: "request"
      }
    }
  }

  buildReplayMessages(messages: readonly ProviderReplayMessage[]): JsonValue[] {
    return messages as unknown as JsonValue[]
  }
}
