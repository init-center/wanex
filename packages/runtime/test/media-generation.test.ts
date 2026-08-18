import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type {
  JsonValue,
  MediaGenerationModelEndpoint,
  ModelEndpoint,
  ResourceRecord
} from "@wanex/protocol"
import {
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"
import {
  WanexMediaGenerationRuntime,
  type MediaGenerationAdapter,
  type MediaGenerationAdapterRequest,
  type MediaGenerationPollResult,
  type MediaGenerationSubmitResult
} from "../src/media-generation/index.js"
import { WanexRuntimeHost } from "../src/host/index.js"
import { modelEndpointExecutionBinding } from "../src/provider/index.js"

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
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/runtime/media-generation", () => {
  it("persists provider acceptance, polls, materializes bytes, and is idempotent", async () => {
    const storage = await createStore("media-accepted")
    const adapter = new AsyncImageAdapter()
    const runtime = new WanexMediaGenerationRuntime({
      storage,
      adapters: [adapter],
      workerId: "media_worker_accepted",
      pollInitialDelayMs: 50,
      pollMaxDelayMs: 50
    })

    const request = {
      operation: "image.generate" as const,
      modelEndpoint: modelEndpointExecutionBinding(adapter.modelEndpoint),
      principalId: "principal_media",
      idempotencyKey: "media-idempotency-key",
      prompt: "a precise square icon",
      outputModality: "image" as const,
      options: { size: "small" }
    }
    const first = await runtime.submit(request)
    const second = await runtime.submit(request)

    expect(second.operation.id).toBe(first.operation.id)
    expect(second.job.id).toBe(first.job.id)
    expect(first.operation.binding.request).toEqual({
      operation: "image.generate",
      prompt: "a precise square icon",
      outputModality: "image",
      inputResources: [],
      options: { size: "small" }
    })

    const firstRun = await runtime.runOnce()
    expect(firstRun.status).toBe("suspended")
    expect(adapter.submitCount).toBe(1)
    expect(adapter.pollExternalOperationIds).toEqual([])

    let result = firstRun
    await eventually(async () => {
      result = await runtime.runOnce()
      expect(result.operation?.state).toBe("succeeded")
    })
    expect(result.status).toBe("completed")
    expect(adapter.pollExternalOperationIds).toEqual([
      "provider-op-1",
      "provider-op-1"
    ])

    const operation = await runtime.get(first.operation.id)
    expect(operation).toMatchObject({
      id: first.operation.id,
      state: "succeeded",
      externalOperationId: "provider-op-1",
      providerCheckpoint: { cursor: 1 },
      pollCount: 2,
      consecutivePollFailures: 0,
      outputResourceIds: [expect.any(String)]
    })
    const resource = await storage.getResource({
      resourceId: operation!.outputResourceIds[0]!
    })
    expect(resource).toMatchObject({
      state: "available",
      kind: "image",
      mediaType: "image/png",
      origin: "model_output"
    })
    await expect(
      readResourceBytes(storage, resource!)
    ).resolves.toEqual(Buffer.from("generated-image"))
  })

  it("releases the accepted lease and resumes after restart without resubmitting", async () => {
    const storage = await createStore("media-restart")
    const firstAdapter = new AsyncImageAdapter()
    const firstRuntime = new WanexMediaGenerationRuntime({
      storage,
      adapters: [firstAdapter],
      workerId: "media_worker_before_restart",
      heartbeatIntervalMs: 5,
      pollInitialDelayMs: 50,
      pollMaxDelayMs: 50
    })
    const submitted = await firstRuntime.submit({
      operation: "image.generate",
      modelEndpoint: modelEndpointExecutionBinding(firstAdapter.modelEndpoint),
      prompt: "restart-safe generated image",
      outputModality: "image",
      idempotencyKey: "media-restart-key"
    })

    expect((await firstRuntime.runOnce()).status).toBe("suspended")
    const suspended = await firstRuntime.get(submitted.operation.id)
    const suspendedJob = await storage.getJob({ jobId: submitted.job.id })
    expect(suspended).toMatchObject({
      state: "polling",
      externalOperationId: "provider-op-1",
      pollCount: 0,
      consecutivePollFailures: 0,
      nextPollAt: expect.any(Number)
    })
    expect(suspendedJob).toMatchObject({
      state: "pending",
      notBefore: suspended?.nextPollAt
    })
    expect(suspendedJob?.leaseOwner).toBeUndefined()
    expect(suspendedJob?.leaseToken).toBeUndefined()
    expect(suspendedJob?.leaseExpiresAt).toBeUndefined()
    const suspendedUpdatedAt = suspendedJob?.updatedAt
    await sleep(20)
    expect(await storage.getJob({ jobId: submitted.job.id })).toMatchObject({
      state: "pending",
      updatedAt: suspendedUpdatedAt
    })

    const restartedAdapter = new AsyncImageAdapter()
    const restartedRuntime = new WanexMediaGenerationRuntime({
      storage,
      adapters: [restartedAdapter],
      workerId: "media_worker_after_restart",
      pollInitialDelayMs: 50,
      pollMaxDelayMs: 50
    })
    const resumed = await runWhenDue(restartedRuntime)

    expect(resumed.status).toBe("suspended")
    expect(firstAdapter.submitCount).toBe(1)
    expect(restartedAdapter.submitCount).toBe(0)
    expect(restartedAdapter.pollExternalOperationIds).toEqual(["provider-op-1"])
    await expect(restartedRuntime.get(submitted.operation.id)).resolves.toMatchObject({
      state: "polling",
      pollCount: 1,
      providerCheckpoint: { cursor: 1 }
    })
  })

  it("persists transient poll failures across runtimes and fails at the bounded threshold", async () => {
    const storage = await createStore("media-poll-failures")
    const firstAdapter = new ThrowingPollAdapter()
    const submitted = await new WanexMediaGenerationRuntime({
      storage,
      adapters: [firstAdapter],
      workerId: "media_failure_submitter",
      pollInitialDelayMs: 20,
      pollMaxDelayMs: 20,
      maxConsecutivePollFailures: 3
    }).submit({
      operation: "image.generate",
      modelEndpoint: modelEndpointExecutionBinding(firstAdapter.modelEndpoint),
      prompt: "durable poll failures",
      outputModality: "image",
      idempotencyKey: "media-poll-failure-key"
    })

    const adapters = [firstAdapter, new ThrowingPollAdapter(), new ThrowingPollAdapter()]
    for (const [index, adapter] of adapters.entries()) {
      const runtime = new WanexMediaGenerationRuntime({
        storage,
        adapters: [adapter],
        workerId: `media_failure_worker_${index}`,
        pollInitialDelayMs: 20,
        pollMaxDelayMs: 20,
        maxConsecutivePollFailures: 3
      })
      if (index === 0) {
        expect((await runtime.runOnce()).status).toBe("suspended")
      }
      const result = await runWhenDue(runtime)
      expect(result.status).toBe(index === 2 ? "completed" : "suspended")
      await expect(runtime.get(submitted.operation.id)).resolves.toMatchObject({
        state: index === 2 ? "failed" : "polling",
        pollCount: index + 1,
        consecutivePollFailures: index + 1,
        lastPollError: {
          type: "provider_poll_error",
          consecutiveFailures: index + 1
        }
      })
    }
    expect(adapters.map((adapter) => adapter.submitCount)).toEqual([1, 0, 0])
    expect(adapters.map((adapter) => adapter.pollCount)).toEqual([1, 1, 1])
  })

  it("wakes a suspended accepted operation and invokes provider cancellation", async () => {
    const storage = await createStore("media-suspended-cancel")
    const adapter = new CancelTrackingAdapter()
    const runtime = new WanexMediaGenerationRuntime({
      storage,
      adapters: [adapter],
      workerId: "media_cancel_worker",
      pollInitialDelayMs: 60_000,
      pollMaxDelayMs: 60_000
    })
    const submitted = await runtime.submit({
      operation: "image.generate",
      modelEndpoint: modelEndpointExecutionBinding(adapter.modelEndpoint),
      prompt: "cancel accepted generation",
      outputModality: "image",
      idempotencyKey: "media-suspended-cancel-key"
    })
    await runtime.runOnce()

    await expect(
      runtime.cancel(submitted.operation.id, "user cancelled suspended operation")
    ).resolves.toMatchObject({ state: "cancel_requested" })
    const cancellationJob = await storage.getJob({ jobId: submitted.job.id })
    expect(cancellationJob).toMatchObject({
      id: submitted.job.id,
      state: "ready"
    })
    expect(cancellationJob?.notBefore).toBeUndefined()
    expect((await runtime.runOnce()).status).toBe("completed")
    expect(adapter.cancelledExternalOperationIds).toEqual(["provider-op-1"])
    const cancelled = await runtime.get(submitted.operation.id)
    expect(cancelled).toMatchObject({
      state: "cancelled",
      cancelReason: "user cancelled suspended operation"
    })
    expect(cancelled?.nextPollAt).toBeUndefined()
  })

  it("clamps provider poll hints to runtime bounds", async () => {
    const storage = await createStore("media-poll-hints")
    const lowerAdapter = new PollHintAdapter("media-hint-lower", 1)
    const upperAdapter = new PollHintAdapter("media-hint-upper", 100_000)
    for (const [adapter, expectedDelay] of [
      [lowerAdapter, 50],
      [upperAdapter, 80]
    ] as const) {
      const runtime = new WanexMediaGenerationRuntime({
        storage,
        adapters: [adapter],
        workerId: `worker_${adapter.modelEndpoint.id}`,
        pollInitialDelayMs: 50,
        pollMaxDelayMs: 80
      })
      const submitted = await runtime.submit({
        operation: "image.generate",
        modelEndpoint: modelEndpointExecutionBinding(adapter.modelEndpoint),
        prompt: `poll hint ${adapter.modelEndpoint.id}`,
        outputModality: "image",
        idempotencyKey: `key_${adapter.modelEndpoint.id}`
      })
      await runtime.runOnce()
      const operation = await runtime.get(submitted.operation.id)
      const scheduledDelay = operation!.nextPollAt! - operation!.updatedAt
      expect(scheduledDelay).toBeGreaterThan(0)
      expect(scheduledDelay).toBeLessThanOrEqual(expectedDelay)
      expect(scheduledDelay).toBeGreaterThanOrEqual(expectedDelay - 20)
    }
  })

  it("freezes available input resource evidence at admission", async () => {
    const storage = await createStore("media-input-evidence")
    const adapter = new AsyncImageAdapter({ input: ["text", "image"] })
    const source = await storage.ingestResource({
      logicalPath: "inputs/source.png",
      content: Buffer.from("source-image"),
      kind: "image",
      mediaType: "image/png",
      origin: "user_upload"
    })
    const runtime = new WanexMediaGenerationRuntime({
      storage,
      adapters: [adapter],
      workerId: "media_worker_input_evidence"
    })

    const submitted = await runtime.submit({
      operation: "image.generate",
      modelEndpoint: modelEndpointExecutionBinding(adapter.modelEndpoint),
      inputResourceIds: [source.id],
      prompt: "transform this image",
      outputModality: "image",
      idempotencyKey: "media-input-evidence-key"
    })

    expect(submitted.operation.binding.request.inputResources).toEqual([
      {
        resourceId: source.id,
        sha256: source.sha256,
        sizeBytes: source.sizeBytes,
        kind: "image",
        mediaType: "image/png"
      }
    ])
  })

  it("does not turn provider references into placeholder resources", async () => {
    const storage = await createStore("media-reference")
    const adapter = new ReferenceOutputAdapter()
    const runtime = new WanexMediaGenerationRuntime({
      storage,
      adapters: [adapter],
      workerId: "media_worker_reference"
    })
    const submitted = await runtime.submit({
      operation: "image.generate",
      modelEndpoint: modelEndpointExecutionBinding(adapter.modelEndpoint),
      prompt: "generate a hosted image",
      outputModality: "image",
      idempotencyKey: "media-reference-key"
    })

    const result = await runtime.runOnce()

    expect(result.status).toBe("completed")
    await expect(runtime.get(submitted.operation.id)).resolves.toMatchObject({
      state: "failed",
      outputReferences: [
        {
          kindOfReference: "provider_file",
          provider: "fake-image-provider",
          providerFileId: "file-1"
        }
      ],
      outputResourceIds: []
    })
    await expect(storage.listResources({})).resolves.toEqual([])
  })

  it("settles an uncertain provider submission as recovery_required without resubmitting", async () => {
    const storage = await createStore("media-ambiguous")
    const adapter = new AmbiguousSubmitAdapter()
    const runtime = new WanexMediaGenerationRuntime({
      storage,
      adapters: [adapter],
      workerId: "media_worker_ambiguous"
    })
    const submitted = await runtime.submit({
      operation: "image.generate",
      modelEndpoint: modelEndpointExecutionBinding(adapter.modelEndpoint),
      prompt: "an uncertain image",
      outputModality: "image",
      idempotencyKey: "media-ambiguous-key"
    })

    await runtime.runOnce()

    expect(adapter.submitCount).toBe(1)
    await expect(runtime.get(submitted.operation.id)).resolves.toMatchObject({
      state: "recovery_required",
      error: {
        type: "ambiguous_provider_submission"
      }
    })
  })

  it("preserves recovery semantics when cancellation aborts provider submission", async () => {
    const storage = await createStore("media-cancel-submit")
    const adapter = new BlockingSubmitAdapter()
    const runtime = new WanexMediaGenerationRuntime({
      storage,
      adapters: [adapter],
      workerId: "media_worker_cancel_submit"
    })
    const submitted = await runtime.submit({
      operation: "image.generate",
      modelEndpoint: modelEndpointExecutionBinding(adapter.modelEndpoint),
      prompt: "cancel while submitting",
      outputModality: "image",
      idempotencyKey: "media-cancel-submit-key"
    })
    const running = runtime.runOnce()
    await adapter.started

    const cancellation = await runtime.cancel(
      submitted.operation.id,
      "user cancelled generation"
    )
    expect(cancellation?.state).toBe("cancel_requested")

    await running
    await expect(runtime.get(submitted.operation.id)).resolves.toMatchObject({
      state: "recovery_required",
      error: { type: "ambiguous_provider_submission" }
    })
  })

  it("executes the frozen endpoint through the protocol adapter after configuration changes", async () => {
    const storage = await createStore("media-profile-drift")
    const original = new AsyncImageAdapter()
    const changed = new AsyncImageAdapter({ modelId: "changed-model" })
    const firstRuntime = new WanexMediaGenerationRuntime({
      storage,
      adapters: [original],
      workerId: "media_worker_profile_submit"
    })
    const submitted = await firstRuntime.submit({
      operation: "image.generate",
      modelEndpoint: modelEndpointExecutionBinding(original.modelEndpoint),
      prompt: "profile drift",
      outputModality: "image",
      idempotencyKey: "media-profile-drift-key"
    })
    const secondRuntime = new WanexMediaGenerationRuntime({
      storage,
      adapters: [changed],
      workerId: "media_worker_profile_resume"
    })

    await secondRuntime.runOnce()

    expect(original.submitCount).toBe(0)
    expect(changed.submitCount).toBe(1)
    expect(changed.submittedModelIds).toEqual(["fake-image-model"])
    await expect(secondRuntime.get(submitted.operation.id)).resolves.toMatchObject({
      state: "polling",
      externalOperationId: "provider-op-1"
    })
  })

  it("runs media generation inside the shared runtime host lifecycle", async () => {
    const storage = await createStore("media-host")
    const adapter = new AsyncImageAdapter()
    const host = new WanexRuntimeHost({
      storage,
      mediaGenerationAdapters: [adapter],
      idleIntervalMs: 10,
      mediaGenerationPollInitialDelayMs: 50,
      mediaGenerationPollMaxDelayMs: 50
    })

    expect(host.status()).toMatchObject({
      workerCount: 1,
      memoryWorkerCount: 0,
      mediaGenerationWorkerCount: 1
    })
    host.start()
    const submitted = await host.submitMediaGeneration({
      operation: "image.generate",
      modelEndpoint: modelEndpointExecutionBinding(adapter.modelEndpoint),
      prompt: "host-owned media generation",
      outputModality: "image"
    })

    await eventually(async () => {
      const operation = await host.getMediaGenerationOperation(
        submitted.operation.id
      )
      expect(operation, JSON.stringify(operation?.error ?? null)).toMatchObject({
        state: "succeeded"
      })
    })
    const health = host.getHealthSnapshot()
    expect(health.mediaGenerationWorkerCount).toBe(1)
    expect(health.loops.map((loop) => loop.kind)).toContain("media_generation")

    await host.dispose()
  })
})

abstract class EndpointFixtureMediaAdapter {
  abstract readonly modelEndpoint: MediaGenerationModelEndpoint

  get protocolId(): string {
    return this.modelEndpoint.protocol.id
  }

  canExecute(modelEndpoint: ModelEndpoint): boolean {
    return modelEndpoint.protocol.id === this.protocolId
  }
}

class AsyncImageAdapter
  extends EndpointFixtureMediaAdapter
  implements MediaGenerationAdapter {
  readonly modelEndpoint: MediaGenerationModelEndpoint
  submitCount = 0
  readonly submittedModelIds: string[] = []
  readonly pollExternalOperationIds: string[] = []
  private pollCount = 0

  constructor(options: {
    readonly input?: readonly ("text" | "image")[]
    readonly modelId?: string
  } = {}) {
    super()
    this.modelEndpoint = mediaModelEndpoint({
      endpointId: "fake-image-endpoint",
      protocolId: "fake-image-protocol",
      providerId: "fake-image-provider",
      modelId: options.modelId ?? "fake-image-model",
      input: options.input ?? ["text"]
    })
  }

  async submit(
    request: MediaGenerationAdapterRequest
  ): Promise<MediaGenerationSubmitResult> {
    this.submitCount += 1
    this.submittedModelIds.push(request.binding.model.id)
    return {
      status: "accepted",
      externalOperationId: "provider-op-1",
      providerCheckpoint: { cursor: 0 }
    }
  }

  async poll(request: MediaGenerationAdapterRequest & {
    readonly externalOperationId: string
    readonly providerCheckpoint?: JsonValue
  }): Promise<MediaGenerationPollResult> {
    this.pollExternalOperationIds.push(request.externalOperationId)
    this.pollCount += 1
    if (this.pollCount === 1) {
      return {
        status: "pending",
        providerCheckpoint: { cursor: 1 },
        progress: { percent: 50 }
      }
    }
    return {
      status: "completed",
      outputs: [
        {
          kindOfOutput: "inline_bytes",
          bytes: Buffer.from("generated-image"),
          mediaType: "image/png",
          kind: "image"
        }
      ]
    }
  }
}

class ThrowingPollAdapter
  extends EndpointFixtureMediaAdapter
  implements MediaGenerationAdapter {
  readonly modelEndpoint = mediaModelEndpoint({
    endpointId: "fake-throwing-poll-endpoint",
    protocolId: "fake-throwing-poll-protocol",
    providerId: "fake-throwing-poll-provider",
    modelId: "fake-throwing-poll-model",
    input: ["text"]
  })
  submitCount = 0
  pollCount = 0

  async submit(): Promise<MediaGenerationSubmitResult> {
    this.submitCount += 1
    return { status: "accepted", externalOperationId: "throwing-provider-op" }
  }

  async poll(): Promise<MediaGenerationPollResult> {
    this.pollCount += 1
    throw new Error(`temporary provider failure ${this.pollCount}`)
  }
}

class CancelTrackingAdapter extends AsyncImageAdapter {
  readonly cancelledExternalOperationIds: string[] = []

  async cancel(request: MediaGenerationAdapterRequest & {
    readonly externalOperationId?: string
  }): Promise<void> {
    if (request.externalOperationId !== undefined) {
      this.cancelledExternalOperationIds.push(request.externalOperationId)
    }
  }
}

class PollHintAdapter
  extends EndpointFixtureMediaAdapter
  implements MediaGenerationAdapter {
  readonly modelEndpoint: MediaGenerationModelEndpoint

  constructor(endpointId: string, private readonly pollAfterMs: number) {
    super()
    this.modelEndpoint = mediaModelEndpoint({
      endpointId,
      protocolId: "fake-poll-hint-protocol",
      providerId: "fake-poll-hint-provider",
      modelId: endpointId,
      input: ["text"]
    })
  }

  async submit(): Promise<MediaGenerationSubmitResult> {
    return {
      status: "accepted",
      externalOperationId: `provider_${this.modelEndpoint.id}`,
      pollAfterMs: this.pollAfterMs
    }
  }

  async poll(): Promise<MediaGenerationPollResult> {
    throw new Error("poll hint adapter should remain suspended")
  }
}

class ReferenceOutputAdapter
  extends EndpointFixtureMediaAdapter
  implements MediaGenerationAdapter {
  readonly modelEndpoint = mediaModelEndpoint({
    endpointId: "fake-reference-endpoint",
    protocolId: "fake-reference-protocol",
    providerId: "fake-image-provider",
    modelId: "fake-reference-model",
    input: ["text"]
  })

  async submit(): Promise<MediaGenerationSubmitResult> {
    return {
      status: "completed",
      outputs: [
        {
          kindOfOutput: "provider_file",
          provider: "fake-image-provider",
          fileId: "file-1",
          mediaType: "image/png",
          kind: "image"
        }
      ]
    }
  }

  async poll(): Promise<MediaGenerationPollResult> {
    throw new Error("reference adapter does not poll")
  }
}

class AmbiguousSubmitAdapter
  extends EndpointFixtureMediaAdapter
  implements MediaGenerationAdapter {
  readonly modelEndpoint = mediaModelEndpoint({
    endpointId: "fake-ambiguous-endpoint",
    protocolId: "fake-ambiguous-protocol",
    providerId: "fake-ambiguous-provider",
    modelId: "fake-ambiguous-model",
    input: ["text"]
  })
  submitCount = 0

  async submit(): Promise<MediaGenerationSubmitResult> {
    this.submitCount += 1
    throw new Error("connection lost after provider accepted request")
  }

  async poll(): Promise<MediaGenerationPollResult> {
    throw new Error("ambiguous adapter does not poll")
  }
}

class BlockingSubmitAdapter
  extends EndpointFixtureMediaAdapter
  implements MediaGenerationAdapter {
  readonly modelEndpoint = mediaModelEndpoint({
    endpointId: "fake-blocking-endpoint",
    protocolId: "fake-blocking-protocol",
    providerId: "fake-blocking-provider",
    modelId: "fake-blocking-model",
    input: ["text"]
  })
  readonly started: Promise<void>
  private readonly resolveStarted: () => void

  constructor() {
    super()
    let resolveStarted!: () => void
    this.started = new Promise((resolve) => {
      resolveStarted = resolve
    })
    this.resolveStarted = resolveStarted
  }

  async submit(request: MediaGenerationAdapterRequest): Promise<MediaGenerationSubmitResult> {
    this.resolveStarted()
    return await new Promise<MediaGenerationSubmitResult>((_, reject) => {
      const onAbort = () => {
        request.signal.removeEventListener("abort", onAbort)
        reject(new Error("provider submit aborted"))
      }
      request.signal.addEventListener("abort", onAbort, { once: true })
    })
  }

  async poll(): Promise<MediaGenerationPollResult> {
    throw new Error("blocking adapter does not poll")
  }
}

function mediaModelEndpoint(request: {
  readonly endpointId: string
  readonly protocolId: string
  readonly providerId: string
  readonly modelId: string
  readonly input: readonly ("text" | "image")[]
}): MediaGenerationModelEndpoint {
  return {
    id: request.endpointId,
    connection: {
      id: `connection_${request.endpointId}`,
      providerId: request.providerId
    },
    protocol: { id: request.protocolId },
    model: {
      id: request.modelId,
      operations: ["image.generate"],
      inputModalities: request.input,
      outputModalities: ["image"],
      features: [],
      catalog: {
        source: "custom",
        catalogId: `test.${request.modelId}`,
        revision: "1"
      }
    }
  }
}

async function createStore(name: string): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), `wanex-${name}-`))
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

async function readResourceBytes(
  storage: StorageTestStore,
  resource: ResourceRecord
): Promise<Buffer> {
  return await readFile(join(storage.storeDir, "files", resource.logicalPath))
}

async function eventually(assertion: () => Promise<void>): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  throw lastError
}

async function runWhenDue(
  runtime: WanexMediaGenerationRuntime
): Promise<Awaited<ReturnType<WanexMediaGenerationRuntime["runOnce"]>>> {
  let result: Awaited<ReturnType<WanexMediaGenerationRuntime["runOnce"]>> = {
    status: "idle"
  }
  await eventually(async () => {
    result = await runtime.runOnce()
    expect(result.status).not.toBe("idle")
  })
  return result
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}
