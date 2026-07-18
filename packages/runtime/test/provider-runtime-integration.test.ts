import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore } from "@wanex/storage/testing"
import { WanexAgentRunner } from "../src/execution/core/index.js"
import { WanexSessionCore } from "../src/sessions/index.js"
import type {
  ProviderAdapter,
  ProviderEvent,
  ProviderRunEvent
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

describe("Runtime provider stream integration", () => {
  it("observes run-scoped deltas and commits only after finish", async () => {
    const { session, sessionId } = await createClaimableSession("success")
    const observed: ProviderRunEvent[] = []
    const runner = new WanexAgentRunner({
      session,
      provider: scripted([
        { type: "text_delta", partId: "answer", delta: "streamed" },
        { type: "finish", reason: "stop" }
      ]),
      runnerId: "runner_success",
      leaseMs: 60_000,
      observeProviderEvent: (event) => observed.push(event)
    })

    const result = await runner.runOnce({ sessionId })
    expect(result.status).toBe("completed")
    expect(observed.map((item) => item.event.type)).toEqual([
      "text_delta",
      "finish"
    ])
    expect(observed[0]).toMatchObject({
      sessionId,
      inputId: "input_success",
      providerId: "scripted",
      modelId: "fixture"
    })
    await expect(session.listMessages({ sessionId })).resolves.toMatchObject([
      { role: "assistant", status: "completed", content: [{ text: "streamed" }] }
    ])
  })

  it("does not persist partial output when the provider fails", async () => {
    const { session, sessionId } = await createClaimableSession("failure")
    const runner = new WanexAgentRunner({
      session,
      provider: scripted([
        { type: "text_delta", partId: "answer", delta: "not durable" },
        {
          type: "error",
          error: {
            category: "server",
            message: "upstream disconnected",
            retryable: true,
            providerId: "scripted",
            modelId: "fixture",
            phase: "stream"
          }
        }
      ]),
      runnerId: "runner_failure",
      leaseMs: 60_000
    })

    await expect(runner.runOnce({ sessionId })).rejects.toMatchObject({
      detail: { outputObserved: true, category: "server" }
    })
    await expect(session.listMessages({ sessionId })).resolves.toEqual([])
    await expect(session.listInputs({ sessionId })).resolves.toMatchObject([
      { id: "input_failure", status: "failed" }
    ])
  })

  it("does not let an observer exception fail the durable run", async () => {
    const { session, sessionId } = await createClaimableSession("observer")
    const runner = new WanexAgentRunner({
      session,
      provider: scripted([
        { type: "text_delta", partId: "answer", delta: "committed" },
        { type: "finish", reason: "stop" }
      ]),
      runnerId: "runner_observer",
      leaseMs: 60_000,
      observeProviderEvent() {
        throw new Error("UI detached")
      }
    })

    await expect(runner.runOnce({ sessionId })).resolves.toMatchObject({
      status: "completed"
    })
    await expect(session.listMessages({ sessionId })).resolves.toHaveLength(1)
  })
})

async function createClaimableSession(suffix: string) {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-provider-runtime-"))
  tempDirs.push(storeDir)
  const session = new WanexSessionCore({
    storage: createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
  })
  const sessionId = `session_${suffix}`
  await session.create({ id: sessionId })
  await session.admit({
    id: `input_${suffix}`,
    sessionId,
    principalId: "user",
    idempotencyKey: `idem_${suffix}`,
    content: [{ type: "text", id: "question", text: "hello" }]
  })
  return { session, sessionId }
}

function scripted(events: readonly ProviderEvent[]): ProviderAdapter {
  return {
    providerId: "scripted",
    modelId: "fixture",
    async *stream() {
      yield* events
    },
    buildReplayMessages() {
      return []
    }
  }
}
