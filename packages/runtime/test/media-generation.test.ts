import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type {
  JsonValue,
  MediaGenerationProviderProfile,
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

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
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
      workerId: "media_worker_accepted"
    })

    const request = {
      providerProfileId: adapter.profile.id,
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
      prompt: "a precise square icon",
      outputModality: "image",
      inputResources: [],
      options: { size: "small" }
    })

    const result = await runtime.runOnce()
    expect(result.status).toBe("completed")
    expect(adapter.submitCount).toBe(1)
    expect(adapter.pollExternalOperationIds).toEqual(["provider-op-1", "provider-op-1"])

    const operation = await runtime.get(first.operation.id)
    expect(operation).toMatchObject({
      id: first.operation.id,
      state: "succeeded",
      externalOperationId: "provider-op-1",
      providerCheckpoint: { cursor: 1 },
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
      providerProfileId: adapter.profile.id,
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
      providerProfileId: adapter.profile.id,
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
      providerProfileId: adapter.profile.id,
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
      providerProfileId: adapter.profile.id,
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

  it("rejects recovery when the frozen provider profile no longer matches", async () => {
    const storage = await createStore("media-profile-drift")
    const original = new AsyncImageAdapter()
    const changed = new AsyncImageAdapter({ modelId: "changed-model" })
    const firstRuntime = new WanexMediaGenerationRuntime({
      storage,
      adapters: [original],
      workerId: "media_worker_profile_submit"
    })
    const submitted = await firstRuntime.submit({
      providerProfileId: original.profile.id,
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
    expect(changed.submitCount).toBe(0)
    await expect(secondRuntime.get(submitted.operation.id)).resolves.toMatchObject({
      state: "recovery_required",
      error: { type: "provider_profile_mismatch" }
    })
  })

  it("runs media generation inside the shared runtime host lifecycle", async () => {
    const storage = await createStore("media-host")
    const adapter = new AsyncImageAdapter()
    const host = new WanexRuntimeHost({
      storage,
      mediaGenerationAdapters: [adapter],
      idleIntervalMs: 10
    })

    expect(host.status()).toMatchObject({
      workerCount: 1,
      memoryWorkerCount: 0,
      mediaGenerationWorkerCount: 1
    })
    host.start()
    const submitted = await host.submitMediaGeneration({
      providerProfileId: adapter.profile.id,
      prompt: "host-owned media generation",
      outputModality: "image"
    })

    await eventually(async () => {
      await expect(
        host.getMediaGenerationOperation(submitted.operation.id)
      ).resolves.toMatchObject({ state: "succeeded" })
    })
    const health = host.getHealthSnapshot()
    expect(health.mediaGenerationWorkerCount).toBe(1)
    expect(health.loops.map((loop) => loop.kind)).toContain("media_generation")

    await host.dispose()
  })
})

class AsyncImageAdapter implements MediaGenerationAdapter {
  readonly profile: MediaGenerationProviderProfile
  submitCount = 0
  readonly pollExternalOperationIds: string[] = []
  private pollCount = 0

  constructor(options: {
    readonly input?: readonly ("text" | "image")[]
    readonly modelId?: string
  } = {}) {
    this.profile = {
      id: "fake-image-profile",
      adapterId: "fake-image-adapter",
      providerId: "fake-image-provider",
      modelId: options.modelId ?? "fake-image-model",
      input: options.input ?? ["text"],
      output: ["image"]
    }
  }

  async submit(): Promise<MediaGenerationSubmitResult> {
    this.submitCount += 1
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

class ReferenceOutputAdapter implements MediaGenerationAdapter {
  readonly profile: MediaGenerationProviderProfile = {
    id: "fake-reference-profile",
    adapterId: "fake-reference-adapter",
    providerId: "fake-image-provider",
    modelId: "fake-reference-model",
    input: ["text"],
    output: ["image"]
  }

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

class AmbiguousSubmitAdapter implements MediaGenerationAdapter {
  readonly profile: MediaGenerationProviderProfile = {
    id: "fake-ambiguous-profile",
    adapterId: "fake-ambiguous-adapter",
    providerId: "fake-ambiguous-provider",
    modelId: "fake-ambiguous-model",
    input: ["text"],
    output: ["image"]
  }
  submitCount = 0

  async submit(): Promise<MediaGenerationSubmitResult> {
    this.submitCount += 1
    throw new Error("connection lost after provider accepted request")
  }

  async poll(): Promise<MediaGenerationPollResult> {
    throw new Error("ambiguous adapter does not poll")
  }
}

class BlockingSubmitAdapter implements MediaGenerationAdapter {
  readonly profile: MediaGenerationProviderProfile = {
    id: "fake-blocking-profile",
    adapterId: "fake-blocking-adapter",
    providerId: "fake-blocking-provider",
    modelId: "fake-blocking-model",
    input: ["text"],
    output: ["image"]
  }
  readonly started: Promise<void>
  private readonly resolveStarted: () => void

  constructor() {
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

async function createStore(name: string): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), `wanex-${name}-`))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "oneshot",
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
