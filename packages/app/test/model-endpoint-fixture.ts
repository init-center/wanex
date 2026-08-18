import type {
  ModelBehavior,
  ModelInputModality,
  ModelEndpoint
} from "@wanex/protocol"

export function appTestModelEndpoint(options: {
  readonly endpointId?: string
  readonly protocolId?: string
  readonly providerId?: string
  readonly modelId?: string
  readonly inputModalities?: readonly ModelInputModality[]
  readonly baseUrl?: string
  readonly secretRef?: string
  readonly behavior?: ModelBehavior
} = {}): ModelEndpoint {
  const endpointId = options.endpointId ?? "wanex-app-fake"
  const providerId = options.providerId ?? "fake"
  const modelId = options.modelId ?? "wanex-app-model"
  return {
    id: endpointId,
    connection: {
      id: `connection_${endpointId}`,
      providerId,
      ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
      ...(options.secretRef === undefined ? {} : { secretRef: options.secretRef })
    },
    protocol: { id: options.protocolId ?? "fake" },
    model: {
      id: modelId,
      operations: ["conversation"],
      inputModalities: options.inputModalities ?? ["text"],
      outputModalities: ["text"],
      features: ["tool_calling", "parallel_tool_calls", "reasoning"],
      ...(options.behavior === undefined ? {} : { behavior: options.behavior }),
      catalog: {
        source: "custom",
        catalogId: `test.${modelId}`,
        revision: "1"
      }
    }
  }
}
