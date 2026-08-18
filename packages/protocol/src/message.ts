import type { JsonValue } from "./json.js"
import type { MessagePartId } from "./ids.js"
import type { ProviderState } from "./provider.js"
import type { ResourceInputEvidence } from "./resource.js"

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

export type UserMessageInputPart =
  | UserTextMessageInputPart
  | UserResourceMessageInputPart

export interface UserTextMessageInputPart {
  readonly type: "text"
  readonly text: string
}

export interface UserResourceMessageInputPart {
  readonly type: "resource"
  readonly resourceId: ResourceInputEvidence["resourceId"]
}

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
  readonly content: readonly ToolResultContentPart[]
  readonly contentDigest: string
  readonly isError: boolean
}

export type ToolResultContentPart =
  | ToolResultTextContentPart
  | ToolResultJsonContentPart
  | ToolResultResourceContentPart

export interface ToolResultTextContentPart {
  readonly type: "text"
  readonly text: string
}

export interface ToolResultJsonContentPart {
  readonly type: "json"
  readonly value: JsonValue
}

export interface ToolResultResourceContentPart extends ResourceInputEvidence {
  readonly type: "resource"
}

export interface ResourceMessagePart
  extends MessagePartBase,
    ResourceInputEvidence {
  readonly type: "resource"
}
