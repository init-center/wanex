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

export type ProviderProfileKind =
  | "fake"
  | "openai-compatible"
  | "anthropic"
  | "deepseek"

export type ProviderInputModality =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"

export type ProviderOutputModality =
  | "text"
  | "image"
  | "audio"
  | "video"

export interface ProviderCapabilities {
  readonly input: readonly ProviderInputModality[]
  readonly output: readonly ProviderOutputModality[]
}

export interface ProviderProfile {
  readonly id: string
  readonly kind: ProviderProfileKind
  readonly providerId: string
  readonly modelId: string
  readonly capabilities: ProviderCapabilities
  readonly baseUrl?: string
  readonly secretRef?: string
  readonly anthropicVersion?: string
}
