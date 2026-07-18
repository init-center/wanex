import type { JsonValue } from "./json.js"
import type { MessagePartId, ResourceId } from "./ids.js"
import type { ProviderState } from "./provider.js"
import type { UiSurfaceEnvelope } from "./ui-surface.js"

export type MessagePartVisibility =
  | "user"
  | "assistant"
  | "internal"
  | "provider_replay_only"

export type MessagePart =
  | TextMessagePart
  | ReasoningMessagePart
  | ToolCallMessagePart
  | ToolResultMessagePart
  | ResourceMessagePart
  | UiSurfaceMessagePart

export interface MessagePartBase {
  readonly id: MessagePartId
  readonly visibility?: MessagePartVisibility
  readonly providerMetadata?: Readonly<Record<string, JsonValue>>
}

export interface TextMessagePart extends MessagePartBase {
  readonly type: "text"
  readonly text: string
}

export interface ReasoningMessagePart extends MessagePartBase {
  readonly type: "reasoning"
  readonly text?: string
  readonly providerState?: ProviderState
}

export interface ToolCallMessagePart extends MessagePartBase {
  readonly type: "tool_call"
  readonly toolCallId: string
  readonly toolName: string
  readonly input: JsonValue
}

export interface ToolResultMessagePart extends MessagePartBase {
  readonly type: "tool_result"
  readonly toolCallId: string
  readonly result: JsonValue
  readonly isError: boolean
}

export interface ResourceMessagePart extends MessagePartBase {
  readonly type: "resource"
  readonly resourceId: ResourceId
  readonly mediaType?: string
}

export interface UiSurfaceMessagePart extends MessagePartBase {
  readonly type: "ui_surface"
  readonly surface: UiSurfaceEnvelope
}
