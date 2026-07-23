import type {
  MessagePart,
  RunControlPolicy,
  SessionId,
  SessionInputIntent,
  SessionInputOrigin,
  UserMessageInputPart
} from "@wanex/protocol"
import type { WanexAppSessionTranscriptPart } from "./types-read-model.js"

export interface WanexAppConversationOperationCommands {
  submitConversationOperation(
    request: WanexAppSubmitConversationOperationRequest
  ): Promise<WanexAppConversationOperationReceipt>
  readConversationOperation(
    request: WanexAppReadConversationOperationRequest
  ): Promise<WanexAppConversationOperationReadResult>
  cancelConversationOperation(
    request: WanexAppCancelConversationOperationRequest
  ): Promise<WanexAppCancelConversationOperationReceipt>
  interruptConversationOperation(
    request: WanexAppInterruptConversationOperationRequest
  ): Promise<WanexAppInterruptConversationOperationReceipt>
  steerConversationOperation(
    request: WanexAppSteerConversationOperationRequest
  ): Promise<WanexAppSteerConversationOperationReceipt>
}

export interface WanexAppSubmitConversationOperationRequest {
  readonly content: readonly UserMessageInputPart[]
  readonly sessionId?: SessionId
  readonly principalId?: string
  readonly inputId?: string
  readonly idempotencyKey?: string
  readonly jobId?: string
  readonly origin?: SessionInputOrigin
  readonly intent?: SessionInputIntent
  readonly runControlPolicy?: Extract<RunControlPolicy, "queue_after_current">
  readonly expectedTurnId?: string
  readonly regeneratesTurnId?: string
}

export interface WanexAppConversationOperationReference {
  readonly sessionId: SessionId
  readonly inputId: string
  readonly turnId: string
  readonly jobId: string
}

export interface WanexAppConversationOperationReceipt
  extends WanexAppConversationOperationReference {
  readonly state: WanexAppConversationOperationState
  readonly submittedAt: number
}

export interface WanexAppReadConversationOperationRequest
  extends WanexAppConversationOperationReference {
  readonly transcriptLimit?: number
}

export interface WanexAppCancelConversationOperationRequest
  extends WanexAppConversationOperationReference {
  readonly reason: string
}

export interface WanexAppCancelConversationOperationReceipt
  extends WanexAppConversationOperationReference {
  readonly status:
    | "cancelled"
    | "cancel_requested"
    | "already_terminal"
    | "missing"
}

export interface WanexAppInterruptConversationOperationRequest
  extends WanexAppConversationOperationReference {
  readonly attemptId: string
  readonly reason: string
  readonly principalId?: string
  readonly idempotencyKey?: string
  readonly origin?: SessionInputOrigin
}

export interface WanexAppInterruptConversationOperationReceipt
  extends WanexAppConversationOperationReference {
  readonly attemptId: string
  readonly status: "interrupt_requested" | "not_running"
  readonly acceptedAt?: number
}

export interface WanexAppSteerConversationOperationRequest
  extends WanexAppConversationOperationReference {
  readonly attemptId: string
  readonly principalId: string
  readonly idempotencyKey: string
  readonly content: readonly MessagePart[]
  readonly origin?: SessionInputOrigin
}

export interface WanexAppSteerConversationOperationReceipt
  extends WanexAppConversationOperationReference {
  readonly attemptId: string
  readonly status: "accepted"
  readonly acceptedAt?: number
}

export type WanexAppConversationOperationReadResult =
  | WanexAppConversationOperationFoundResult
  | WanexAppConversationOperationMissingResult

export interface WanexAppConversationOperationFoundResult {
  readonly kind: "found"
  readonly reference: WanexAppConversationOperationReference
  readonly operation: WanexAppConversationOperationReadModel
}

export interface WanexAppConversationOperationMissingResult {
  readonly kind: "missing"
  readonly reference: WanexAppConversationOperationReference
}

export type WanexAppConversationOperationState =
  | "queued"
  | "running"
  | "cancel_requested"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "recovery_required"

export interface WanexAppConversationOperationReadModel
  extends WanexAppConversationOperationReference {
  readonly state: WanexAppConversationOperationState
  readonly createdAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
  readonly activeAttemptId?: string
  readonly transcript: WanexAppConversationOperationTranscript
  readonly result?: WanexAppConversationOperationResult
  readonly error?: WanexAppConversationOperationError
}

export interface WanexAppConversationOperationTranscript {
  readonly rows: readonly WanexAppConversationOperationTranscriptRow[]
  readonly totalRows: number
  readonly truncated: boolean
}

export interface WanexAppConversationOperationTranscriptRow {
  readonly id: string
  readonly kind: "input" | "message"
  readonly role: "user" | "assistant" | "tool" | "system"
  readonly status: string
  readonly text: string
  readonly textTruncated: boolean
  readonly parts: readonly WanexAppSessionTranscriptPart[]
  readonly createdAt: number
  readonly updatedAt: number
  readonly inputId?: string
  readonly turnId?: string
  readonly attemptId?: string
}

export interface WanexAppConversationOperationResult {
  readonly assistantText: string
  readonly assistantTextTruncated: boolean
  readonly messageCount: number
}

export interface WanexAppConversationOperationError {
  readonly code:
    | "conversation_operation_failed"
    | "conversation_operation_recovery_required"
  readonly category: "runtime"
  readonly message: string
}
