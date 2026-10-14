import type {
  ModelCapabilityRequirement,
  ModelOptionDescriptor,
  SessionTurnExecutionBinding
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { PreparedAgentContext } from "@wanex/runtime/context"
import { materializeToolRegistryForCapabilityRoutes } from "@wanex/runtime/tools"
import { ToolRegistry } from "@wanex/runtime/tools"
import {
  findModelCapabilityRouteExecutionBinding,
  IMAGE_UNDERSTANDING_REQUIREMENT,
  modelCapabilityRequirementKey
} from "@wanex/runtime/provider"
import type { SecretResolverPort } from "@wanex/runtime/secrets"
import { createWanexAppImageAnalyzeTool } from "./image-analyze-tool.js"
import { createWanexAppCapabilityRequestTool } from "./capability-request-tool.js"
import { createWanexAppImageGenerationTool } from "./image-generation-tool.js"
import { resolveWanexAppModelCapability } from "./model-capability.js"
import { resolveWanexAppImageUnderstandingRoute } from "./image-understanding.js"
import type {
  WanexAppModelEndpointExecutionPredicate
} from "./model-capability.js"

export async function prepareWanexAppModelCapabilityContext(options: {
  readonly storage: CoreStore
  readonly base?: PreparedAgentContext
  readonly executionBinding?: SessionTurnExecutionBinding
  readonly isModelEndpointExecutable: WanexAppModelEndpointExecutionPredicate
  readonly secretResolver?: SecretResolverPort
}): Promise<PreparedAgentContext | undefined> {
  const declaredTools = declareWanexAppCapabilityTools(options.base?.tools, false)
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
  const imageGenerationRoute = findModelCapabilityRouteExecutionBinding(
    capabilityRoutes,
    {
      operation: "image.generate",
      inputModalities: ["text"],
      outputModalities: ["image"],
      features: []
    }
  )
  const materialized = materializeToolRegistryForCapabilityRoutes({
    tools: declareWanexAppCapabilityTools(
      options.base?.tools,
      imageGenerationRoute?.modelEndpoint.model.inputModalities.includes("image") === true,
      imageGenerationRoute?.modelEndpoint.model.generationOptions
    ),
    capabilityRoutes
  })
  // Admission freezes the explicitly chosen image-understanding endpoint as an
  // extra route; execution reuses whatever the Turn binding froze.
  const imageUnderstanding = options.executionBinding === undefined
    ? await resolveWanexAppImageUnderstandingRoute({ storage: options.storage })
    : undefined
  const frozenRoutes = imageUnderstanding === undefined
    ? capabilityRoutes
    : [...capabilityRoutes, imageUnderstanding]
  const tools = materialized.tools
  // The question-driven tool exists exactly when the Turn carries the route, so
  // the admitted and executed tool sets agree.
  const imageUnderstandingRoute = options.executionBinding === undefined
    ? imageUnderstanding
    : findModelCapabilityRouteExecutionBinding(
        options.executionBinding.capabilityRoutes,
        IMAGE_UNDERSTANDING_REQUIREMENT
      )
  if (imageUnderstandingRoute !== undefined) {
    tools.register(createWanexAppImageAnalyzeTool({
      storage: options.storage,
      route: imageUnderstandingRoute,
      ...(options.secretResolver === undefined
        ? {}
        : { secretResolver: options.secretResolver })
    }))
  }
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
    capabilityRoutes: frozenRoutes
  }
}

function declareWanexAppCapabilityTools(
  base: ToolRegistry | undefined,
  acceptsReferenceImages: boolean,
  generationOptions?: readonly ModelOptionDescriptor[]
): ToolRegistry {
  const declared = new ToolRegistry()
  declared.register(createWanexAppImageGenerationTool({ acceptsReferenceImages, ...(generationOptions === undefined ? {} : { generationOptions }) }))
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
