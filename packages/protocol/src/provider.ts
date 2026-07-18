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

export interface ProviderProfile {
  readonly id: string
  readonly kind: ProviderProfileKind
  readonly providerId: string
  readonly modelId: string
  readonly baseUrl?: string
  readonly apiKey?: string
  readonly anthropicVersion?: string
}
