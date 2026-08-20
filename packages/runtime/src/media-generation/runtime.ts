import { randomUUID } from "node:crypto"
import type {
  JsonValue,
  MediaGenerationOperationBinding,
  MediaGenerationOperationRecord,
  ResourceInputEvidence
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
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
  MediaGenerationRuntimeOptions,
  MediaGenerationRunResult,
  SubmitMediaGenerationRequest
} from "./types.js"
import {
  isReferenceOutput,
  materializedOutputToIngestRequest,
  referenceToOutput,
  toOutputReference,
  toProviderReference
} from "./output.js"
import {
  MediaGenerationAdapterRegistry,
  prepareMediaGenerationOperationBinding
} from "./binding.js"

const DEFAULT_MAX_OUTPUT_BYTES = 100 * 1024 * 1024
const DEFAULT_POLL_INITIAL_DELAY_MS = 1_000
const DEFAULT_POLL_MAX_DELAY_MS = 30_000
const DEFAULT_MAX_CONSECUTIVE_POLL_FAILURES = 3

export class WanexMediaGenerationRuntime {
  readonly runtime: WanexJobRuntime
  readonly storage: CoreStore
  private readonly adapters: MediaGenerationAdapterRegistry
  private readonly maxOutputBytes: number
  private readonly pollInitialDelayMs: number
  private readonly pollMaxDelayMs: number
  private readonly maxConsecutivePollFailures: number
  readonly #activeAbortRegistry: ActiveExecutionAbortRegistry

  constructor(options: MediaGenerationRuntimeOptions) {
    this.storage = options.storage
    this.adapters = new MediaGenerationAdapterRegistry(options.adapters)
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
    this.pollInitialDelayMs = positiveInteger(
      options.pollInitialDelayMs ?? DEFAULT_POLL_INITIAL_DELAY_MS,
      "media generation pollInitialDelayMs"
    )
    this.pollMaxDelayMs = positiveInteger(
      options.pollMaxDelayMs ?? DEFAULT_POLL_MAX_DELAY_MS,
      "media generation pollMaxDelayMs"
    )
    if (this.pollMaxDelayMs < this.pollInitialDelayMs) {
      throw new Error(
        "media generation pollMaxDelayMs must be greater than or equal to pollInitialDelayMs"
      )
    }
    this.maxConsecutivePollFailures = positiveInteger(
      options.maxConsecutivePollFailures ??
        DEFAULT_MAX_CONSECUTIVE_POLL_FAILURES,
      "media generation maxConsecutivePollFailures"
    )
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
    this.adapters.requireExecutionBinding(request.modelEndpoint)
    const binding = await this.createBinding(request)
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
    const status =
      result.status === "failed"
        ? "failed"
        : operation !== null && !isTerminalOperation(operation)
          ? "suspended"
          : "completed"
    return {
      status,
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
        adapter = this.adapters.requireOperationBinding(begun.operation.binding)
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
            "provider rejected generation request",
            "none"
          )
        }
        if (submitted.status === "accepted") {
          const accepted = await this.storage.acceptMediaGenerationOperation({
            operationId,
            workerId: context.job.leaseOwner ?? "",
            leaseToken: requireLeaseToken(context.job),
            externalOperationId: submitted.externalOperationId,
            ...(submitted.providerCheckpoint === undefined
              ? {}
              : { providerCheckpoint: submitted.providerCheckpoint })
          })
          if (accepted === null) {
            throw new Error(`media generation acceptance lost: ${operationId}`)
          }
          if (accepted.state === "cancel_requested") {
            return await this.cancelAndAcknowledge(
              accepted,
              adapter,
              request,
              context
            )
          }
          return await this.suspendAndAcknowledge({
            operation: accepted,
            adapter,
            request,
            context,
            outcome: "scheduled",
            delayMs: this.pollDelayMs(0, submitted.pollAfterMs)
          })
        }
        return await this.materializeAndComplete(
          adapter,
          request,
          submitted.outputs,
          context,
          "none"
        )
      }
      if (begun.operation.state === "polling") {
        return await this.pollOnce(adapter, request, context)
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
          { type: "model_endpoint_mismatch", message: error.message },
          "media generation provider binding is no longer available",
          "none"
        )
      }
      if (error instanceof MediaGenerationAmbiguousSubmissionError) {
        return await this.settleAndAcknowledge(
          latest ?? begun.operation,
          context,
          "recovery_required",
          { type: "ambiguous_provider_submission", message: error.message },
          "provider submission may have been accepted without a durable checkpoint",
          "none"
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
            "cannot cancel provider operation without its bound adapter",
            "none"
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
        if (latest?.state === "polling" && adapter !== undefined) {
          return await this.suspendAndAcknowledge({
            operation: latest,
            adapter,
            request,
            context,
            outcome: "scheduled",
            delayMs: this.pollDelayMs(latest.pollCount)
          })
        }
        return await this.settleAndAcknowledge(
          latest ?? begun.operation,
          context,
          "recovery_required",
          { type: abort.kind, message: abort.message },
          "media generation worker stopped before operation settlement",
          "none"
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
        "media generation worker failed",
        "none"
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

  private async pollOnce(
    adapter: MediaGenerationAdapter,
    request: MediaGenerationAdapterRequest,
    context: Parameters<NonNullable<Parameters<WanexJobRuntime["register"]>[1]>>[0]
  ): Promise<WorkerHandlerReturn> {
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
        "polling operation has no external provider operation id",
        "none"
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
    } catch (error) {
      if (context.signal.aborted) throw error
      const consecutiveFailures = operation.consecutivePollFailures + 1
      const evidence = {
        type: "provider_poll_error",
        message: error instanceof Error ? error.message : String(error),
        consecutiveFailures
      }
      if (consecutiveFailures >= this.maxConsecutivePollFailures) {
        return await this.settleAndAcknowledge(
          operation,
          context,
          "failed",
          evidence,
          "provider polling failed repeatedly",
          "transient_error"
        )
      }
      return await this.suspendAndAcknowledge({
        operation,
        adapter,
        request,
        context,
        outcome: "transient_error",
        delayMs: this.pollDelayMs(consecutiveFailures - 1),
        error: evidence
      })
    }
    if (result.status === "pending") {
      return await this.suspendAndAcknowledge({
        operation,
        adapter,
        request,
        context,
        outcome: "pending",
        delayMs: this.pollDelayMs(operation.pollCount, result.pollAfterMs),
        ...(result.providerCheckpoint === undefined
          ? {}
          : { providerCheckpoint: result.providerCheckpoint }),
        ...(result.progress === undefined ? {} : { progress: result.progress })
      })
    }
    if (result.status === "failed") {
      return await this.settleAndAcknowledge(
        operation,
        context,
        "failed",
        result.error,
        "provider reported generation failure",
        "provider_failure"
      )
    }
    try {
      return await this.materializeAndComplete(
        adapter,
        request,
        result.outputs,
        context,
        "completed"
      )
    } catch (error) {
      if (context.signal.aborted) throw error
      const latest = await this.requireOperation(operation.id)
      return await this.settleAndAcknowledge(
        latest,
        context,
        "failed",
        {
          type: "runtime_error",
          message: error instanceof Error ? error.message : String(error)
        },
        "media generation output materialization failed",
        latest.state === "polling" ? "completed" : "none"
      )
    }
  }

  private async suspendAndAcknowledge(options: {
    readonly operation: MediaGenerationOperationRecord
    readonly adapter: MediaGenerationAdapter
    readonly request: MediaGenerationAdapterRequest
    readonly context: Parameters<NonNullable<Parameters<WanexJobRuntime["register"]>[1]>>[0]
    readonly outcome: import("@wanex/protocol").MediaGenerationSuspensionOutcome
    readonly delayMs: number
    readonly providerCheckpoint?: JsonValue
    readonly progress?: JsonValue
    readonly error?: JsonValue
  }): Promise<WorkerHandlerReturn> {
    const receipt = await this.storage.suspendMediaGenerationOperation({
      operationId: options.operation.id,
      workerId: options.context.job.leaseOwner ?? "",
      leaseToken: requireLeaseToken(options.context.job),
      delayMs: options.delayMs,
      outcome: options.outcome,
      ...(options.providerCheckpoint === undefined
        ? {}
        : { providerCheckpoint: options.providerCheckpoint }),
      ...(options.progress === undefined ? {} : { progress: options.progress }),
      ...(options.error === undefined ? {} : { error: options.error })
    })
    if (receipt === null) {
      throw new Error(
        `media generation suspension lost: ${options.operation.id}`
      )
    }
    if (receipt.action === "cancel") {
      return await this.cancelAndAcknowledge(
        receipt.operation,
        options.adapter,
        options.request,
        options.context
      )
    }
    return workerAcknowledged(receipt.job)
  }

  private pollDelayMs(exponent: number, providerHintMs?: number): number {
    const requested = providerHintMs ??
      this.pollInitialDelayMs * 2 ** Math.min(20, Math.max(0, exponent))
    if (!Number.isFinite(requested) || requested <= 0) {
      throw new Error("media generation pollAfterMs must be a positive finite number")
    }
    return Math.max(
      this.pollInitialDelayMs,
      Math.min(this.pollMaxDelayMs, Math.floor(requested))
    )
  }

  private async materializeAndComplete(
    adapter: MediaGenerationAdapter,
    request: MediaGenerationAdapterRequest,
    outputs: readonly MediaGenerationProviderOutput[],
    context: Parameters<NonNullable<Parameters<WanexJobRuntime["register"]>[1]>>[0],
    pollOutcome: import("@wanex/protocol").MediaGenerationTerminalPollOutcome
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
        pollOutcome,
        outputReferences: references
      })
    }
    const operation = await this.requireOperation(request.operationId)
    const resourceIds = await this.materializeOutputs(adapter, request, outputs)
    return await this.completeAndAcknowledge(
      operation,
      context,
      resourceIds,
      references.length > 0 ? "none" : pollOutcome
    )
  }

  private async materializePersistedAndComplete(
    adapter: MediaGenerationAdapter,
    request: MediaGenerationAdapterRequest,
    context: Parameters<NonNullable<Parameters<WanexJobRuntime["register"]>[1]>>[0]
  ): Promise<WorkerHandlerReturn> {
    const operation = await this.requireOperation(request.operationId)
    const outputs = operation.outputReferences.map((reference) => referenceToOutput(reference))
    const resourceIds = await this.materializeOutputs(adapter, request, outputs)
    return await this.completeAndAcknowledge(operation, context, resourceIds, "none")
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
      await this.storage.recordResourceProvenance({
        resource: {
          resourceId: resource.id,
          sha256: resource.sha256,
          sizeBytes: resource.sizeBytes,
          kind: resource.kind,
          ...(resource.mediaType === undefined ? {} : { mediaType: resource.mediaType })
        },
        cause: {
          kind: "media_generation",
          operationId: request.operationId
        },
        inputResources: request.binding.request.inputResources
      })
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
    resourceIds: readonly string[],
    pollOutcome: import("@wanex/protocol").MediaGenerationTerminalPollOutcome
  ): Promise<WorkerHandlerReturn> {
    const completed = await this.storage.completeMediaGenerationOperation({
      operationId: operation.id,
      workerId: context.job.leaseOwner ?? "",
      leaseToken: requireLeaseToken(context.job),
      pollOutcome,
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
    reason: string,
    pollOutcome: import("@wanex/protocol").MediaGenerationTerminalPollOutcome
  ): Promise<WorkerHandlerReturn> {
    const settled = await this.storage.settleMediaGenerationOperation({
      operationId: operation.id,
      workerId: context.job.leaseOwner ?? "",
      leaseToken: requireLeaseToken(context.job),
      pollOutcome,
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
          "provider cancellation could not be confirmed",
          "none"
        )
      }
    }
    return await this.settleAndAcknowledge(
      operation,
      context,
      "cancelled",
      { type: "cancelled", reason: operation.cancelReason ?? "cancelled" },
      operation.cancelReason ?? "cancelled",
      "none"
    )
  }

  private async createBinding(
    request: SubmitMediaGenerationRequest
  ): Promise<MediaGenerationOperationBinding> {
    const resources: ResourceInputEvidence[] = []
    const seen = new Set<string>()
    for (const resourceId of request.inputResourceIds ?? []) {
      if (seen.has(resourceId)) throw new Error(`media generation resource is duplicated: ${resourceId}`)
      seen.add(resourceId)
      const resource = await this.storage.getResource({ resourceId })
      if (resource === null || resource.state !== "available") {
        throw new Error(`media generation resource is not available: ${resourceId}`)
      }
      resources.push({
        resourceId: resource.id,
        sha256: resource.sha256,
        sizeBytes: resource.sizeBytes,
        kind: resource.kind,
        ...(resource.mediaType === undefined ? {} : { mediaType: resource.mediaType })
      })
    }
    return prepareMediaGenerationOperationBinding({
      operation: request.operation,
      modelEndpoint: request.modelEndpoint,
      prompt: request.prompt,
      outputModality: request.outputModality,
      inputResources: resources,
      ...(request.options === undefined ? {} : { options: request.options })
    })
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

function operationIdFromPayload(payload: JsonValue): string | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null
  const value = (payload as Record<string, JsonValue>).operationId
  return typeof value === "string" && value.length > 0 ? value : null
}

function requireLeaseToken(job: { readonly leaseToken?: string }): string {
  if (job.leaseToken === undefined) throw new Error("media generation job has no lease token")
  return job.leaseToken
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`)
  }
  return value
}

function isTerminalOperation(operation: MediaGenerationOperationRecord): boolean {
  return (
    operation.state === "succeeded" ||
    operation.state === "failed" ||
    operation.state === "cancelled" ||
    operation.state === "recovery_required"
  )
}
