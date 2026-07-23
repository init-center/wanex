import type {
  WanexApp,
  WanexAppCancelConversationOperationReceipt,
  WanexAppCancelConversationOperationRequest,
  WanexAppConversationOperationReadResult,
  WanexAppConversationOperationReference,
  WanexAppConversationOperationReceipt,
  WanexAppConversationOperationState,
  WanexAppEvents,
  WanexAppReadConversationOperationRequest,
  WanexAppSubmitConversationOperationRequest
} from "@wanex/app"

export type ProductAppBackendConversationCommands = Pick<
  WanexApp["commands"],
  | "submitConversationOperation"
  | "readConversationOperation"
  | "cancelConversationOperation"
>

export type ProductAppBackendSubmitConversationOperationRequest =
  WanexAppSubmitConversationOperationRequest
export type ProductAppBackendConversationOperationReceipt =
  WanexAppConversationOperationReceipt
export type ProductAppBackendConversationOperationReference =
  WanexAppConversationOperationReference
export type ProductAppBackendConversationOperationState =
  WanexAppConversationOperationState
export type ProductAppBackendReadConversationOperationRequest =
  WanexAppReadConversationOperationRequest
export type ProductAppBackendConversationOperationReadResult =
  WanexAppConversationOperationReadResult
export type ProductAppBackendCancelConversationOperationRequest =
  WanexAppCancelConversationOperationRequest
export type ProductAppBackendCancelConversationOperationReceipt =
  WanexAppCancelConversationOperationReceipt
export type ProductAppBackendEvents = WanexAppEvents
