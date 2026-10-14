import type {
  ModelCapabilityRouteExecutionBinding
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import {
  createModelCapabilityRouteExecutionBinding,
  IMAGE_UNDERSTANDING_REQUIREMENT,
  modelSupportsCapability
} from "@wanex/runtime/provider"
import {
  listWanexAppModelEndpoints,
  listWanexAppModelEndpointValues
} from "./model-endpoint.js"
import type { WanexAppModelEndpointListReadModel } from "./types-model-endpoint.js"

/**
 * The conversation endpoint that describes images for models that cannot see
 * them. It sends images to another provider, so it is only ever an explicit user
 * choice: there is no single-candidate or recommended fallback.
 */
export const APP_IMAGE_UNDERSTANDING_ENDPOINT_KEY =
  "wanex-app.imageUnderstanding.endpointId"

export async function readWanexAppImageUnderstandingEndpointId(
  storage: CoreStore
): Promise<string | undefined> {
  const value = await storage.getConfig(APP_IMAGE_UNDERSTANDING_ENDPOINT_KEY)
  if (value === null) return undefined
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("image understanding endpoint id must be a non-empty string")
  }
  return value
}

export async function setWanexAppImageUnderstandingEndpoint(options: {
  readonly storage: CoreStore
  readonly modelEndpointId: string | null
}): Promise<void> {
  if (options.modelEndpointId === null) {
    await options.storage.putConfig(APP_IMAGE_UNDERSTANDING_ENDPOINT_KEY, null)
    return
  }
  const endpoint = (await listWanexAppModelEndpointValues(options.storage))
    .find((candidate) => candidate.id === options.modelEndpointId)
  if (endpoint === undefined) {
    throw new Error(`model endpoint not found: ${options.modelEndpointId}`)
  }
  if (!modelSupportsCapability(endpoint.model, IMAGE_UNDERSTANDING_REQUIREMENT)) {
    throw new Error(`model endpoint ${endpoint.id} cannot read images`)
  }
  await options.storage.putConfig(APP_IMAGE_UNDERSTANDING_ENDPOINT_KEY, endpoint.id)
}

/**
 * The route frozen into a new Turn, or nothing when unset, missing or no longer
 * image-capable. Stored conversation endpoints are validated by the runtime
 * when they are saved. The runtime uses the route only when the Turn's own
 * model cannot see images.
 */
export async function resolveWanexAppImageUnderstandingRoute(options: {
  readonly storage: CoreStore
}): Promise<ModelCapabilityRouteExecutionBinding | undefined> {
  const endpointId = await readWanexAppImageUnderstandingEndpointId(options.storage)
  if (endpointId === undefined) return undefined
  const endpoint = (await listWanexAppModelEndpointValues(options.storage))
    .find((candidate) => candidate.id === endpointId)
  if (
    endpoint === undefined ||
    !modelSupportsCapability(endpoint.model, IMAGE_UNDERSTANDING_REQUIREMENT)
  ) {
    return undefined
  }
  return createModelCapabilityRouteExecutionBinding({
    requirement: IMAGE_UNDERSTANDING_REQUIREMENT,
    source: "configured",
    modelEndpoint: endpoint
  })
}

/** The endpoint list with the effective image-understanding choice, if any. */
export async function listWanexAppModelEndpointsWithImageUnderstanding(
  storage: CoreStore
): Promise<WanexAppModelEndpointListReadModel> {
  const [list, endpointId] = await Promise.all([
    listWanexAppModelEndpoints(storage),
    readWanexAppImageUnderstandingEndpointId(storage)
  ])
  const chosen = list.endpoints.find((endpoint) => endpoint.id === endpointId)
  return chosen !== undefined &&
    modelSupportsCapability(chosen.model, IMAGE_UNDERSTANDING_REQUIREMENT)
    ? { ...list, imageUnderstandingEndpointId: chosen.id }
    : list
}
