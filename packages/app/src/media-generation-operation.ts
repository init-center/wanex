import type { WanexRuntimeHost } from "@wanex/runtime/host"
import type {
  ModelCapabilityRequirement,
  ModelInputModality
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import { resourceInputModality } from "@wanex/runtime/resources"
import { resolveWanexAppModelCapability } from "./model-capability.js"
import type {
  WanexAppModelEndpointExecutionPredicate
} from "./model-capability.js"
import type {
  WanexAppCancelMediaGenerationRequest,
  WanexAppCancelMediaGenerationReceipt,
  WanexAppMediaGenerationReadResult,
  WanexAppMediaGenerationReceipt,
  WanexAppReadMediaGenerationOperationRequest,
  WanexAppSubmitMediaGenerationRequest
} from "./types-media-generation.js"

export class WanexAppMediaGenerationOperationController {
  readonly #host: WanexRuntimeHost
  readonly #storage: CoreStore
  readonly #isModelEndpointExecutable: WanexAppModelEndpointExecutionPredicate
  #disposed = false

  constructor(options: {
    readonly host: WanexRuntimeHost
    readonly storage: CoreStore
    readonly isModelEndpointExecutable: WanexAppModelEndpointExecutionPredicate
  }) {
    this.#host = options.host
    this.#storage = options.storage
    this.#isModelEndpointExecutable = options.isModelEndpointExecutable
  }

  async submit(
    request: WanexAppSubmitMediaGenerationRequest
  ): Promise<WanexAppMediaGenerationReceipt> {
    this.#assertActive()
    const requirement = await this.#requirementFor(request)
    const resolution = await resolveWanexAppModelCapability({
      storage: this.#storage,
      requirement,
      isModelEndpointExecutable: this.#isModelEndpointExecutable
    })
    if (resolution.kind !== "resolved") {
      throw new Error(
        `model capability is not ready: ${requirement.operation} (${resolution.readiness.status})`
      )
    }
    const submitted = await this.#host.submitMediaGeneration({
      ...request,
      modelEndpoint: resolution.binding.modelEndpoint
    })
    return {
      operationId: submitted.operation.id,
      jobId: submitted.operation.jobId,
      state: submitted.operation.state,
      submittedAt: submitted.operation.createdAt
    }
  }

  async read(
    request: WanexAppReadMediaGenerationOperationRequest
  ): Promise<WanexAppMediaGenerationReadResult> {
    this.#assertActive()
    const operationId = normalizeRequiredString(
      request.operationId,
      "media generation operationId"
    )
    const operation = await this.#host.getMediaGenerationOperation(operationId)
    return operation === null
      ? { kind: "missing", operationId }
      : { kind: "found", operation }
  }

  async cancel(
    request: WanexAppCancelMediaGenerationRequest
  ): Promise<WanexAppCancelMediaGenerationReceipt> {
    this.#assertActive()
    const operationId = normalizeRequiredString(
      request.operationId,
      "media generation operationId"
    )
    const reason = normalizeRequiredString(
      request.reason,
      "media generation cancel reason"
    )
    const before = await this.#host.getMediaGenerationOperation(operationId)
    if (before === null) {
      return { operationId, status: "missing" }
    }
    if (isTerminal(before.state)) {
      return {
        operationId,
        status: "already_terminal",
        state: before.state
      }
    }
    const operation = await this.#host.requestMediaGenerationCancel({
      operationId,
      reason
    })
    if (operation === null) {
      return { operationId, status: "missing" }
    }
    if (operation.state === "cancelled") {
      return { operationId, status: "cancelled", state: operation.state }
    }
    if (operation.state === "cancel_requested") {
      return {
        operationId,
        status: "cancel_requested",
        state: operation.state
      }
    }
    return {
      operationId,
      status: "already_terminal",
      state: operation.state
    }
  }

  dispose(): void {
    this.#disposed = true
  }

  async #requirementFor(
    request: WanexAppSubmitMediaGenerationRequest
  ): Promise<ModelCapabilityRequirement> {
    const expectedOutput =
      request.operation === "video.generate"
        ? "video"
        : request.operation === "audio.synthesize"
          ? "audio"
          : "image"
    if (request.outputModality !== expectedOutput) {
      throw new Error(`${request.operation} requires ${expectedOutput} output`)
    }
    const inputModalities = new Set<ModelInputModality>(["text"])
    const resourceIds = new Set<string>()
    for (const resourceId of request.inputResourceIds ?? []) {
      if (resourceIds.has(resourceId)) {
        throw new Error(`media generation resource is duplicated: ${resourceId}`)
      }
      resourceIds.add(resourceId)
      const resource = await this.#storage.getResource({ resourceId })
      if (resource === null || resource.state !== "available") {
        throw new Error(`media generation resource is not available: ${resourceId}`)
      }
      inputModalities.add(resourceInputModality(resource))
    }
    if (
      request.operation === "image.edit" &&
      !inputModalities.has("image")
    ) {
      throw new Error("image.edit requires an image input resource")
    }
    return {
      operation: request.operation,
      inputModalities: [...inputModalities],
      outputModalities: [request.outputModality],
      features: []
    }
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error("media generation operation controller is disposed")
    }
  }
}

function isTerminal(state: string): boolean {
  return (
    state === "succeeded" ||
    state === "failed" ||
    state === "cancelled" ||
    state === "recovery_required"
  )
}

function normalizeRequiredString(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  return normalized
}
