import type {
  JsonValue,
  MessagePart,
  ModelDescriptor,
  ModelOutputModality,
  ProviderProtocolDescriptor,
  ProviderState,
  ResourceMessagePart,
  RuntimeAbortSignal,
  ToolResultContentPart,
  ToolResultMessagePart,
  ToolResultResourceContentPart
} from "@wanex/protocol"

export interface ProviderAdapter {
  readonly protocol: ProviderProtocolDescriptor
  readonly outputModalities: readonly ModelOutputModality[]
  readonly providerId: string
  readonly model: ModelDescriptor
  stream(request: ProviderRequest): AsyncIterable<ProviderEvent>
  buildReplayMessages(
    messages: readonly PreparedProviderReplayMessage[]
  ): JsonValue[]
}

export interface ProviderRequest {
  readonly messages: readonly PreparedProviderReplayMessage[]
  readonly outputModalities?: readonly ModelOutputModality[]
  readonly signal?: RuntimeAbortSignal
  readonly maxOutputTokens?: number
  readonly tools?: readonly ProviderToolDefinition[]
  readonly toolChoice?: ProviderToolChoice
  readonly parallelToolCalls?: boolean
}

export interface ProviderToolDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: Readonly<Record<string, JsonValue>>
}

export type ProviderToolChoice =
  | "auto"
  | "none"
  | "required"
  | { readonly name: string }

export interface ProviderReplayMessage {
  readonly role: "user" | "assistant" | "tool" | "system"
  readonly content: readonly MessagePart[]
  readonly providerState?: readonly ProviderState[] | undefined
}

export interface PreparedProviderReplayMessage {
  readonly role: ProviderReplayMessage["role"]
  readonly content: readonly PreparedProviderReplayPart[]
  readonly providerState?: readonly ProviderState[] | undefined
}

export type PreparedProviderReplayPart =
  | Exclude<MessagePart, ResourceMessagePart | ToolResultMessagePart>
  | PreparedProviderResourcePart
  | PreparedProviderToolResultPart

export interface PreparedProviderResourcePart extends ResourceMessagePart {
  readonly bytes: Uint8Array
  readonly originalResource?: import("@wanex/protocol").ResourceInputEvidence
}

export interface PreparedProviderToolResultPart
  extends Omit<ToolResultMessagePart, "content"> {
  readonly content: readonly PreparedProviderToolResultContentPart[]
}

export type PreparedProviderToolResultContentPart =
  | Exclude<ToolResultContentPart, ToolResultResourceContentPart>
  | PreparedProviderToolResultResourcePart

export interface PreparedProviderToolResultResourcePart
  extends ToolResultResourceContentPart {
  readonly bytes?: Uint8Array
  readonly originalResource?: import("@wanex/protocol").ResourceInputEvidence
}

export type ProviderEvent =
  | ProviderTextDeltaEvent
  | ProviderImageOutputEvent
  | ProviderReasoningDeltaEvent
  | ProviderToolCallStartEvent
  | ProviderToolCallDeltaEvent
  | ProviderToolCallEndEvent
  | ProviderStateEvent
  | ProviderUsageEvent
  | ProviderFinishEvent
  | ProviderErrorEvent

/** Transient wire output, never a durable MessagePart or public observation. */
export interface ProviderImageOutputEvent {
  readonly type: "image_output"
  readonly partId: string
  readonly mimeType: string
  readonly bytes: Uint8Array
}

export type ProviderObservedEvent =
  | Exclude<ProviderEvent, ProviderImageOutputEvent | ProviderStateEvent>
  | {
      readonly type: "image_output"
      readonly partId: string
      readonly mimeType: string
      readonly sizeBytes: number
    }

export interface ProviderImageCandidate {
  readonly type: "image_candidate"
  readonly id: string
  readonly mimeType: string
  readonly bytes: Uint8Array
}

export interface ProviderResponseCandidate extends Omit<ProviderTurnResult, "parts"> {
  readonly parts: readonly (Exclude<ProviderOutputMessagePart, ResourceMessagePart> | ProviderImageCandidate)[]
}

export interface ProviderTextDeltaEvent {
  readonly type: "text_delta"
  readonly partId: string
  readonly delta: string
}

export interface ProviderReasoningDeltaEvent {
  readonly type: "reasoning_delta"
  readonly partId: string
  readonly delta: string
  readonly visibility?: "assistant" | "internal" | "provider_replay_only"
}

export interface ProviderToolCallStartEvent {
  readonly type: "tool_call_start"
  readonly index: number
  readonly toolCallId: string
}

export interface ProviderToolCallDeltaEvent {
  readonly type: "tool_call_delta"
  readonly toolCallId: string
  readonly toolNameDelta?: string
  readonly inputJsonDelta?: string
}

export interface ProviderToolCallEndEvent {
  readonly type: "tool_call_end"
  readonly toolCallId: string
}

export interface ProviderStateEvent {
  readonly type: "provider_state"
  readonly state: ProviderState
  readonly partId?: string
}

export interface ProviderUsageEvent {
  readonly type: "usage"
  readonly usage: ProviderUsage
}

export interface ProviderUsage {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly reasoningTokens?: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
  readonly metadata?: Readonly<Record<string, JsonValue>>
}

export interface ProviderFinishEvent {
  readonly type: "finish"
  readonly reason:
    | "stop"
    | "length"
    | "tool_calls"
    | "content_filter"
    | "other"
  readonly rawReason?: string
}

export interface ProviderErrorEvent {
  readonly type: "error"
  readonly error: ProviderError
}

export interface ProviderError {
  readonly category:
    | "authentication"
    | "authorization"
    | "rate_limit"
    | "invalid_request"
    | "not_found"
    | "conflict"
    | "server"
    | "network"
    | "timeout"
    | "aborted"
    | "protocol"
    | "unknown"
  readonly message: string
  readonly retryable: boolean
  readonly providerId: string
  readonly modelId: string
  readonly phase: "request" | "stream"
  readonly statusCode?: number
  readonly providerCode?: string
  readonly retryAfterMs?: number
  readonly metadata?: Readonly<Record<string, JsonValue>>
}

export interface ProviderTurnResult {
  readonly parts: readonly ProviderOutputMessagePart[]
  readonly providerState: readonly ProviderState[]
  readonly usage?: ProviderUsage
  readonly finish: ProviderFinishEvent
}

export type ProviderOutputMessagePart = Extract<
  MessagePart,
  { readonly type: "text" | "reasoning" | "tool_call" | "resource" }
>

export interface ProviderRunEvent {
  readonly sessionId: string
  readonly inputId: string
  readonly turnId: string
  readonly jobId: string
  readonly attemptId: string
  readonly providerId: string
  readonly modelId: string
  readonly event: ProviderObservedEvent
}

export type ProviderEventObserver = (event: ProviderRunEvent) => void
