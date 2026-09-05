import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, describe, expect, it } from "vitest"
import type {
  CompileContextInput,
  CompiledContext,
  ContextCompiler
} from "../src/context/memory/index.js"
import {
  FakeProviderAdapter,
  type ProviderRequest,
  type ProviderReplayMessage
} from "@wanex/runtime/provider"
import type { ModelEndpoint, TextMessagePart } from "@wanex/protocol"
import { writeModelEndpoint } from "@wanex/runtime/provider"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { WanexAgentRuntime } from "../src/execution/agent-runtime/index.js"
import type { SessionTurnAgentContextIdentity } from "../src/execution/worker/types.js"
import type { WorkerRunOnceResult } from "../src/jobs/index.js"
import { fakeModelEndpoint } from "./model-endpoint-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const stores: StorageTestStore[] = []

afterEach(async () => {
  while (stores.length > 0) {
    await stores.pop()?.dispose()
  }
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
  it("submits and runs a model-endpoint agent turn", async () => {
    const storage = await createTestStore()
    await writeModelEndpoint(storage, fakeModelEndpoint("default"))
    const runtime = new WanexAgentRuntime({
      storage,
      workerId: "agent_runtime_profile",
      modelEndpointId: "endpoint_default"
    })

    try {
      const result = await runtime.submitAndRunUserTurn({
        content: [{ type: "text", text: "hello profile" }],
        sessionId: "ses_agent_runtime_profile",
        inputId: "inp_agent_runtime_profile"
      })

      expect(result.receipt.turn.executionBinding.modelEndpoint).toMatchObject({
        endpointId: "endpoint_default",
        protocol: { id: "fake" },
        connection: { providerId: "fake" },
        model: { id: "model_default" }
      })
      expect(result.run.worker.status).toBe("completed")
      expect(result.messages[1]?.content).toEqual([
        {
          type: "text",
          id: "text_0",
          text: "Fake response from model_default"
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

  it("derives stable operation identities for an idempotent submission retry", async () => {
    const storage = await createTestStore()
    const runtime = new WanexAgentRuntime({
      storage,
      workerId: "agent_runtime_idempotent_identity",
      fakeResponseText: "unused"
    })
    const request = {
      content: [{ type: "text" as const, text: "submit exactly once" }],
      sessionId: "ses_agent_runtime_idempotent_identity",
      idempotencyKey: "agent-runtime-idempotent-identity"
    }

    try {
      const first = await runtime.submitUserTurn(request)
      const duplicate = await runtime.submitUserTurn(request)

      expect(duplicate.receipt).toEqual(first.receipt)
      expect(first.inputId).toMatch(/^inp_runtime_[a-f0-9]{32}$/u)
      expect(first.turnId).toMatch(/^turn_runtime_[a-f0-9]{32}$/u)
      await expect(runtime.session.listInputs({
        sessionId: request.sessionId
      })).resolves.toHaveLength(1)
      await expect(storage.listSessionTurns({
        sessionId: request.sessionId
      })).resolves.toHaveLength(1)
    } finally {
      await runtime.stop()
    }
  })

  it("derives one bounded navigation line without truncating input", async () => {
    const storage = await createTestStore()
    const runtime = new WanexAgentRuntime({
      storage,
      workerId: "agent_runtime_derived_title",
      fakeResponseText: "unused"
    })
    const firstLine = `# ${"long title value ".repeat(30)}`
    const text = `  ${firstLine}\nfull input tail  `

    try {
      const submitted = await runtime.submitUserTurn({
        content: [{ type: "text", text }],
        sessionId: "ses_agent_runtime_derived_title"
      })
      const expectedTitle = Array.from(firstLine.replace(/^# /, "").trim())
        .slice(0, 200)
        .join("")

      expect(submitted.session.title).toBe(expectedTitle)
      expect(Array.from(submitted.session.title ?? "")).toHaveLength(200)
      await expect(runtime.session.listInputs({
        sessionId: submitted.session.id
      })).resolves.toEqual([
        expect.objectContaining({
          content: [expect.objectContaining({ type: "text", text })]
        })
      ])
    } finally {
      await runtime.stop()
    }
  })

  it("preserves an explicit session title exactly", async () => {
    const runtime = new WanexAgentRuntime({
      storage: await createTestStore(),
      workerId: "agent_runtime_explicit_title",
      fakeResponseText: "unused"
    })
    const title = "# Exact user title"

    try {
      const submitted = await runtime.submitUserTurn({
        content: [{ type: "text", text: "# Automatically derived title" }],
        sessionId: "ses_agent_runtime_explicit_title",
        title
      })

      expect(submitted.session.title).toBe(title)
    } finally {
      await runtime.stop()
    }
  })

  it("persists requested Session scope and rejects cross-scope reuse", async () => {
    const runtime = new WanexAgentRuntime({
      storage: await createTestStore(),
      workerId: "agent_runtime_session_scope",
      fakeResponseText: "unused"
    })
    const sessionId = "ses_agent_runtime_session_scope"
    const sessionScope = {
      kind: "coding.repository",
      id: "repository_runtime_scope"
    } as const

    try {
      const submitted = await runtime.submitUserTurn({
        content: [{ type: "text", text: "scoped input" }],
        sessionId,
        sessionScope
      })
      expect(submitted.session.scope).toEqual(sessionScope)
      await expect(runtime.submitUserTurn({
        content: [{ type: "text", text: "missing scope input" }],
        sessionId
      })).rejects.toThrow("requires an exact requested session scope")
      await expect(runtime.submitUserTurn({
        content: [{ type: "text", text: "foreign input" }],
        sessionId,
        sessionScope: {
          kind: sessionScope.kind,
          id: "repository_runtime_foreign"
        }
      })).rejects.toThrow("does not match the requested session scope")
      await expect(runtime.session.listInputs({ sessionId })).resolves.toHaveLength(1)
    } finally {
      await runtime.stop()
    }
  })

  it("derives deterministic navigation identity across message forms", async () => {
    const runtime = new WanexAgentRuntime({
      storage: await createTestStore(),
      workerId: "agent_runtime_title_forms",
      fakeResponseText: "unused"
    })
    const cases = [
      ["plain", "  First line  \nsecond line", "First line"],
      ["heading", "# Product conversation\nbody", "Product conversation"],
      ["quote", "> > Quoted request\nbody", "Quoted request"],
      ["unordered", "- List request\nbody", "List request"],
      ["ordered", "12. Ordered request\nbody", "Ordered request"],
      ["task", "- [x] Checked request\nbody", "Checked request"],
      ["tilde-fence", "~~~ts\nconst value = 1\n~~~", "const value = 1"],
      ["code-syntax", "```text\n# code comment\n```", "# code comment"],
      ["empty-heading", "#   \nUseful next line", "Useful next line"],
      ["literal-hash", "#not-a-heading\nbody", "#not-a-heading"],
      [
        "desktop-proof",
        "# Wanex desktop product proof\n\n```text\nstructured timeline\n```",
        "Wanex desktop product proof"
      ],
      ["no-useful-text", " \n```text\n\n```", "Resource conversation"]
    ] as const

    try {
      for (const [id, text, expectedTitle] of cases) {
        const submitted = await runtime.submitUserTurn({
          content: [{ type: "text", text }],
          sessionId: `ses_agent_runtime_title_${id}`
        })
        expect(submitted.session.title, id).toBe(expectedTitle)
      }

      const unicode = await runtime.submitUserTurn({
        content: [{ type: "text", text: `  ${"标题🙂 ".repeat(80)}\nignored` }],
        sessionId: "ses_agent_runtime_title_unicode"
      })
      expect(Array.from(unicode.session.title ?? "").length).toBeLessThanOrEqual(200)
      expect(Array.from(unicode.session.title ?? "").length).toBeGreaterThan(0)
      expect(unicode.session.title?.endsWith("\ud83d")).toBe(false)
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
      expect(result.evidence).toMatchObject({
        source: {
          sessionId: "ses_agent_runtime_ephemeral",
          headSequence: 2
        },
        provider: {
          endpointId: "direct:fake:fake-model",
          protocolId: "fake",
          providerId: "fake",
          modelId: "fake-model"
        }
      })
      expect(result.evidence.inputDigest).toMatch(/^[0-9a-f]{64}$/)
      expect(result.evidence.outputDigest).toMatch(/^[0-9a-f]{64}$/)
      expect(result.evidence.provider.endpointDigest).toMatch(/^[0-9a-f]{64}$/)
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
      let resolveWorkerResult:
        | ((result: WorkerRunOnceResult) => void)
        | undefined
      let rejectWorkerResult: ((reason?: unknown) => void) | undefined
      const workerResult = new Promise<WorkerRunOnceResult>((resolve, reject) => {
        resolveWorkerResult = resolve
        rejectWorkerResult = reject
      })
      const loop = runtime.start({
        idleIntervalMs: 10,
        onResult: (result) => {
          if (result.status === "idle") {
            return
          }
          if (result.job?.id !== submitted.receipt.job.id) {
            rejectWorkerResult?.(
              new Error(
                `worker loop settled unexpected job: ${result.job?.id ?? "none"}`
              )
            )
            return
          }
          resolveWorkerResult?.(result)
        },
        onError: (error) => rejectWorkerResult?.(error)
      })
      const settled = await workerResult
      expect(settled).toMatchObject({
        status: "completed",
        job: { id: submitted.receipt.job.id }
      })

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
      loop.stop()
      expect(loop.stopped).toBe(true)
    } finally {
      await runtime.stop()
    }
  })

  it("rejects admission when a model endpoint is missing", async () => {
    const runtime = new WanexAgentRuntime({
      storage: await createTestStore(),
      workerId: "agent_runtime_missing_profile"
    })

    try {
      await expect(runtime.submitUserTurn({
        content: [{ type: "text", text: "missing" }],
        sessionId: "ses_agent_runtime_missing",
        modelEndpointId: "missing-profile"
      })).rejects.toThrow("model endpoint not found: missing-profile")
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

  it("rejects a media-only endpoint before durable turn admission", async () => {
    const storage = await createTestStore()
    await writeModelEndpoint(storage, mediaOnlyModelEndpoint("media-only"))
    const runtime = new WanexAgentRuntime({
      storage,
      workerId: "agent_runtime_media_only"
    })

    try {
      await expect(runtime.submitUserTurn({
        content: [{ type: "text", text: "must not persist" }],
        sessionId: "ses_agent_runtime_media_only",
        modelEndpointId: "endpoint_media-only"
      })).rejects.toThrow("openai-images model must support conversation")
      await expect(runtime.session.listTurns({
        sessionId: "ses_agent_runtime_media_only"
      })).resolves.toEqual([])
      await expect(runtime.session.listJobs({
        kind: "session.turn",
        limit: 20
      })).resolves.toEqual([])
    } finally {
      await runtime.stop()
    }
  })

  it("settles an admission context exactly once after durable submission", async () => {
    let commits = 0
    let rollbacks = 0
    const runtime = new WanexAgentRuntime({
      storage: await createTestStore(),
      workerId: "agent_runtime_admission_settlement",
      fakeResponseText: "unused",
      resolveAgentContext: () => ({
        context: {},
        lease: {
          phase: "admission",
          commit() {
            commits += 1
          },
          rollback() {
            rollbacks += 1
          },
        },
      }),
    })

    try {
      const prepared = await runtime.prepareUserTurn({
        content: [{ type: "text", text: "settle once" }],
        sessionId: "ses_agent_runtime_admission_settlement",
      })
      prepared.context.commit()
      prepared.context.commit()
      prepared.context.rollback()
      expect(commits).toBe(1)
      expect(rollbacks).toBe(0)
    } finally {
      await runtime.stop()
    }
  })

  it("rolls an admission context back when binding creation fails", async () => {
    let commits = 0
    let rollbacks = 0
    const runtime = new WanexAgentRuntime({
      storage: await createTestStore(),
      workerId: "agent_runtime_admission_rollback",
      fakeResponseText: "unused",
      resolveAgentContext: () => ({
        context: {},
        lease: {
          phase: "admission",
          commit() {
            commits += 1
          },
          rollback() {
            rollbacks += 1
          },
        },
      }),
    })

    try {
      await expect(runtime.prepareUserTurn({
        content: [{ type: "text", text: "invalid completion" }],
        sessionId: "ses_agent_runtime_admission_rollback",
        maxOutputTokens: 0,
      })).rejects.toThrow("maxOutputTokens must be a positive integer")
      expect(commits).toBe(0)
      expect(rollbacks).toBe(1)
    } finally {
      await runtime.stop()
    }
  })

  it("reconciles an ambiguous durable submission as a commit", async () => {
    let commits = 0
    let rollbacks = 0
    let committedDigest: string | undefined
    const runtime = new WanexAgentRuntime({
      storage: await createTestStore(),
      workerId: "agent_runtime_admission_reconcile",
      fakeResponseText: "unused",
      resolveAgentContext: () => ({
        context: {},
        lease: {
          phase: "admission",
          commit(binding) {
            commits += 1
            committedDigest = binding.digest
          },
          rollback() {
            rollbacks += 1
          },
        },
      }),
    })

    const submitTurn = runtime.session.submitTurn.bind(runtime.session)
    runtime.session.submitTurn = async (request) => {
      await submitTurn(request)
      throw new Error("submission result was lost")
    }
    try {
      await expect(runtime.submitUserTurn({
        content: [{ type: "text", text: "reconcile me" }],
        sessionId: "ses_agent_runtime_admission_reconcile",
      })).rejects.toThrow("submission result was lost")
      const turns = await runtime.session.listTurns({
        sessionId: "ses_agent_runtime_admission_reconcile",
      })
      expect(turns).toHaveLength(1)
      expect(committedDigest).toBe(turns[0]?.executionBinding.digest)
      expect(commits).toBe(1)
      expect(rollbacks).toBe(0)
    } finally {
      await runtime.stop()
    }
  })

  it("uses an inheritance settlement without acquiring a new admission lease", async () => {
    const inheritedContextIdentity = Symbol(
      "inherited"
    ) as SessionTurnAgentContextIdentity
    let observedPhase: string | undefined
    let commits = 0
    const runtime = new WanexAgentRuntime({
      storage: await createTestStore(),
      workerId: "agent_runtime_inheritance_settlement",
      fakeResponseText: "unused",
      resolveAgentContext: (request) => {
        observedPhase = request.phase
        return {
          context: {},
          contextIdentity: inheritedContextIdentity,
          ...(request.phase === "inheritance"
            ? {
                lease: {
                  phase: "inheritance" as const,
                  commit() {
                    commits += 1
                  },
                  rollback() {},
                },
              }
            : {}),
        }
      },
    })

    try {
      const prepared = await runtime.prepareExecutionBinding({
        sessionId: "ses_agent_runtime_inheritance",
        inputId: "inp_agent_runtime_inheritance",
        turnId: "turn_agent_runtime_inheritance",
        content: [{
          type: "text",
          id: "part_agent_runtime_inheritance",
          text: "inherit context"
        }],
        inheritedContextBinding: {
          digest: "parent-binding",
        } as never,
        inheritedContextIdentity,
      })
      expect(observedPhase).toBe("inheritance")
      prepared.context.commit()
      expect(commits).toBe(1)
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
      contextCompiler: new MarkerContextCompiler()
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
      expect(replayText).toContain("injected-context-marker")
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
  })
})

function mediaOnlyModelEndpoint(suffix: string): ModelEndpoint {
  return {
    id: `endpoint_${suffix}`,
    connection: {
      id: `connection_${suffix}`,
      providerId: "openai"
    },
    protocol: { id: "openai-images" },
    model: {
      id: `model_${suffix}`,
      operations: ["image.generate"],
      inputModalities: ["text"],
      outputModalities: ["image"],
      features: [],
      catalog: {
        source: "custom",
        catalogId: `test.${suffix}`,
        revision: "1"
      }
    }
  }
}

async function createTestStore(): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-agent-runtime-"))
  tempDirs.push(storeDir)
  const store = createStorageTestStore({ kind: "local-system-service", mode: "persistent",
    storeDir,
    serviceBin
  })
  stores.push(store)
  return store
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

class MarkerContextCompiler implements ContextCompiler {
  async compile(input: CompileContextInput): Promise<CompiledContext> {
    const messages = [
      {
        role: "system" as const,
        content: [{
          type: "text" as const,
          id: "injected_context_marker",
          text: "injected-context-marker"
        }]
      },
      ...input.messages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    ]
    return {
      sessionId: input.sessionId,
      messages,
      stats: {
        tokenEstimateBefore: 0,
        tokenEstimateAfter: 0
      }
    }
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
