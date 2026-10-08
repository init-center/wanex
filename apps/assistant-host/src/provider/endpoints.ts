import type { ModelEndpoint } from "@wanex/protocol"
import { normalizeModelEndpoint } from "@wanex/runtime/provider"
import type { Shell } from "@wanex/assistant"
import type {
  LocalModelEndpointOptions,
  LocalModelCapabilityOperation,
  LocalModelEndpointsOptions
} from "../model.js"

export interface ResolvedLocalModelEndpoints {
  readonly endpoints: readonly ModelEndpoint[]
  readonly activeEndpointId?: string
  readonly capabilityRoutes?: Partial<Record<LocalModelCapabilityOperation, string>>
}

export function resolveLocalModelEndpoints(
  options: LocalModelEndpointsOptions | undefined
): ResolvedLocalModelEndpoints {
  const endpoints =
    options?.endpoints.map(normalizeLocalModelEndpoint) ?? []
  assertUniqueModelEndpointIds(endpoints)
  const activeEndpointId = normalizeOptionalString(
    options?.activeEndpointId,
    "modelEndpoints.activeEndpointId"
  )
  if (
    activeEndpointId !== undefined &&
    !endpoints.some((endpoint) => endpoint.id === activeEndpointId)
  ) {
    throw new Error(
      `active model endpoint must be included in modelEndpoints.endpoints: ${activeEndpointId}`
    )
  }
  const capabilityRoutes = options?.capabilityRoutes === undefined
    ? undefined
    : normalizeCapabilityRoutes(options.capabilityRoutes, endpoints)
  return {
    endpoints,
    ...(activeEndpointId === undefined ? {} : { activeEndpointId }),
    ...(capabilityRoutes === undefined ? {} : { capabilityRoutes })
  }
}

export async function seedLocalModelEndpoints(input: {
  readonly shell: Shell
  readonly modelEndpoints: ResolvedLocalModelEndpoints
}): Promise<void> {
  for (const modelEndpoint of input.modelEndpoints.endpoints) {
    await input.shell.modelEndpoints.upsertModelEndpoint({
      modelEndpoint,
      makeActive: false
    })
  }
  if (input.modelEndpoints.activeEndpointId !== undefined) {
    await input.shell.modelEndpoints.setActiveModelEndpoint({
      endpointId: input.modelEndpoints.activeEndpointId
    })
  } else {
    const active = await input.shell.modelEndpoints.readActiveModelEndpoint()
    if (active === null && input.modelEndpoints.endpoints[0] !== undefined) {
      await input.shell.modelEndpoints.setActiveModelEndpoint({
        endpointId: input.modelEndpoints.endpoints[0].id
      })
    }
  }
  for (const [operation, endpointId] of Object.entries(
    input.modelEndpoints.capabilityRoutes ?? {}
  )) {
    const readiness = await input.shell.modelCapabilities.setModelCapabilityRoute({
      operation: operation as LocalModelCapabilityOperation,
      modelEndpointId: endpointId
    })
    if (readiness.status !== "ready") {
      throw new Error(
        `configured model capability route is not ready: ${operation} -> ${endpointId} (${readiness.status})`
      )
    }
  }
}

export function normalizeLocalModelEndpoint(
  endpoint: LocalModelEndpointOptions
): ModelEndpoint {
  return normalizeModelEndpoint(endpoint)
}

function assertUniqueModelEndpointIds(
  endpoints: readonly ModelEndpoint[]
): void {
  const ids = new Set<string>()
  for (const endpoint of endpoints) {
    if (ids.has(endpoint.id)) {
      throw new Error(`duplicate model endpoint id: ${endpoint.id}`)
    }
    ids.add(endpoint.id)
  }
}

function normalizeOptionalString(
  value: string | undefined,
  name: string
): string | undefined {
  if (value === undefined) {
    return undefined
  }
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${name} must not be empty`)
  }
  return normalized
}

function normalizeCapabilityRoutes(
  routes: Partial<Record<LocalModelCapabilityOperation, string>>,
  endpoints: readonly ModelEndpoint[]
): Partial<Record<LocalModelCapabilityOperation, string>> {
  const normalized: Partial<Record<LocalModelCapabilityOperation, string>> = {}
  for (const [operation, endpointId] of Object.entries(routes)) {
    if (!isCapabilityOperation(operation)) {
      throw new Error(`unsupported model capability route: ${operation}`)
    }
    if (typeof endpointId !== "string" || endpointId.trim().length === 0) {
      throw new Error(`model capability route endpoint is invalid: ${operation}`)
    }
    const endpoint = endpoints.find((candidate) => candidate.id === endpointId)
    if (endpoint === undefined) {
      throw new Error(`model capability route endpoint not found: ${endpointId}`)
    }
    if (!endpoint.model.operations.includes(operation)) {
      throw new Error(`model endpoint ${endpointId} does not support ${operation}`)
    }
    normalized[operation] = endpointId
  }
  return normalized
}

function isCapabilityOperation(value: string): value is LocalModelCapabilityOperation {
  return value === "image.generate" ||
    value === "image.edit" ||
    value === "video.generate" ||
    value === "audio.transcribe" ||
    value === "audio.synthesize"
}
