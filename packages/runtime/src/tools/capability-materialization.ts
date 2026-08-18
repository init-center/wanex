import type {
  JsonValue,
  ModelCapabilityRequirement,
  ModelCapabilityRouteExecutionBinding
} from "@wanex/protocol"
import {
  findModelCapabilityRouteExecutionBinding,
  modelCapabilityRequirementKey,
  normalizeModelCapabilityRequirement,
  normalizeModelCapabilityRouteExecutionBindings
} from "../provider/index.js"
import { createToolRuntimeBinding } from "./evidence.js"
import { ToolRegistry } from "./registry.js"

export interface MaterializedCapabilityTools {
  readonly tools: ToolRegistry
  readonly unresolvedRequirements: readonly ModelCapabilityRequirement[]
}

export function materializeToolRegistryForCapabilityRoutes(options: {
  readonly tools: ToolRegistry
  readonly capabilityRoutes: readonly ModelCapabilityRouteExecutionBinding[]
}): MaterializedCapabilityTools {
  const routes = normalizeModelCapabilityRouteExecutionBindings(
    options.capabilityRoutes
  )
  const materialized = new ToolRegistry()
  const unresolved = new Map<string, ModelCapabilityRequirement>()

  for (const descriptor of options.tools.list()) {
    const definition = options.tools.get(descriptor.name)
    if (definition === undefined) {
      throw new Error(
        `tool registry changed during capability materialization: ${descriptor.name}`
      )
    }
    const requirements = (descriptor.requiredCapabilities ?? []).map(
      normalizeModelCapabilityRequirement
    )
    if (requirements.length === 0) {
      materialized.register(definition)
      continue
    }
    const selected = requirements.map((requirement) => ({
      requirement,
      route: findModelCapabilityRouteExecutionBinding(routes, requirement)
    }))
    const missing = selected.filter((item) => item.route === undefined)
    if (missing.length > 0) {
      for (const item of missing) {
        unresolved.set(
          modelCapabilityRequirementKey(item.requirement),
          item.requirement
        )
      }
      continue
    }
    const capabilityRoutes = selected.map((item) => item.route!)
    materialized.register({
      ...definition,
      runtimeBinding: createToolRuntimeBinding({
        implementationId: definition.runtimeBinding.implementationId,
        implementationRevision: definition.runtimeBinding.implementationRevision,
        configuration: {
          baseConfigurationDigest:
            definition.runtimeBinding.configurationDigest ?? null,
          capabilityRoutes
        } as unknown as JsonValue
      }),
      async invoke(invocation) {
        return await definition.invoke({
          ...invocation,
          capabilityRoutes
        })
      }
    })
  }

  return {
    tools: materialized,
    unresolvedRequirements: [...unresolved.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, requirement]) => requirement)
  }
}
