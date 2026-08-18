import type {
  CapabilityRouteSource,
  ModelCapabilityRequirement,
  ModelCapabilityRouteExecutionBinding,
  ModelEndpoint
} from "@wanex/protocol"
import {
  assertModelSupportsCapability,
  modelCapabilityRequirementKey,
  normalizeModelCapabilityRequirement
} from "./model-descriptor.js"
import {
  modelEndpointExecutionBinding,
  modelEndpointFromExecutionBinding
} from "./model-endpoint.js"

export function createModelCapabilityRouteExecutionBinding(options: {
  readonly requirement: ModelCapabilityRequirement
  readonly source: CapabilityRouteSource
  readonly modelEndpoint: ModelEndpoint
}): ModelCapabilityRouteExecutionBinding {
  return normalizeModelCapabilityRouteExecutionBinding({
    requirement: options.requirement,
    source: options.source,
    modelEndpoint: modelEndpointExecutionBinding(options.modelEndpoint)
  })
}

export function normalizeModelCapabilityRouteExecutionBinding(
  binding: ModelCapabilityRouteExecutionBinding
): ModelCapabilityRouteExecutionBinding {
  const requirement = normalizeModelCapabilityRequirement(binding.requirement)
  if (
    binding.source !== "configured" &&
    binding.source !== "single_candidate"
  ) {
    throw new Error(`invalid capability route source: ${String(binding.source)}`)
  }
  const endpoint = modelEndpointFromExecutionBinding(binding.modelEndpoint)
  assertModelSupportsCapability(endpoint.model, requirement)
  return {
    requirement,
    source: binding.source,
    modelEndpoint: modelEndpointExecutionBinding(endpoint)
  }
}

export function normalizeModelCapabilityRouteExecutionBindings(
  bindings: readonly ModelCapabilityRouteExecutionBinding[]
): readonly ModelCapabilityRouteExecutionBinding[] {
  if (!Array.isArray(bindings)) {
    throw new Error("model capability route bindings must be an array")
  }
  if (bindings.length > 64) {
    throw new Error("model capability route bindings exceed 64 entries")
  }
  const normalized = bindings.map(
    normalizeModelCapabilityRouteExecutionBinding
  )
  const keys = new Set<string>()
  for (const binding of normalized) {
    const key = modelCapabilityRequirementKey(binding.requirement)
    if (keys.has(key)) {
      throw new Error(`duplicate model capability route binding: ${key}`)
    }
    keys.add(key)
  }
  return normalized.sort((left, right) =>
    modelCapabilityRequirementKey(left.requirement).localeCompare(
      modelCapabilityRequirementKey(right.requirement)
    )
  )
}

export function findModelCapabilityRouteExecutionBinding(
  bindings: readonly ModelCapabilityRouteExecutionBinding[],
  requirement: ModelCapabilityRequirement
): ModelCapabilityRouteExecutionBinding | undefined {
  const key = modelCapabilityRequirementKey(requirement)
  return normalizeModelCapabilityRouteExecutionBindings(bindings).find(
    (binding) => modelCapabilityRequirementKey(binding.requirement) === key
  )
}
