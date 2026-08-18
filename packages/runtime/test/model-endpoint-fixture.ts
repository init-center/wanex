import type {
  ModelBehavior,
  ModelDescriptor,
  ModelFeature,
  ModelInputModality,
  ModelLimits,
  ModelEndpoint,
  ModelOutputModality
} from "@wanex/protocol"

export interface TestConversationModelOptions {
  readonly inputModalities?: readonly ModelInputModality[]
  readonly outputModalities?: readonly ModelOutputModality[]
  readonly features?: readonly ModelFeature[]
  readonly behavior?: ModelBehavior
  readonly limits?: ModelLimits
  readonly catalogSource?: "builtin" | "provider" | "custom"
}

export function testConversationModel(
  modelId: string,
  options: TestConversationModelOptions = {}
): ModelDescriptor {
  return {
    id: modelId,
    operations: ["conversation"],
    inputModalities: options.inputModalities ?? ["text"],
    outputModalities: options.outputModalities ?? ["text"],
    features: options.features ?? [
      "tool_calling",
      "parallel_tool_calls",
      "reasoning"
    ],
    ...(options.limits === undefined ? {} : { limits: options.limits }),
    ...(options.behavior === undefined ? {} : { behavior: options.behavior }),
    catalog: {
      source: options.catalogSource ?? "custom",
      catalogId: `test.${modelId}`,
      revision: "1"
    }
  }
}

export interface TestModelEndpointOptions extends TestConversationModelOptions {
  readonly endpointId: string
  readonly protocolId: string
  readonly providerId: string
  readonly modelId: string
  readonly connectionId?: string
  readonly baseUrl?: string
  readonly secretRef?: string
  readonly protocolVersion?: string
}

export function testModelEndpoint(
  options: TestModelEndpointOptions
): ModelEndpoint {
  return {
    id: options.endpointId,
    connection: {
      id: options.connectionId ?? `connection_${options.endpointId}`,
      providerId: options.providerId,
      ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
      ...(options.secretRef === undefined ? {} : { secretRef: options.secretRef })
    },
    protocol: {
      id: options.protocolId,
      ...(options.protocolVersion === undefined
        ? {}
        : { version: options.protocolVersion })
    },
    model: testConversationModel(options.modelId, options)
  }
}

export function fakeModelEndpoint(suffix: string): ModelEndpoint {
  return testModelEndpoint({
    endpointId: `endpoint_${suffix}`,
    protocolId: "fake",
    providerId: "fake",
    modelId: `model_${suffix}`,
    catalogSource: "builtin"
  })
}
