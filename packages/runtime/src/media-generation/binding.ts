import { createHash } from "node:crypto"
import type {
  JsonValue,
  MediaGenerationOperation,
  MediaGenerationOperationBinding,
  MediaGenerationOutputModality,
  ModelEndpoint,
  ModelEndpointExecutionBinding,
  ResourceInputEvidence
} from "@wanex/protocol"
import { resourceInputModality } from "../resources/input.js"
import {
  modelEndpointDigest,
  modelEndpointFromExecutionBinding
} from "../provider/index.js"
import type { MediaGenerationAdapter } from "./types.js"

export interface PrepareMediaGenerationOperationBindingRequest {
  readonly operation: MediaGenerationOperation
  readonly modelEndpoint: ModelEndpointExecutionBinding
  readonly prompt: string
  readonly outputModality: MediaGenerationOutputModality
  readonly inputResources?: readonly ResourceInputEvidence[]
  readonly options?: JsonValue
}

export function prepareMediaGenerationOperationBinding(
  request: PrepareMediaGenerationOperationBindingRequest
): MediaGenerationOperationBinding {
  const endpoint = modelEndpointFromExecutionBinding(request.modelEndpoint)
  if (!endpoint.model.operations.includes(request.operation)) {
    throw new Error(
      `media generation endpoint does not support ${request.operation}`
    )
  }
  if (!endpoint.model.outputModalities.includes(request.outputModality)) {
    throw new Error(
      `media generation endpoint does not support ${request.outputModality} output`
    )
  }
  assertMediaOperationOutput(request.operation, request.outputModality)
  if (!endpoint.model.inputModalities.includes("text")) {
    throw new Error("media generation endpoint must support text prompt input")
  }
  if (request.prompt.trim().length === 0) {
    throw new Error("media generation prompt must not be empty")
  }
  const resources = [...(request.inputResources ?? [])]
  const seen = new Set<string>()
  for (const resource of resources) {
    if (seen.has(resource.resourceId)) {
      throw new Error(
        `media generation resource is duplicated: ${resource.resourceId}`
      )
    }
    seen.add(resource.resourceId)
    const modality = resourceInputModality(resource)
    if (!endpoint.model.inputModalities.includes(modality)) {
      throw new Error(
        `media generation endpoint does not support ${modality} input`
      )
    }
  }
  if (
    request.operation === "image.edit" &&
    !resources.some(
      (resource) => resourceInputModality(resource) === "image"
    )
  ) {
    throw new Error("image.edit requires an image input resource")
  }
  const maxInputResources = endpoint.model.limits?.maxInputResources
  if (
    maxInputResources !== undefined &&
    resources.length > maxInputResources
  ) {
    throw new Error(
      `media generation endpoint accepts at most ${maxInputResources} input resources`
    )
  }
  const requestBinding = {
    operation: request.operation,
    prompt: request.prompt,
    outputModality: request.outputModality,
    inputResources: resources,
    options: request.options ?? null
  } as const
  return {
    endpointId: endpoint.id,
    endpointDigest: modelEndpointDigest(endpoint),
    connection: endpoint.connection,
    protocol: endpoint.protocol,
    model: endpoint.model,
    request: requestBinding,
    requestDigest: digestJson(requestBinding)
  }
}

export class MediaGenerationAdapterRegistry {
  readonly #adapters: ReadonlyMap<string, MediaGenerationAdapter>

  constructor(adapters: readonly MediaGenerationAdapter[]) {
    const byProtocol = new Map<string, MediaGenerationAdapter>()
    for (const adapter of adapters) {
      const protocolId = requiredProtocolId(adapter.protocolId)
      if (byProtocol.has(protocolId)) {
        throw new Error(
          `duplicate media generation protocol adapter: ${protocolId}`
        )
      }
      byProtocol.set(protocolId, adapter)
    }
    this.#adapters = byProtocol
  }

  get size(): number {
    return this.#adapters.size
  }

  supports(modelEndpoint: ModelEndpoint): boolean {
    const adapter = this.#adapters.get(modelEndpoint.protocol.id)
    return adapter?.canExecute(modelEndpoint) === true
  }

  requireModelEndpoint(modelEndpoint: ModelEndpoint): MediaGenerationAdapter {
    const protocolId = requiredProtocolId(modelEndpoint.protocol.id)
    const adapter = this.#adapters.get(protocolId)
    if (adapter === undefined) {
      throw new Error(
        `media generation protocol adapter is unavailable: ${protocolId}`
      )
    }
    if (!adapter.canExecute(modelEndpoint)) {
      throw new Error(
        `media generation protocol adapter cannot execute endpoint: ${modelEndpoint.id}`
      )
    }
    return adapter
  }

  requireExecutionBinding(
    binding: ModelEndpointExecutionBinding
  ): MediaGenerationAdapter {
    return this.requireModelEndpoint(modelEndpointFromExecutionBinding(binding))
  }

  requireOperationBinding(
    binding: MediaGenerationOperationBinding
  ): MediaGenerationAdapter {
    return this.requireExecutionBinding({
      endpointId: binding.endpointId,
      endpointDigest: binding.endpointDigest,
      connection: binding.connection,
      protocol: binding.protocol,
      model: binding.model
    })
  }
}

function assertMediaOperationOutput(
  operation: MediaGenerationOperation,
  outputModality: MediaGenerationOutputModality
): void {
  const expected =
    operation === "video.generate"
      ? "video"
      : operation === "audio.synthesize"
        ? "audio"
        : "image"
  if (outputModality !== expected) {
    throw new Error(`${operation} requires ${expected} output`)
  }
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableJson(
          (value as Record<string, unknown>)[key]
        )}`
    )
    .join(",")}}`
}

function requiredProtocolId(value: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error("media generation adapter protocolId must not be empty")
  }
  return normalized
}
