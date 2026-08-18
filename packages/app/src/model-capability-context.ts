import type {
  ModelCapabilityRequirement,
  SessionTurnExecutionBinding
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { PreparedAgentContext } from "@wanex/runtime/context"
import { materializeToolRegistryForCapabilityRoutes } from "@wanex/runtime/tools"
import { ToolRegistry } from "@wanex/runtime/tools"
import { modelCapabilityRequirementKey } from "@wanex/runtime/provider"
import { createWanexAppCapabilityRequestTool } from "./capability-request-tool.js"
import { createWanexAppImageGenerationTool } from "./image-generation-tool.js"
import { resolveWanexAppModelCapability } from "./model-capability.js"
import type {
  WanexAppModelEndpointExecutionPredicate
} from "./model-capability.js"

export async function prepareWanexAppModelCapabilityContext(options: {
  readonly storage: CoreStore
  readonly base?: PreparedAgentContext
  readonly executionBinding?: SessionTurnExecutionBinding
  readonly isModelEndpointExecutable: WanexAppModelEndpointExecutionPredicate
}): Promise<PreparedAgentContext | undefined> {
  const declaredTools = declareWanexAppCapabilityTools(options.base?.tools)
  const requirements = uniqueRequirements(
    declaredTools.list().flatMap(
      (descriptor) => descriptor.requiredCapabilities ?? []
    )
  )
  const capabilityRoutes = options.executionBinding === undefined
    ? (
        await Promise.all(
          requirements.map((requirement) =>
            resolveWanexAppModelCapability({
              storage: options.storage,
              requirement,
              isModelEndpointExecutable: options.isModelEndpointExecutable
            })
          )
        )
      ).flatMap((resolution) =>
        resolution.kind === "resolved" ? [resolution.binding] : []
      )
    : options.executionBinding.capabilityRoutes
  const materialized = materializeToolRegistryForCapabilityRoutes({
    tools: declaredTools,
    capabilityRoutes
  })
  const tools = materialized.tools
  if (materialized.unresolvedRequirements.length > 0) {
    tools.register(createWanexAppCapabilityRequestTool({
      requirements: materialized.unresolvedRequirements,
      async resolve(requirement) {
        return (
          await resolveWanexAppModelCapability({
            storage: options.storage,
            requirement,
            isModelEndpointExecutable: options.isModelEndpointExecutable
          })
        ).readiness
      }
    }))
  }
  return {
    ...options.base,
    tools,
    capabilityRoutes
  }
}

function declareWanexAppCapabilityTools(base: ToolRegistry | undefined): ToolRegistry {
  const declared = new ToolRegistry()
  declared.register(createWanexAppImageGenerationTool())
  if (base === undefined) return declared
  for (const descriptor of base.list()) {
    const definition = base.get(descriptor.name)
    if (definition === undefined) {
      throw new Error(
        `tool registry changed during App capability composition: ${descriptor.name}`
      )
    }
    declared.register(definition)
  }
  return declared
}

function uniqueRequirements(
  requirements: readonly ModelCapabilityRequirement[]
): readonly ModelCapabilityRequirement[] {
  const unique = new Map<string, ModelCapabilityRequirement>()
  for (const requirement of requirements) {
    unique.set(modelCapabilityRequirementKey(requirement), requirement)
  }
  if (unique.size > 64) {
    throw new Error("agent context exceeds 64 model capability requirements")
  }
  return [...unique.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, requirement]) => requirement)
}
