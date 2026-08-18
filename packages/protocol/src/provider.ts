import type { JsonValue } from "./json.js"

export interface ProviderState {
  readonly providerId: string
  readonly modelId: string
  readonly stateKind:
    | "reasoning"
    | "thinking"
    | "tool_replay"
    | "response_id"
    | "opaque"
  readonly replayPolicy: "required" | "optional" | "forbidden"
  readonly payload: JsonValue
}

export interface ProviderConnection {
  readonly id: string
  readonly providerId: string
  readonly baseUrl?: string
  readonly secretRef?: string
}

export interface ProviderProtocolDescriptor {
  readonly id: string
  readonly version?: string
}

export type ModelOperation =
  | "conversation"
  | "image.generate"
  | "image.edit"
  | "video.generate"
  | "audio.transcribe"
  | "audio.synthesize"

export type ModelInputModality =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"

export type ModelOutputModality = "text" | "image" | "audio" | "video"

export type ModelFeature =
  | "tool_calling"
  | "parallel_tool_calls"
  | "reasoning"

export interface ModelLimits {
  readonly contextWindowTokens?: number
  readonly maxInputTokens?: number
  readonly maxOutputTokens?: number
  readonly maxInputResources?: number
}

export interface ModelBehavior {
  readonly reasoningReplay?: "optional" | "required" | "forbidden"
}

export interface ModelCatalogProvenance {
  readonly source: "builtin" | "provider" | "custom"
  readonly catalogId: string
  readonly revision: string
}

export interface ModelDescriptor {
  readonly id: string
  readonly operations: readonly ModelOperation[]
  readonly inputModalities: readonly ModelInputModality[]
  readonly outputModalities: readonly ModelOutputModality[]
  readonly features: readonly ModelFeature[]
  readonly limits?: ModelLimits
  readonly behavior?: ModelBehavior
  readonly catalog: ModelCatalogProvenance
}

export interface ModelCapabilityRequirement {
  readonly operation: ModelOperation
  readonly inputModalities: readonly ModelInputModality[]
  readonly outputModalities: readonly ModelOutputModality[]
  readonly features: readonly ModelFeature[]
}

export interface ModelEndpoint {
  readonly id: string
  readonly connection: ProviderConnection
  readonly protocol: ProviderProtocolDescriptor
  readonly model: ModelDescriptor
}
