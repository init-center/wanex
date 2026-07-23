import type { WanexAppConversationOperationReference } from "./types-conversation-operation.js"

export interface WanexAppEvents {
  subscribeConversationEvents(
    listener: WanexAppConversationEventListener
  ): WanexAppConversationEventUnsubscribe
}

export type WanexAppConversationEventListener = (
  event: WanexAppConversationEvent
) => void

export type WanexAppConversationEventUnsubscribe = () => void

export interface WanexAppConversationAssistantTextDeltaEvent {
  readonly kind: "wanex-app.conversation.assistant-text-delta"
  readonly sequence: number
  readonly at: number
  readonly reference: WanexAppConversationOperationReference
  readonly attemptId: string
  readonly partId: string
  readonly text: string
  readonly truncated: boolean
}

export type WanexAppConversationEvent =
  WanexAppConversationAssistantTextDeltaEvent
