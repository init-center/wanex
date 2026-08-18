import type { ModelEndpoint } from "@wanex/protocol"
import { normalizeModelEndpoint } from "@wanex/runtime/provider"
import type { Shell } from "@wanex/product"
import type {
  LocalModelEndpointOptions,
  LocalModelEndpointsOptions
} from "../model.js"

export interface ResolvedLocalModelEndpoints {
  readonly endpoints: readonly ModelEndpoint[]
  readonly activeEndpointId?: string
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
  return {
    endpoints,
    ...(activeEndpointId === undefined ? {} : { activeEndpointId })
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
    return
  }
  const active = await input.shell.modelEndpoints.readActiveModelEndpoint()
  if (active === null && input.modelEndpoints.endpoints[0] !== undefined) {
    await input.shell.modelEndpoints.setActiveModelEndpoint({
      endpointId: input.modelEndpoints.endpoints[0].id
    })
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
