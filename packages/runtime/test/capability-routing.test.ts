import { describe, expect, it } from "vitest"
import type {
  ModelCapabilityRouteExecutionBinding,
  ModelEndpoint
} from "@wanex/protocol"
import {
  createModelCapabilityRouteExecutionBinding,
  modelCapabilityRequirementKey,
  normalizeModelCapabilityRequirement,
  normalizeModelCapabilityRouteExecutionBindings
} from "../src/provider/index.js"
import {
  createToolRuntimeBinding,
  jsonToolResultContent,
  materializeToolRegistryForCapabilityRoutes,
  ToolRegistry,
  type ToolDefinition
} from "../src/tools/index.js"
import {
  assertTurnExecutionBindingValid,
  createTurnExecutionBinding
} from "../src/execution/turn-binding.js"
import { unavailableToolResources } from "./tool-invocation-fixture.js"

const imageRequirement = {
  operation: "image.generate",
  inputModalities: ["text"],
  outputModalities: ["image"],
  features: []
} as const

describe("model capability routing", () => {
  it("normalizes semantic requirements and rejects invalid route evidence", () => {
    expect(normalizeModelCapabilityRequirement({
      operation: "image.generate",
      inputModalities: ["image", "text"],
      outputModalities: ["image"],
      features: []
    })).toEqual({
      operation: "image.generate",
      inputModalities: ["text", "image"],
      outputModalities: ["image"],
      features: []
    })
    expect(() => normalizeModelCapabilityRequirement({
      ...imageRequirement,
      inputModalities: ["text", "text"]
    })).toThrow("duplicate model capability input modality")

    const route = imageRoute("image-a")
    expect(() => normalizeModelCapabilityRouteExecutionBindings([
      route,
      route
    ])).toThrow("duplicate model capability route binding")
    expect(() => normalizeModelCapabilityRouteExecutionBindings([{
      ...route,
      modelEndpoint: {
        ...route.modelEndpoint,
        endpointDigest: "0".repeat(64)
      }
    }])).toThrow("model endpoint execution binding digest is invalid")
  })

  it("omits unresolved tools and materializes exact route-bound definitions", async () => {
    const observed: ModelCapabilityRouteExecutionBinding[][] = []
    const registry = new ToolRegistry()
    registry.register(imageTool(observed))

    const missing = materializeToolRegistryForCapabilityRoutes({
      tools: registry,
      capabilityRoutes: []
    })
    expect(missing.tools.get("generate_image")).toBeUndefined()
    expect(missing.unresolvedRequirements.map(modelCapabilityRequirementKey))
      .toEqual([modelCapabilityRequirementKey(imageRequirement)])

    const routeA = imageRoute("image-a")
    const materializedA = materializeToolRegistryForCapabilityRoutes({
      tools: registry,
      capabilityRoutes: [routeA]
    })
    const routeB = imageRoute("image-b")
    const materializedB = materializeToolRegistryForCapabilityRoutes({
      tools: registry,
      capabilityRoutes: [routeB]
    })
    expect(materializedA.unresolvedRequirements).toEqual([])
    expect(materializedA.tools.get("generate_image")?.runtimeBinding)
      .not.toEqual(materializedB.tools.get("generate_image")?.runtimeBinding)

    await materializedA.tools.get("generate_image")?.invoke({
      principalId: "principal",
      sessionId: "session",
      inputId: "input",
      turnId: "turn",
      attemptId: "attempt",
      toolCallId: "call",
      toolName: "generate_image",
      input: { prompt: "draw" },
      idempotencyKey: "tool:call",
      resources: unavailableToolResources
    })
    expect(observed).toEqual([[routeA]])
  })

  it("freezes capability routes inside the complete Turn binding", () => {
    const route = imageRoute("image-a")
    const registry = new ToolRegistry()
    registry.register(imageTool([]))
    const materialized = materializeToolRegistryForCapabilityRoutes({
      tools: registry,
      capabilityRoutes: [route]
    })
    const binding = createTurnExecutionBinding({
      modelEndpoint: conversationEndpoint(),
      createdAt: 10,
      agentContext: {
        tools: materialized.tools,
        capabilityRoutes: [route]
      }
    })

    expect(binding.capabilityRoutes).toEqual([route])
    expect(() => assertTurnExecutionBindingValid(binding)).not.toThrow()
    expect(() => assertTurnExecutionBindingValid({
      ...binding,
      capabilityRoutes: [imageRoute("image-b")]
    })).toThrow("turn execution binding digest is invalid")
  })

  it("freezes a bounded completion request inside the Turn digest", () => {
    const endpoint = conversationEndpoint()
    const boundedEndpoint: ModelEndpoint = {
      ...endpoint,
      model: {
        ...endpoint.model,
        limits: {
          contextWindowTokens: 8_000,
          maxInputTokens: 7_000,
          maxOutputTokens: 1_000
        }
      }
    }
    const derived = createTurnExecutionBinding({
      modelEndpoint: boundedEndpoint,
      createdAt: 10
    })
    expect(derived.completion).toEqual({ maxOutputTokens: 1_000 })
    expect(() => assertTurnExecutionBindingValid({
      ...derived,
      completion: { maxOutputTokens: 999 }
    })).toThrow("turn execution binding digest is invalid")

    expect(createTurnExecutionBinding({
      modelEndpoint: boundedEndpoint,
      maxOutputTokens: 700,
      createdAt: 10
    }).completion).toEqual({ maxOutputTokens: 700 })
    expect(() => createTurnExecutionBinding({
      modelEndpoint: boundedEndpoint,
      maxOutputTokens: 1_001,
      createdAt: 10
    })).toThrow("exceeds the model output limit")
  })
})

function imageTool(
  observed: ModelCapabilityRouteExecutionBinding[][]
): ToolDefinition {
  return {
    name: "generate_image",
    description: "Generate an image through a routed model capability.",
    inputSchema: {
      type: "object",
      properties: { prompt: { type: "string" } },
      required: ["prompt"],
      additionalProperties: false
    },
    risk: "external",
    idempotent: false,
    concurrency: "exclusive",
    resultMode: "immediate",
    requiredCapabilities: [imageRequirement],
    runtimeBinding: createToolRuntimeBinding({
      implementationId: "wanex.test.generate-image",
      implementationRevision: "1"
    }),
    async invoke(invocation) {
      observed.push([...(invocation.capabilityRoutes ?? [])])
      return {
        outcome: "succeeded",
        toolCallId: invocation.toolCallId,
        content: jsonToolResultContent({
          endpointId:
            invocation.capabilityRoutes?.[0]?.modelEndpoint.endpointId ?? null
        })
      }
    }
  }
}

function imageRoute(endpointId: string): ModelCapabilityRouteExecutionBinding {
  return createModelCapabilityRouteExecutionBinding({
    requirement: imageRequirement,
    source: "configured",
    modelEndpoint: imageEndpoint(endpointId)
  })
}

function imageEndpoint(id: string): ModelEndpoint {
  return {
    id,
    connection: { id: `connection-${id}`, providerId: `provider-${id}` },
    protocol: { id: "fixture-image" },
    model: {
      id: `model-${id}`,
      operations: ["image.generate"],
      inputModalities: ["text"],
      outputModalities: ["image"],
      features: [],
      catalog: {
        source: "custom",
        catalogId: `fixture.${id}`,
        revision: "1"
      }
    }
  }
}

function conversationEndpoint(): ModelEndpoint {
  return {
    id: "conversation",
    connection: { id: "conversation", providerId: "fake" },
    protocol: { id: "fake" },
    model: {
      id: "conversation-model",
      operations: ["conversation"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: [],
      catalog: {
        source: "builtin",
        catalogId: "wanex.test.conversation",
        revision: "1"
      }
    }
  }
}
