import type { WanexAppConversationOperationReference } from "./types-conversation-operation.js"

export interface WanexAppEvents {
  subscribeConversationEvents(
    listener: WanexAppConversationEventListener
  ): WanexAppConversationEventUnsubscribe
  subscribeGoalEvents(
    listener: WanexAppGoalEventListener
  ): WanexAppGoalEventUnsubscribe
}

export type WanexAppConversationEventListener = (
  event: WanexAppConversationEvent
) => void

export type WanexAppConversationEventUnsubscribe = () => void

export type WanexAppGoalEventListener = (event: WanexAppGoalEvent) => void

export type WanexAppGoalEventUnsubscribe = () => void

export type WanexAppGoalEventCause =
  | "created"
  | "paused"
  | "resumed"
  | "attempt_admitted"
  | "attempt_reviewed"
  | "cancel_requested"
  | "cancelled"
  | "recovery_parked"
  | "limit_reached"

export interface WanexAppGoalEvent {
  readonly kind: "wanex-app.goal.invalidated"
  readonly sequence: number
  readonly at: number
  readonly objectiveId: string
  readonly sessionId: string
  readonly cause: WanexAppGoalEventCause
}

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

export interface WanexAppConversationOperationInvalidatedEvent {
  readonly kind: "wanex-app.conversation.operation-invalidated"
  readonly sequence: number
  readonly at: number
  readonly reference: WanexAppConversationOperationReference
  readonly cause:
    | "execution_completed"
    | "execution_failed"
    | "execution_suspended"
}

export type WanexAppConversationEvent =
  | WanexAppConversationAssistantTextDeltaEvent
  | WanexAppConversationOperationInvalidatedEvent
