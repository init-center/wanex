import type {
  ModelInputModality,
  ModelEndpoint
} from "@wanex/protocol"

export function productTestModelEndpoint(options: {
  readonly endpointId: string
  readonly modelId: string
  readonly protocolId?: string
  readonly providerId?: string
  readonly inputModalities?: readonly ModelInputModality[]
  readonly baseUrl?: string
  readonly secretRef?: string
}): ModelEndpoint {
  const protocolId = options.protocolId ?? "fake"
  const baseUrl = options.baseUrl ??
    (protocolId === "fake" ? undefined : "https://provider.example.test/v1")
  return {
    id: options.endpointId,
    connection: {
      id: `connection_${options.endpointId}`,
      providerId: options.providerId ?? "fake",
      ...(baseUrl === undefined ? {} : { baseUrl }),
      ...(options.secretRef === undefined ? {} : { secretRef: options.secretRef })
    },
    protocol: { id: protocolId },
    model: {
      id: options.modelId,
      operations: ["conversation"],
      inputModalities: options.inputModalities ?? ["text"],
      outputModalities: ["text"],
      features: ["tool_calling", "parallel_tool_calls", "reasoning"],
      catalog: {
        source: "custom",
        catalogId: `test.${options.modelId}`,
        revision: "1"
      }
    }
  }
}
