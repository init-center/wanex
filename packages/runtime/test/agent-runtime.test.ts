import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, describe, expect, it } from "vitest"
import { DeterministicContextCompiler } from "../src/context/memory/index.js"
import {
  FakeProviderAdapter,
  type ProviderRequest,
  type ProviderReplayMessage
} from "@wanex/runtime/provider"
import type { TextMessagePart } from "@wanex/protocol"
import { writeProviderProfile } from "@wanex/runtime/provider"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { WanexAgentRuntime } from "../src/execution/agent-runtime/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 50
      })
    }
  }
})

describe("@wanex/runtime/host agent runtime", () => {
  it("submits and runs a provider-profile agent turn", async () => {
    const storage = await createTestStore()
    await writeProviderProfile(storage, {
      id: "fake-default",
      kind: "fake",
      capabilities: { input: ["text"], output: ["text"] },
      providerId: "fake",
      modelId: "fake-model"
    })
    const runtime = new WanexAgentRuntime({
      storage,
      workerId: "agent_runtime_profile",
      providerProfileId: "fake-default"
    })

    try {
      const result = await runtime.submitAndRunUserTurn({
        content: [{ type: "text", text: "hello profile" }],
        sessionId: "ses_agent_runtime_profile",
        inputId: "inp_agent_runtime_profile"
      })

      expect(result.receipt.turn.executionBinding.provider).toMatchObject({
        profileId: "fake-default",
        providerId: "fake",
        modelId: "fake-model"
      })
      expect(result.run.worker.status).toBe("completed")
      expect(result.messages[1]?.content).toEqual([
        {
          type: "text",
          id: "text_0",
          text: "Fake response from fake-model"
        }
      ])
    } finally {
      await runtime.stop()
    }
  })

  it("supports an explicit fake provider for local harnesses", async () => {
    const runtime = new WanexAgentRuntime({
      storage: await createTestStore(),
      workerId: "agent_runtime_fake",
      fakeResponseText: "fake runtime response"
    })

    try {
      const result = await runtime.submitAndRunUserTurn({
        content: [{ type: "text", text: "hello fake" }],
        sessionId: "ses_agent_runtime_fake"
      })

      expect(result.run.worker.status).toBe("completed")
      expect(result.messages[1]?.content).toEqual([
        {
          type: "text",
          id: "text_0",
          text: "fake runtime response"
        }
      ])
    } finally {
      await runtime.stop()
    }
  })

  it("runs ephemeral side queries through the app-facing runtime without durable writes", async () => {
    const runtime = new WanexAgentRuntime({
      storage: await createTestStore(),
      workerId: "agent_runtime_ephemeral",
      fakeResponseText: "ephemeral runtime response"
    })
    try {
      await runtime.submitAndRunUserTurn({
        content: [{ type: "text", text: "durable runtime context" }],
        sessionId: "ses_agent_runtime_ephemeral"
      })
      const jobsBefore = await runtime.session.listJobs({
        kind: "session.turn",
        limit: 20
      })

      const result = await runtime.runEphemeralQuery({
        sessionId: "ses_agent_runtime_ephemeral",
        question: [{ type: "text", id: "part_side", text: "side runtime question" }],
        maxOutputTokens: 32
      })

      expect(textFromParts(result.output)).toBe("ephemeral runtime response")
      expect(result.telemetry).toMatchObject({
        providerId: "fake",
        modelId: "fake-model",
        replayMessageCount: 2,
        outputPartCount: 1
      })
      await expect(
        runtime.session.listInputs({ sessionId: "ses_agent_runtime_ephemeral" })
      ).resolves.toHaveLength(1)
      await expect(
        runtime.session.listMessages({ sessionId: "ses_agent_runtime_ephemeral" })
      ).resolves.toHaveLength(2)
      const jobsAfter = await runtime.session.listJobs({
        kind: "session.turn",
        limit: 20
      })
      expect(jobsAfter.map((job) => job.id)).toEqual(
        jobsBefore.map((job) => job.id)
      )
    } finally {
      await runtime.stop()
    }
  })

  it("runs submitted jobs from a worker loop", async () => {
    const runtime = new WanexAgentRuntime({
      storage: await createTestStore(),
      workerId: "agent_runtime_loop",
      fakeResponseText: "loop response"
    })
    const submitted = await runtime.submitUserTurn({
      content: [{ type: "text", text: "loop" }],
      sessionId: "ses_agent_runtime_loop"
    })

    try {
      const loop = runtime.start({ idleIntervalMs: 10 })

      await eventually(async () => {
        const messages = await runtime.session.listMessages({
          sessionId: "ses_agent_runtime_loop"
        })
        const assistant = messages.find(
          (message) =>
            message.turnId === submitted.turnId && message.role === "assistant"
        )
        expect(assistant?.content).toEqual([
          {
            type: "text",
            id: "text_0",
            text: "loop response"
          }
        ])
      })
      loop.stop()
      expect(loop.stopped).toBe(true)
    } finally {
      await runtime.stop()
    }
  })

  it("rejects admission when a provider profile is missing", async () => {
    const runtime = new WanexAgentRuntime({
      storage: await createTestStore(),
      workerId: "agent_runtime_missing_profile"
    })

    try {
      await expect(runtime.submitUserTurn({
        content: [{ type: "text", text: "missing" }],
        sessionId: "ses_agent_runtime_missing",
        providerProfileId: "missing-profile"
      })).rejects.toThrow("provider profile not found: missing-profile")
      await expect(runtime.session.listTurns({
        sessionId: "ses_agent_runtime_missing"
      })).resolves.toEqual([])
      await expect(runtime.session.listJobs({
        kind: "session.turn",
        limit: 20
      })).resolves.toEqual([])
    } finally {
      await runtime.stop()
    }
  })

  it("uses the injected context compiler in the runtime worker path", async () => {
    const provider = new RecordingProvider()
    const runtime = new WanexAgentRuntime({
      storage: await createTestStore(),
      workerId: "agent_runtime_context",
      provider,
      contextCompiler: new DeterministicContextCompiler({
        policy: {
          recentUserTurns: 1,
          snipTextOverChars: 20,
          placeholderTextOverChars: 60
        }
      })
    })
    try {
      await runtime.submitAndRunUserTurn({
        content: [{ type: "text", text: "old runtime request" }],
        sessionId: "ses_agent_runtime_context",
        inputId: "inp_agent_runtime_context_old"
      })
      provider.lastMessages = []
      await runtime.submitAndRunUserTurn({
        content: [{ type: "text", text: "new runtime request" }],
        sessionId: "ses_agent_runtime_context",
        inputId: "inp_agent_runtime_context_new"
      })

      const replayText = provider.lastMessages
        .flatMap((message) => message.content)
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
      expect(replayText).toContain("[compacted")
      expect(replayText).toContain("new runtime request")
    } finally {
      await runtime.stop()
    }
  })

  it("stops without closing borrowed storage", async () => {
    const storage = await createTestStore()
    let closed = false
    const runtime = new WanexAgentRuntime({
      storage: Object.assign(storage, {
        close: async () => {
          closed = true
        }
      }),
      workerId: "agent_runtime_close",
      fakeResponseText: "close"
    })
    const loop = runtime.start({ idleIntervalMs: 10 })

    await delay(20)
    await runtime.stop()

    expect(loop.stopped).toBe(true)
    expect(closed).toBe(false)
    await storage.dispose()
  })
})

async function createTestStore(): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-agent-runtime-"))
  tempDirs.push(storeDir)
  return createStorageTestStore({ kind: "local-system-service", mode: "oneshot",
    storeDir,
    serviceBin
  })
}

async function eventually(assertion: () => Promise<void>): Promise<void> {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < 1_000) {
    try {
      await assertion()
      return
    } catch (error) {
      lastError = error
      await delay(20)
    }
  }
  throw lastError
}

class RecordingProvider extends FakeProviderAdapter {
  lastMessages: readonly ProviderReplayMessage[] = []

  constructor() {
    super({ responseText: "old runtime assistant ".repeat(80) })
  }

  override async *stream(request: ProviderRequest) {
    this.lastMessages = request.messages
    yield* super.stream(request)
  }
}

function textFromParts(parts: readonly unknown[]): string {
  return parts
    .filter((part): part is TextMessagePart => {
      return (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "text"
      )
    })
    .map((part) => part.text)
    .join("\n")
}
