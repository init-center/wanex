import { createHash, randomUUID } from "node:crypto"
import type {
  IngestResourceRequest,
  JsonValue,
  MediaGenerationOperationBinding,
  MediaGenerationOperationRecord,
  MediaGenerationOutputReferenceRecord,
  ResourceInputEvidence,
  ResourceKind
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import { sha256Bytes, stableResourceLogicalPath } from "../resources/index.js"
import { resourceInputModality } from "../resources/input.js"
import {
  ActiveExecutionAbortRegistry,
  readActiveAbortReason
} from "../jobs/active-abort.js"
import { workerAcknowledged } from "../jobs/acknowledged.js"
import { WanexJobRuntime } from "../jobs/job-runtime.js"
import type { WorkerHandlerReturn } from "../jobs/types.js"
import type {
  MediaGenerationAdapter,
  MediaGenerationAdapterRequest,
  MediaGenerationMaterializedOutput,
  MediaGenerationProviderOutput,
  MediaGenerationProviderOutputBase,
  MediaGenerationRuntimeOptions,
  MediaGenerationRunResult,
  SubmitMediaGenerationRequest
} from "./types.js"

const DEFAULT_MAX_OUTPUT_BYTES = 100 * 1024 * 1024
const MAX_TRANSIENT_ERRORS = 3
const POLL_DELAY_MS = 100

export class WanexMediaGenerationRuntime {
  readonly runtime: WanexJobRuntime
  readonly storage: CoreStore
  private readonly adapters: ReadonlyMap<string, MediaGenerationAdapter>
  private readonly maxOutputBytes: number
  readonly #activeAbortRegistry: ActiveExecutionAbortRegistry

  constructor(options: MediaGenerationRuntimeOptions) {
    this.storage = options.storage
    this.adapters = createAdapterMap(options.adapters)
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
    this.#activeAbortRegistry =
      options.activeAbortRegistry ?? new ActiveExecutionAbortRegistry()
    this.runtime = new WanexJobRuntime({
      storage: options.storage,
      workerId: options.workerId ?? `media_generation_worker_${randomUUID()}`,
      leaseMs: options.leaseMs ?? 60_000,
      ...(options.heartbeatIntervalMs === undefined
        ? {}
        : { heartbeatIntervalMs: options.heartbeatIntervalMs }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      kinds: ["media.generate"],
      activeAbortRegistry: this.#activeAbortRegistry
    })
    this.runtime.register("media.generate", async (context) =>
      await this.handleJob(context)
    )
  }

  async submit(request: SubmitMediaGenerationRequest) {
    const adapter = this.adapterForProfile(request.providerProfileId)
    const binding = await this.createBinding(adapter, request)
    return await this.storage.submitMediaGenerationOperation({
      principalId: request.principalId ?? "wanex-media-user",
      idempotencyKey:
        request.idempotencyKey ??
        `wanex-media:${randomUUID()}`,
      binding,
      ...(request.priority === undefined ? {} : { priority: request.priority })
    })
  }

  async get(operationId: string): Promise<MediaGenerationOperationRecord | null> {
    return await this.storage.getMediaGenerationOperation({ operationId })
  }

  async cancel(operationId: string, reason: string) {
    const operation = await this.storage.requestMediaGenerationCancel({
      operationId,
      reason
    })
    if (operation?.state === "cancel_requested") {
      this.#activeAbortRegistry.abort(
        { jobId: operation.jobId },
        { kind: "cancel", message: reason }
      )
    }
    return operation
  }

  async runOnce(): Promise<MediaGenerationRunResult> {
    const result = await this.runtime.runWorkerOnce()
    if (result.status === "idle" || result.job === null) {
      return { status: "idle" }
    }
    const operation = await this.operationFromJob(result.job)
    return {
      status: result.status === "completed" ? "completed" : "failed",
      ...(operation === null ? {} : { operation }),
      ...(result.status === "failed" ? { error: result.error } : {})
    }
  }

  start(options: Parameters<WanexJobRuntime["startWorkerLoop"]>[0] = {}) {
    return this.runtime.startWorkerLoop(options)
  }

  async stop(): Promise<void> {
    await this.runtime.stop()
  }

  private async handleJob(context: Parameters<NonNullable<Parameters<WanexJobRuntime["register"]>[1]>>[0]): Promise<WorkerHandlerReturn> {
    const operationId = operationIdFromPayload(context.job.payload)
    if (operationId === null) {
      throw new Error(`media generation job payload has no operationId: ${context.job.id}`)
    }
    const begun = await this.storage.beginMediaGenerationOperation({
      operationId,
      workerId: context.job.leaseOwner ?? "",
      leaseToken: requireLeaseToken(context.job)
    })
    if (begun === null) {
      throw new Error(`media generation operation not found: ${operationId}`)
    }
    if (begun.action === "terminal" || begun.action === "recovery_required") {
      return workerAcknowledged(begun.job)
    }
    const request: MediaGenerationAdapterRequest = {
      operationId,
      binding: begun.operation.binding,
      signal: context.signal
    }
    let adapter: MediaGenerationAdapter | undefined
    try {
      try {
        adapter = this.adapterForBinding(begun.operation.binding)
      } catch (error) {
        throw new MediaGenerationBindingMismatchError(
          error instanceof Error ? error.message : String(error)
        )
      }
      if (begun.action === "cancel" || begun.operation.state === "cancel_requested") {
        return await this.cancelAndAcknowledge(
          begun.operation,
          adapter,
          request,
          context
        )
      }
      if (begun.operation.state === "submitting") {
        const submitted = await this.submitToProvider(adapter, request)
        if (submitted.status === "rejected") {
          return await this.settleAndAcknowledge(
            begun.operation,
            context,
            "failed",
            submitted.error,
            "provider rejected generation request"
          )
        }
        if (submitted.status === "accepted") {
          await this.storage.acceptMediaGenerationOperation({
            operationId,
            workerId: context.job.leaseOwner ?? "",
            leaseToken: requireLeaseToken(context.job),
            externalOperationId: submitted.externalOperationId,
            ...(submitted.providerCheckpoint === undefined
              ? {}
              : { providerCheckpoint: submitted.providerCheckpoint })
          })
          return await this.pollUntilSettled(adapter, request, context)
        }
        return await this.materializeAndComplete(
          adapter,
          request,
          submitted.outputs,
          context
        )
      }
      if (begun.operation.state === "polling") {
        return await this.pollUntilSettled(adapter, request, context)
      }
      if (begun.operation.state === "materializing") {
        return await this.materializePersistedAndComplete(adapter, request, context)
      }
      throw new Error(`unsupported media generation operation state: ${begun.operation.state}`)
    } catch (error) {
      const latest = await this.get(operationId)
      if (error instanceof MediaGenerationBindingMismatchError) {
        return await this.settleAndAcknowledge(
          latest ?? begun.operation,
          context,
          "recovery_required",
          { type: "provider_profile_mismatch", message: error.message },
          "media generation provider binding is no longer available"
        )
      }
      if (error instanceof MediaGenerationAmbiguousSubmissionError) {
        return await this.settleAndAcknowledge(
          latest ?? begun.operation,
          context,
          "recovery_required",
          { type: "ambiguous_provider_submission", message: error.message },
          "provider submission may have been accepted without a durable checkpoint"
        )
      }
      const abort = readActiveAbortReason(context.signal)
      if (abort?.kind === "cancel" || latest?.state === "cancel_requested") {
        if (adapter === undefined) {
          return await this.settleAndAcknowledge(
            latest ?? begun.operation,
            context,
            "recovery_required",
            { type: "provider_adapter_unavailable" },
            "cannot cancel provider operation without its bound adapter"
          )
        }
        return await this.cancelAndAcknowledge(
          latest ?? begun.operation,
          adapter,
          request,
          context
        )
      }
      if (abort?.kind === "host_shutdown" || abort?.kind === "timeout") {
        return await this.settleAndAcknowledge(
          latest ?? begun.operation,
          context,
          "recovery_required",
          { type: abort.kind, message: abort.message },
          "media generation worker stopped before operation settlement"
        )
      }
      if (abort !== undefined) {
        throw error
      }
      return await this.settleAndAcknowledge(
        latest ?? begun.operation,
        context,
        "failed",
        { type: "runtime_error", message: error instanceof Error ? error.message : String(error) },
        "media generation worker failed"
      )
    }
  }

  private async submitToProvider(adapter: MediaGenerationAdapter, request: MediaGenerationAdapterRequest) {
    try {
      return await adapter.submit(request)
    } catch (error) {
      throw new MediaGenerationAmbiguousSubmissionError(
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private async pollUntilSettled(
    adapter: MediaGenerationAdapter,
    request: MediaGenerationAdapterRequest,
    context: Parameters<NonNullable<Parameters<WanexJobRuntime["register"]>[1]>>[0]
  ): Promise<WorkerHandlerReturn> {
    let transientErrors = 0
    for (;;) {
      const operation = await this.requireOperation(request.operationId)
      if (operation.state === "cancel_requested") {
        return await this.cancelAndAcknowledge(operation, adapter, request, context)
      }
      if (operation.externalOperationId === undefined) {
        return await this.settleAndAcknowledge(
          operation,
          context,
          "recovery_required",
          { type: "missing_provider_checkpoint" },
          "polling operation has no external provider operation id"
        )
      }
      let result
      try {
        result = await adapter.poll({
          ...request,
          externalOperationId: operation.externalOperationId,
          ...(operation.providerCheckpoint === undefined
            ? {}
            : { providerCheckpoint: operation.providerCheckpoint })
        })
        transientErrors = 0
      } catch (error) {
        if (context.signal.aborted) throw error
        transientErrors += 1
        if (transientErrors >= MAX_TRANSIENT_ERRORS) {
          return await this.settleAndAcknowledge(
            operation,
            context,
            "failed",
            { type: "provider_poll_error", message: error instanceof Error ? error.message : String(error) },
            "provider polling failed repeatedly"
          )
        }
        await delay(POLL_DELAY_MS, context.signal)
        continue
      }
      if (result.status === "pending") {
        await this.storage.checkpointMediaGenerationOperation({
          operationId: operation.id,
          workerId: context.job.leaseOwner ?? "",
          leaseToken: requireLeaseToken(context.job),
          ...(result.providerCheckpoint === undefined
            ? {}
            : { providerCheckpoint: result.providerCheckpoint }),
          ...(result.progress === undefined ? {} : { progress: result.progress })
        })
        await delay(POLL_DELAY_MS, context.signal)
        continue
      }
      if (result.status === "failed") {
        return await this.settleAndAcknowledge(
          operation,
          context,
          "failed",
          result.error,
          "provider reported generation failure"
        )
      }
      return await this.materializeAndComplete(adapter, request, result.outputs, context)
    }
  }

  private async materializeAndComplete(
    adapter: MediaGenerationAdapter,
    request: MediaGenerationAdapterRequest,
    outputs: readonly MediaGenerationProviderOutput[],
    context: Parameters<NonNullable<Parameters<WanexJobRuntime["register"]>[1]>>[0]
  ): Promise<WorkerHandlerReturn> {
    if (outputs.length === 0) throw new Error("provider returned no generated outputs")
    const references = outputs
      .filter(isReferenceOutput)
      .map((output) => toOutputReference(output))
    if (references.length > 0) {
      await this.storage.recordMediaGenerationOutputs({
        operationId: request.operationId,
        workerId: context.job.leaseOwner ?? "",
        leaseToken: requireLeaseToken(context.job),
        outputReferences: references
      })
    }
    const operation = await this.requireOperation(request.operationId)
    const resourceIds = await this.materializeOutputs(adapter, request, outputs)
    return await this.completeAndAcknowledge(operation, context, resourceIds)
  }

  private async materializePersistedAndComplete(
    adapter: MediaGenerationAdapter,
    request: MediaGenerationAdapterRequest,
    context: Parameters<NonNullable<Parameters<WanexJobRuntime["register"]>[1]>>[0]
  ): Promise<WorkerHandlerReturn> {
    const operation = await this.requireOperation(request.operationId)
    const outputs = operation.outputReferences.map((reference) => referenceToOutput(reference))
    const resourceIds = await this.materializeOutputs(adapter, request, outputs)
    return await this.completeAndAcknowledge(operation, context, resourceIds)
  }

  private async materializeOutputs(
    adapter: MediaGenerationAdapter,
    request: MediaGenerationAdapterRequest,
    outputs: readonly MediaGenerationProviderOutput[]
  ): Promise<string[]> {
    let totalBytes = 0
    const resourceIds: string[] = []
    for (const output of outputs) {
      const materialized = await this.materializeOutput(adapter, request, output)
      if (materialized.bytes.byteLength === 0) throw new Error("generated output bytes must not be empty")
      totalBytes += materialized.bytes.byteLength
      if (totalBytes > this.maxOutputBytes) {
        throw new Error(`generated outputs exceed ${this.maxOutputBytes} bytes`)
      }
      const requestToIngest = materializedOutputToIngestRequest(materialized)
      const resource = await this.storage.ingestResource(requestToIngest)
      resourceIds.push(resource.id)
    }
    return resourceIds
  }

  private async materializeOutput(
    adapter: MediaGenerationAdapter,
    request: MediaGenerationAdapterRequest,
    output: MediaGenerationProviderOutput
  ): Promise<MediaGenerationMaterializedOutput> {
    if (output.kindOfOutput === "inline_bytes") return output
    if (output.kindOfOutput === "base64") {
      return { ...output, bytes: Buffer.from(output.data, "base64") }
    }
    if (adapter.materialize === undefined) {
      throw new Error("provider reference output requires an adapter materializer")
    }
    return await adapter.materialize(toProviderReference(output), request)
  }

  private async completeAndAcknowledge(
    operation: MediaGenerationOperationRecord,
    context: Parameters<NonNullable<Parameters<WanexJobRuntime["register"]>[1]>>[0],
    resourceIds: readonly string[]
  ): Promise<WorkerHandlerReturn> {
    const completed = await this.storage.completeMediaGenerationOperation({
      operationId: operation.id,
      workerId: context.job.leaseOwner ?? "",
      leaseToken: requireLeaseToken(context.job),
      outputResourceIds: resourceIds
    })
    if (completed === null) throw new Error(`media generation completion lost: ${operation.id}`)
    return workerAcknowledged(await this.requireJob(operation.jobId))
  }

  private async settleAndAcknowledge(
    operation: MediaGenerationOperationRecord,
    context: Parameters<NonNullable<Parameters<WanexJobRuntime["register"]>[1]>>[0],
    outcome: "failed" | "recovery_required" | "cancelled",
    error: JsonValue,
    reason: string
  ): Promise<WorkerHandlerReturn> {
    const settled = await this.storage.settleMediaGenerationOperation({
      operationId: operation.id,
      workerId: context.job.leaseOwner ?? "",
      leaseToken: requireLeaseToken(context.job),
      outcome,
      error,
      reason
    })
    if (settled === null) throw new Error(`media generation settlement lost: ${operation.id}`)
    return workerAcknowledged(await this.requireJob(operation.jobId))
  }

  private async cancelAndAcknowledge(
    operation: MediaGenerationOperationRecord,
    adapter: MediaGenerationAdapter,
    request: MediaGenerationAdapterRequest,
    context: Parameters<NonNullable<Parameters<WanexJobRuntime["register"]>[1]>>[0]
  ): Promise<WorkerHandlerReturn> {
    if (operation.externalOperationId !== undefined) {
      try {
        await adapter.cancel?.({
          ...request,
          externalOperationId: operation.externalOperationId
        })
      } catch (error) {
        return await this.settleAndAcknowledge(
          operation,
          context,
          "recovery_required",
          {
            type: "provider_cancel_error",
            message: error instanceof Error ? error.message : String(error)
          },
          "provider cancellation could not be confirmed"
        )
      }
    }
    return await this.settleAndAcknowledge(
      operation,
      context,
      "cancelled",
      { type: "cancelled", reason: operation.cancelReason ?? "cancelled" },
      operation.cancelReason ?? "cancelled"
    )
  }

  private async createBinding(
    adapter: MediaGenerationAdapter,
    request: SubmitMediaGenerationRequest
  ): Promise<MediaGenerationOperationBinding> {
    const profile = adapter.profile
    if (!profile.output.includes(request.outputModality)) {
      throw new Error(`media generation profile does not support ${request.outputModality} output`)
    }
    if (!profile.input.includes("text")) {
      throw new Error("media generation profile must support text prompt input")
    }
    if (request.prompt.trim().length === 0) throw new Error("media generation prompt must not be empty")
    const resources: ResourceInputEvidence[] = []
    const seen = new Set<string>()
    for (const resourceId of request.inputResourceIds ?? []) {
      if (seen.has(resourceId)) throw new Error(`media generation resource is duplicated: ${resourceId}`)
      seen.add(resourceId)
      const resource = await this.storage.getResource({ resourceId })
      if (resource === null || resource.state !== "available") {
        throw new Error(`media generation resource is not available: ${resourceId}`)
      }
      const modality = resourceInputModality(resource)
      if (!profile.input.includes(modality)) {
        throw new Error(`media generation profile does not support ${modality} input`)
      }
      resources.push({
        resourceId: resource.id,
        sha256: resource.sha256,
        sizeBytes: resource.sizeBytes,
        kind: resource.kind,
        ...(resource.mediaType === undefined ? {} : { mediaType: resource.mediaType })
      })
    }
    const profileDigest = digestJson(profile)
    const requestBinding = {
      prompt: request.prompt,
      outputModality: request.outputModality,
      inputResources: resources,
      options: request.options ?? null
    } as const
    return {
      profileId: profile.id,
      profileDigest,
      adapterId: profile.adapterId,
      providerId: profile.providerId,
      modelId: profile.modelId,
      request: requestBinding,
      requestDigest: digestJson(requestBinding)
    }
  }

  private adapterForProfile(profileId: string): MediaGenerationAdapter {
    const adapter = this.adapters.get(profileId)
    if (adapter === undefined) throw new Error(`media generation profile not found: ${profileId}`)
    return adapter
  }

  private adapterForBinding(binding: MediaGenerationOperationBinding): MediaGenerationAdapter {
    const adapter = this.adapterForProfile(binding.profileId)
    if (adapter.profile.adapterId !== binding.adapterId || adapter.profile.modelId !== binding.modelId) {
      throw new Error("media generation adapter no longer matches frozen binding")
    }
    if (digestJson(adapter.profile) !== binding.profileDigest) {
      throw new Error("media generation provider profile changed after admission")
    }
    return adapter
  }

  private async requireOperation(operationId: string) {
    const operation = await this.get(operationId)
    if (operation === null) throw new Error(`media generation operation not found: ${operationId}`)
    return operation
  }

  private async requireJob(jobId: string) {
    const job = await this.storage.getJob({ jobId })
    if (job === null) throw new Error(`media generation job not found: ${jobId}`)
    return job
  }

  private async operationFromJob(job: NonNullable<Awaited<ReturnType<CoreStore["getJob"]>>>) {
    const operationId = operationIdFromPayload(job.payload)
    return operationId === null ? null : await this.get(operationId)
  }
}

class MediaGenerationAmbiguousSubmissionError extends Error {}
class MediaGenerationBindingMismatchError extends Error {}

function createAdapterMap(adapters: readonly MediaGenerationAdapter[]): ReadonlyMap<string, MediaGenerationAdapter> {
  const map = new Map<string, MediaGenerationAdapter>()
  for (const adapter of adapters) {
    if (map.has(adapter.profile.id)) throw new Error(`duplicate media generation profile: ${adapter.profile.id}`)
    map.set(adapter.profile.id, adapter)
  }
  return map
}

function operationIdFromPayload(payload: JsonValue): string | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null
  const value = (payload as Record<string, JsonValue>).operationId
  return typeof value === "string" && value.length > 0 ? value : null
}

function requireLeaseToken(job: { readonly leaseToken?: string }): string {
  if (job.leaseToken === undefined) throw new Error("media generation job has no lease token")
  return job.leaseToken
}

function isReferenceOutput(output: MediaGenerationProviderOutput): output is Extract<MediaGenerationProviderOutput, { kindOfOutput: "provider_file" | "remote_url" }> {
  return output.kindOfOutput === "provider_file" || output.kindOfOutput === "remote_url"
}

function toOutputReference(output: Extract<MediaGenerationProviderOutput, { kindOfOutput: "provider_file" | "remote_url" }>): MediaGenerationOutputReferenceRecord {
  if (output.kindOfOutput === "provider_file") {
    return {
      kindOfReference: "provider_file",
      provider: output.provider,
      providerFileId: output.fileId,
      ...(output.mediaType === undefined ? {} : { mediaType: output.mediaType }),
      ...(output.kind === undefined ? {} : { kind: output.kind }),
      ...(output.label === undefined ? {} : { label: output.label }),
      ...(output.metadata === undefined ? {} : { metadata: output.metadata }),
      ...(output.width === undefined ? {} : { width: output.width }),
      ...(output.height === undefined ? {} : { height: output.height }),
      ...(output.durationMs === undefined ? {} : { durationMs: output.durationMs })
    }
  }
  return {
    kindOfReference: "remote_url",
    ...(output.provider === undefined ? {} : { provider: output.provider }),
    sourceUrl: output.url,
    ...(output.expiresAt === undefined ? {} : { sourceExpiresAt: output.expiresAt }),
    ...(output.mediaType === undefined ? {} : { mediaType: output.mediaType }),
    ...(output.kind === undefined ? {} : { kind: output.kind }),
    ...(output.label === undefined ? {} : { label: output.label }),
    ...(output.metadata === undefined ? {} : { metadata: output.metadata }),
    ...(output.width === undefined ? {} : { width: output.width }),
    ...(output.height === undefined ? {} : { height: output.height }),
    ...(output.durationMs === undefined ? {} : { durationMs: output.durationMs })
  }
}

function toProviderReference(output: Extract<MediaGenerationProviderOutput, { kindOfOutput: "provider_file" | "remote_url" }>) {
  if (output.kindOfOutput === "provider_file") {
    return {
      kindOfReference: "provider_file" as const,
      provider: output.provider,
      fileId: output.fileId,
      ...providerReferenceMetadata(output)
    }
  }
  return {
    kindOfReference: "remote_url" as const,
    url: output.url,
    ...(output.expiresAt === undefined ? {} : { expiresAt: output.expiresAt }),
    ...providerReferenceMetadata(output)
  }
}

function providerReferenceMetadata(output: MediaGenerationProviderOutputBase) {
  return {
    ...(output.mediaType === undefined ? {} : { mediaType: output.mediaType }),
    ...(output.kind === undefined ? {} : { kind: output.kind }),
    ...(output.label === undefined ? {} : { label: output.label }),
    ...(output.metadata === undefined ? {} : { metadata: output.metadata }),
    ...(output.width === undefined ? {} : { width: output.width }),
    ...(output.height === undefined ? {} : { height: output.height }),
    ...(output.durationMs === undefined ? {} : { durationMs: output.durationMs })
  }
}

function referenceToOutput(reference: MediaGenerationOutputReferenceRecord): MediaGenerationProviderOutput {
  if (reference.kindOfReference === "provider_file") {
    if (reference.provider === undefined || reference.providerFileId === undefined) throw new Error("provider file output reference is incomplete")
    return {
      kindOfOutput: "provider_file",
      provider: reference.provider,
      fileId: reference.providerFileId,
      ...outputMetadata(reference)
    }
  }
  if (reference.sourceUrl === undefined) throw new Error("remote URL output reference is incomplete")
  return {
    kindOfOutput: "remote_url",
    ...(reference.provider === undefined ? {} : { provider: reference.provider }),
    url: reference.sourceUrl,
    ...(reference.sourceExpiresAt === undefined ? {} : { expiresAt: reference.sourceExpiresAt }),
    ...outputMetadata(reference)
  }
}

function outputMetadata(output: MediaGenerationOutputReferenceRecord): Omit<MediaGenerationProviderOutputBase, "bytes"> {
  return {
    ...(output.mediaType === undefined ? {} : { mediaType: output.mediaType }),
    ...(output.kind === undefined ? {} : { kind: output.kind }),
    ...(output.label === undefined ? {} : { label: output.label }),
    ...(output.metadata === undefined ? {} : { metadata: output.metadata }),
    ...(output.width === undefined ? {} : { width: output.width }),
    ...(output.height === undefined ? {} : { height: output.height }),
    ...(output.durationMs === undefined ? {} : { durationMs: output.durationMs })
  }
}

function materializedOutputToIngestRequest(output: MediaGenerationMaterializedOutput): IngestResourceRequest {
  const kind = output.kind ?? kindForMediaType(output.mediaType)
  return {
    logicalPath: stableResourceLogicalPath(kind, output.bytes, output.mediaType),
    content: output.bytes,
    kind,
    origin: "model_output",
    ...(output.mediaType === undefined ? {} : { mediaType: output.mediaType }),
    ...(output.label === undefined ? {} : { label: output.label }),
    ...(output.metadata === undefined ? {} : { metadata: output.metadata }),
    ...(output.width === undefined ? {} : { width: output.width }),
    ...(output.height === undefined ? {} : { height: output.height }),
    ...(output.durationMs === undefined ? {} : { durationMs: output.durationMs }),
    expectedSha256: sha256Bytes(output.bytes)
  }
}

function kindForMediaType(mediaType: string | undefined): ResourceKind {
  if (mediaType?.startsWith("image/")) return "image"
  if (mediaType?.startsWith("video/")) return "video"
  if (mediaType?.startsWith("audio/")) return "audio"
  return "artifact"
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`
}

async function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new Error("media generation polling aborted")
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
      reject(new Error("media generation polling aborted"))
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}
