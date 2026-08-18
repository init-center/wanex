import type {
  JsonValue,
  MessagePart,
  RunControlPolicy,
  SessionId,
  SessionInputIntent,
  SessionInputOrigin,
  ToolResultContentPart,
  UserMessageInputPart,
} from "@wanex/protocol";
import type { WanexAppSessionTranscriptPart } from "./types-read-model.js";

export interface WanexAppConversationOperationCommands {
  submitConversationOperation(
    request: WanexAppSubmitConversationOperationRequest,
  ): Promise<WanexAppConversationOperationReceipt>;
  readConversationOperation(
    request: WanexAppReadConversationOperationRequest,
  ): Promise<WanexAppConversationOperationReadResult>;
  cancelConversationOperation(
    request: WanexAppCancelConversationOperationRequest,
  ): Promise<WanexAppCancelConversationOperationReceipt>;
  interruptConversationOperation(
    request: WanexAppInterruptConversationOperationRequest,
  ): Promise<WanexAppInterruptConversationOperationReceipt>;
  steerConversationOperation(
    request: WanexAppSteerConversationOperationRequest,
  ): Promise<WanexAppSteerConversationOperationReceipt>;
  resolveConversationOperationRecovery(
    request: WanexAppResolveConversationOperationRecoveryRequest,
  ): Promise<WanexAppResolveConversationOperationRecoveryReceipt>;
  listConversationOperationApprovals(
    request: WanexAppListConversationOperationApprovalsRequest,
  ): Promise<WanexAppConversationOperationApprovalListResult>;
  readConversationOperationApproval(
    request: WanexAppReadConversationOperationApprovalRequest,
  ): Promise<WanexAppConversationOperationApprovalReadResult>;
  resolveConversationOperationApproval(
    request: WanexAppResolveConversationOperationApprovalRequest,
  ): Promise<WanexAppResolveConversationOperationApprovalReceipt>;
}

export interface WanexAppSubmitConversationOperationRequest {
  readonly content: readonly UserMessageInputPart[];
  readonly sessionId?: SessionId;
  readonly principalId?: string;
  readonly inputId?: string;
  readonly turnId?: string;
  readonly idempotencyKey?: string;
  readonly jobId?: string;
  readonly origin?: SessionInputOrigin;
  readonly intent?: SessionInputIntent;
  readonly runControlPolicy?: Extract<RunControlPolicy, "queue_after_current">;
  readonly expectedTurnId?: string;
  readonly regeneratesTurnId?: string;
}

export interface WanexAppConversationOperationReference {
  readonly sessionId: SessionId;
  readonly inputId: string;
  readonly turnId: string;
  readonly jobId: string;
}

export interface WanexAppConversationOperationReceipt extends WanexAppConversationOperationReference {
  readonly state: WanexAppConversationOperationState;
  readonly submittedAt: number;
}

export interface WanexAppReadConversationOperationRequest extends WanexAppConversationOperationReference {
  readonly transcriptLimit?: number;
}

export interface WanexAppCancelConversationOperationRequest extends WanexAppConversationOperationReference {
  readonly reason: string;
}

export interface WanexAppCancelConversationOperationReceipt extends WanexAppConversationOperationReference {
  readonly status:
    | "cancelled"
    | "cancel_requested"
    | "already_terminal"
    | "missing";
}

export interface WanexAppInterruptConversationOperationRequest extends WanexAppConversationOperationReference {
  readonly attemptId: string;
  readonly reason: string;
  readonly principalId?: string;
  readonly idempotencyKey?: string;
  readonly origin?: SessionInputOrigin;
}

export interface WanexAppInterruptConversationOperationReceipt extends WanexAppConversationOperationReference {
  readonly attemptId: string;
  readonly status: "interrupt_requested" | "not_running";
  readonly acceptedAt?: number;
}

export interface WanexAppSteerConversationOperationRequest extends WanexAppConversationOperationReference {
  readonly attemptId: string;
  readonly principalId: string;
  readonly idempotencyKey: string;
  readonly content: readonly MessagePart[];
  readonly origin?: SessionInputOrigin;
}

export interface WanexAppSteerConversationOperationReceipt extends WanexAppConversationOperationReference {
  readonly attemptId: string;
  readonly status: "accepted";
  readonly acceptedAt?: number;
}

export type WanexAppConversationOperationReadResult =
  | WanexAppConversationOperationFoundResult
  | WanexAppConversationOperationMissingResult;

export interface WanexAppConversationOperationFoundResult {
  readonly kind: "found";
  readonly reference: WanexAppConversationOperationReference;
  readonly operation: WanexAppConversationOperationReadModel;
}

export interface WanexAppConversationOperationMissingResult {
  readonly kind: "missing";
  readonly reference: WanexAppConversationOperationReference;
}

export type WanexAppConversationOperationState =
  | "queued"
  | "running"
  | "waiting"
  | "cancel_requested"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "recovery_required";

export interface WanexAppConversationOperationReadModel extends WanexAppConversationOperationReference {
  readonly state: WanexAppConversationOperationState;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly finishedAt?: number;
  readonly activeAttemptId?: string;
  readonly transcript: WanexAppConversationOperationTranscript;
  readonly result?: WanexAppConversationOperationResult;
  readonly error?: WanexAppConversationOperationError;
  readonly recovery?: WanexAppConversationOperationRecoveryReview;
  readonly approvals?: WanexAppConversationOperationApprovalReview;
  readonly steering?: WanexAppConversationOperationSteeringReview;
}

export interface WanexAppConversationOperationSteeringReview {
  readonly pending: readonly WanexAppConversationOperationPendingSteer[];
  readonly truncated: boolean;
}

export interface WanexAppConversationOperationPendingSteer {
  readonly controlId: string;
  readonly attemptId: string;
  readonly idempotencyKey: string;
  readonly content: readonly MessagePart[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type WanexAppConversationOperationApprovalDecision =
  | "approve_once"
  | "deny";

export interface WanexAppConversationOperationApprovalReview {
  readonly items: readonly WanexAppConversationOperationApprovalItem[];
  readonly truncated: boolean;
}

export interface WanexAppConversationOperationApprovalItem {
  /** Trusted App-host identity. Product renderers must receive an opaque projection. */
  readonly executionId: string;
  readonly approvalRevision: number;
  readonly tool: WanexAppConversationOperationApprovalTool;
  readonly presentation: WanexAppConversationOperationApprovalPresentation;
  readonly attemptCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly availableDecisions: readonly WanexAppConversationOperationApprovalDecision[];
}

export interface WanexAppConversationOperationApprovalTool {
  readonly name: string;
  readonly title: string;
  readonly risk: "read_only" | "mutating" | "external";
  readonly idempotent: boolean;
}

export interface WanexAppConversationOperationApprovalPresentation {
  readonly summary: string;
  readonly summaryTruncated: boolean;
  readonly details: readonly WanexAppConversationOperationApprovalPresentationDetail[];
  readonly detailsTruncated: boolean;
}

export interface WanexAppConversationOperationApprovalPresentationDetail {
  readonly label: string;
  readonly labelTruncated: boolean;
  readonly value: string;
  readonly valueTruncated: boolean;
}

export interface WanexAppListConversationOperationApprovalsRequest
  extends WanexAppConversationOperationReference {}

export type WanexAppConversationOperationApprovalListResult =
  | {
      readonly kind: "found";
      readonly reference: WanexAppConversationOperationReference;
      readonly approvals: WanexAppConversationOperationApprovalReview;
    }
  | WanexAppConversationOperationMissingResult;

export interface WanexAppReadConversationOperationApprovalRequest
  extends WanexAppConversationOperationReference {
  readonly executionId: string;
}

export type WanexAppConversationOperationApprovalReadResult =
  | {
      readonly kind: "found";
      readonly reference: WanexAppConversationOperationReference;
      readonly approval: WanexAppConversationOperationApprovalItem;
    }
  | {
      readonly kind: "missing";
      readonly reference: WanexAppConversationOperationReference;
      readonly executionId: string;
    };

export interface WanexAppResolveConversationOperationApprovalRequest
  extends WanexAppConversationOperationReference {
  readonly executionId: string;
  readonly expectedApprovalRevision: number;
  readonly decision: WanexAppConversationOperationApprovalDecision;
  readonly reason: string;
  readonly idempotencyKey?: string;
}

export interface WanexAppResolveConversationOperationApprovalReceipt
  extends WanexAppConversationOperationReference {
  readonly executionId: string;
  readonly decision: WanexAppConversationOperationApprovalDecision;
  readonly action: "turn_requeued";
  readonly approvalRevision: number;
  readonly createdAt: number;
}

export type WanexAppConversationOperationRecoveryDecision =
  | "confirm_succeeded"
  | "confirm_failed"
  | "retry"
  | "abandon_turn";

export interface WanexAppConversationOperationRecoveryReview {
  readonly items: readonly WanexAppConversationOperationRecoveryItem[];
  readonly truncated: boolean;
}

export interface WanexAppConversationOperationRecoveryItem {
  /** Trusted App-host identity. Product renderers must receive an opaque projection. */
  readonly executionId: string;
  readonly recoveryRevision: number;
  readonly tool: WanexAppConversationOperationRecoveryTool;
  readonly evidence: WanexAppConversationOperationRecoveryEvidence;
  readonly attemptCount: number;
  readonly attempts: readonly WanexAppConversationOperationRecoveryAttempt[];
  readonly attemptsTruncated: boolean;
  readonly availableDecisions: readonly WanexAppConversationOperationRecoveryDecision[];
}

export interface WanexAppConversationOperationRecoveryTool {
  readonly name: string;
  readonly title: string;
  readonly risk: "read_only" | "mutating" | "external";
  readonly idempotent: boolean;
}

export interface WanexAppConversationOperationRecoveryEvidence {
  readonly message: string;
  readonly messageTruncated: boolean;
  readonly reconciliationRef?: string;
}

export interface WanexAppConversationOperationRecoveryAttempt {
  readonly attemptNumber: number;
  readonly state:
    | "running"
    | "suspended"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "interrupted"
    | "recovery_required";
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly finishedAt?: number;
}

export interface WanexAppResolveConversationOperationRecoveryRequest extends WanexAppConversationOperationReference {
  readonly executionId: string;
  readonly expectedRecoveryRevision: number;
  readonly decision: WanexAppConversationOperationRecoveryDecision;
  readonly reason: string;
  readonly idempotencyKey?: string;
  readonly content?: readonly ToolResultContentPart[];
  readonly error?: JsonValue;
}

export interface WanexAppResolveConversationOperationRecoveryReceipt extends WanexAppConversationOperationReference {
  readonly decision: WanexAppConversationOperationRecoveryDecision;
  readonly action:
    | "waiting_for_other_recovery"
    | "turn_requeued"
    | "turn_abandoned";
  readonly recoveryRevision: number;
  readonly createdAt: number;
}

export interface WanexAppConversationOperationTranscript {
  readonly rows: readonly WanexAppConversationOperationTranscriptRow[];
  readonly totalRows: number;
  readonly truncated: boolean;
}

export interface WanexAppConversationOperationTranscriptRow {
  readonly id: string;
  readonly kind: "input" | "message";
  readonly role: "user" | "assistant" | "tool" | "system";
  readonly status: string;
  readonly text: string;
  readonly textTruncated: boolean;
  readonly parts: readonly WanexAppSessionTranscriptPart[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly inputId?: string;
  readonly turnId?: string;
  readonly regeneratesTurnId?: string;
  readonly attemptId?: string;
}

export interface WanexAppConversationOperationResult {
  readonly assistantText: string;
  readonly assistantTextTruncated: boolean;
  readonly messageCount: number;
}

export type WanexAppConversationOperationError =
  | WanexAppConversationOperationRuntimeError
  | WanexAppConversationOperationCapacityError;

export interface WanexAppConversationOperationRuntimeError {
  readonly code:
    | "conversation_operation_failed"
    | "conversation_operation_recovery_required";
  readonly category: "runtime";
  readonly message: string;
}

export interface WanexAppConversationOperationCapacityError {
  readonly code: "conversation_context_capacity_exceeded";
  readonly category: "capacity";
  readonly message: string;
  readonly modelEndpointId: string;
  readonly capacity: WanexAppConversationOperationCapacityEvidence;
}

export interface WanexAppConversationOperationCapacityEvidence {
  readonly reasons: readonly (
    | "input_tokens_exceeded"
    | "input_resources_exceeded"
  )[];
  readonly inputTokens: number;
  readonly inputTokenCeiling?: number;
  readonly inputResources: number;
  readonly maxInputResources?: number;
  readonly requestedOutputTokens: number;
  readonly compactionAttempted: boolean;
  readonly compactionReason?: string;
}
