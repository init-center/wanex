import type {
  ProductAppBackendConversationOperationReference,
  ProductAppBackendConversationOperationState
} from "@wanex/product-app/backend"

export interface ProductAppTrustedConversationOperationReference
  extends ProductAppBackendConversationOperationReference {}

export interface ProductAppSubmitConversationOperationRequest {
  readonly text: string
  readonly sessionId?: string
  readonly principalId?: string
}

export interface ProductAppReadTrackedConversationOperationRequest {
  readonly sessionId?: string
}

export interface ProductAppCancelTrackedConversationOperationRequest {
  readonly sessionId?: string
  readonly reason: string
}

export interface ProductAppRegenerateTrackedConversationOperationRequest {
  readonly sessionId?: string
  readonly principalId?: string
}

export type ProductAppSubmitConversationOperationResult =
  | ProductAppConversationOperationFoundResult
  | ProductAppConversationOperationRejectedResult

export type ProductAppReadTrackedConversationOperationResult =
  | ProductAppConversationOperationFoundResult
  | ProductAppConversationOperationUntrackedResult
  | ProductAppConversationOperationMissingResult

export type ProductAppRegenerateTrackedConversationOperationResult =
  ProductAppSubmitConversationOperationResult

export interface ProductAppCancelTrackedConversationOperationResult {
  readonly kind: "product-app.conversation-operation.cancel"
  readonly status:
    | "cancelled"
    | "cancel_requested"
    | "already_terminal"
    | "missing"
    | "untracked"
  readonly operation: ProductAppReadTrackedConversationOperationResult
}

export interface ProductAppConversationOperationFoundResult {
  readonly kind: "product-app.conversation-operation.found"
  readonly operation: ProductAppConversationOperationReadModel
}

export interface ProductAppConversationOperationUntrackedResult {
  readonly kind: "product-app.conversation-operation.untracked"
  readonly sessionId?: string
  readonly message: string
}

export interface ProductAppConversationOperationMissingResult {
  readonly kind: "product-app.conversation-operation.missing"
  readonly sessionId: string
  readonly operationId: string
  readonly message: string
}

export interface ProductAppConversationOperationRejectedResult {
  readonly kind: "product-app.conversation-operation.rejected"
  readonly reason:
    | "provider_not_ready"
    | "operation_active"
    | "operation_not_terminal"
    | "operation_not_found"
    | "source_input_missing"
    | "unsupported_attachment"
    | "no_session"
  readonly message: string
  readonly sessionId?: string
  readonly operation?: ProductAppConversationOperationReadModel
}

export interface ProductAppConversationOperationReadModel {
  readonly kind: "product-app.conversation-operation"
  readonly operationId: string
  readonly sessionId: string
  readonly state: ProductAppBackendConversationOperationState
  readonly createdAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
  readonly transcript: ProductAppConversationOperationTranscript
  readonly result?: ProductAppConversationOperationResult
  readonly error?: ProductAppConversationOperationError
  readonly capabilities: ProductAppConversationOperationCapabilities
}

export interface ProductAppConversationOperationTranscript {
  readonly rows: readonly ProductAppConversationOperationTranscriptRow[]
  readonly totalRows: number
  readonly truncated: boolean
}

export interface ProductAppConversationOperationTranscriptRow {
  readonly key: string
  readonly kind: "input" | "message"
  readonly role: "user" | "assistant" | "tool" | "system"
  readonly status: string
  readonly text: string
  readonly textTruncated: boolean
  readonly createdAt: number
  readonly updatedAt: number
}

export interface ProductAppConversationOperationResult {
  readonly assistantText: string
  readonly assistantTextTruncated: boolean
  readonly messageCount: number
}

export interface ProductAppConversationOperationError {
  readonly code:
    | "conversation_operation_failed"
    | "conversation_operation_recovery_required"
  readonly category: "runtime"
  readonly message: string
}

export interface ProductAppConversationOperationCapabilities {
  readonly cancellable: boolean
  readonly regeneratable: boolean
  readonly terminal: boolean
}

export interface ProductAppConversationEvents {
  subscribeConversationEvents(
    listener: ProductAppConversationEventListener
  ): ProductAppConversationEventUnsubscribe
}

export type ProductAppConversationEventListener = (
  event: ProductAppConversationAssistantTextDeltaEvent
) => void

export type ProductAppConversationEventUnsubscribe = () => void

export interface ProductAppConversationAssistantTextDeltaEvent {
  readonly kind: "product-app.conversation.assistant-text-delta"
  readonly sequence: number
  readonly at: number
  readonly operationId: string
  readonly sessionId: string
  readonly partId: string
  readonly text: string
  readonly truncated: boolean
}
