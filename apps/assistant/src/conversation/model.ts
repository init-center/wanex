import type {
  BackendConversationOperationReference,
  BackendConversationOperationState,
} from "@wanex/assistant/backend";
import type {
  JsonValue,
  ModelCapabilityRequirement,
  ModelOperation,
  ResourceKind,
  ToolActivityPresentation,
  ToolResultContentPart,
} from "@wanex/protocol";

export interface TrustedConversationSubmissionIdentity {
  readonly idempotencyKeyDigest: string
  readonly requestFingerprint: string
}

export interface TrustedConversationOperationReference
  extends BackendConversationOperationReference {
  /** Trusted-only transport-retry evidence; never project it to a renderer. */
  readonly submission?: TrustedConversationSubmissionIdentity
}

export interface SubmitConversationOperationRequest {
  readonly text: string;
  readonly sessionId?: string;
  readonly principalId?: string;
  readonly idempotencyKey?: string;
}

export interface QueueGuidedFollowUpRequest {
  readonly operationId: string;
  readonly text: string;
  readonly sessionId?: string;
}

export interface SteerTrackedConversationOperationRequest {
  readonly operationId: string;
  readonly text: string;
  readonly sessionId?: string;
  readonly requestId: string;
  readonly idempotencyKey?: string;
}

/**
 * Renderer-facing canonical history deliberately excludes App execution
 * provenance. Workbench and diagnostics own the trusted execution read model.
 */
export interface ConversationHistoryReadModel {
  readonly sessionId: string;
  readonly rows: readonly ConversationHistoryRow[];
  readonly page: ConversationHistoryPage;
}

export interface ConversationHistoryPage {
  readonly limit: number;
  readonly hasMore: boolean;
  readonly nextCursor?: string;
  readonly liveRowsTruncated: boolean;
}

export interface ConversationHistoryRow {
  readonly id: string;
  readonly kind: "input" | "message";
  readonly role: "user" | "assistant" | "tool" | "system";
  readonly status: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly parts: readonly ConversationPresentationPart[];
  readonly capabilityRequests: readonly CapabilityRequestInteraction[];
}

export type ConversationPresentationPart =
  | ConversationTextPart
  | ConversationReasoningPart
  | ConversationToolPart
  | ConversationResourcePart;

export interface ConversationPresentationPartBase {
  readonly key: string;
  readonly type: string;
}

export interface ConversationTextPart extends ConversationPresentationPartBase {
  readonly type: "text";
  readonly text: string;
}

export interface ConversationReasoningPart extends ConversationPresentationPartBase {
  readonly type: "reasoning";
  readonly text: string;
}

export interface ConversationToolPart extends ConversationPresentationPartBase {
  readonly type: "tool";
  readonly name: string;
  readonly state: ConversationToolState;
  readonly presentation?: ToolActivityPresentation;
}

export type ConversationToolState =
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "needs_attention";

export interface ConversationResourcePart extends ConversationPresentationPartBase {
  readonly type: "resource";
  readonly resourceId: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly kind: ResourceKind;
  readonly mediaType?: string;
}

export interface CapabilityRequestInteraction {
  readonly kind: "assistant.capability-request";
  readonly operation: Exclude<ModelOperation, "conversation">;
  readonly requirements: readonly CapabilityRequirement[];
  readonly setupRequired: boolean;
}

export interface CapabilityRequirement {
  readonly requirement: ModelCapabilityRequirement;
  readonly status:
    | "ready"
    | "unconfigured"
    | "selection_required"
    | "configured_endpoint_missing"
    | "configured_endpoint_ineligible"
    | "configured_endpoint_unavailable"
    | "executor_unavailable";
  readonly reason: string;
}

export interface ReadTrackedConversationOperationRequest {
  readonly sessionId?: string;
}

export interface CancelTrackedConversationOperationRequest {
  readonly sessionId?: string;
  readonly reason: string;
}

export interface RegenerateTrackedConversationOperationRequest {
  readonly sessionId?: string;
  readonly principalId?: string;
}

export interface ContinueCapabilityRequestRequest {
  readonly operationId: string;
  readonly operation: Exclude<ModelOperation, "conversation">;
  readonly sessionId?: string;
  readonly principalId?: string;
}

export type ConversationRecoveryDecision =
  | "confirm_succeeded"
  | "confirm_failed"
  | "retry"
  | "abandon_turn";

export type ConversationApprovalDecision = "approve_once" | "deny";

export interface ResolveTrackedConversationApprovalRequest {
  readonly sessionId?: string;
  readonly approvalId: string;
  readonly expectedApprovalRevision: number;
  readonly decision: ConversationApprovalDecision;
  readonly reason: string;
  readonly idempotencyKey?: string;
}

export interface ResolveTrackedConversationRecoveryRequest {
  readonly sessionId?: string;
  readonly recoveryId: string;
  readonly expectedRecoveryRevision: number;
  readonly decision: ConversationRecoveryDecision;
  readonly reason: string;
  readonly content?: readonly ToolResultContentPart[];
  readonly error?: JsonValue;
  readonly idempotencyKey?: string;
}

export type SubmitConversationOperationResult =
  | ConversationOperationFoundResult
  | ConversationOperationRejectedResult;

export type QueueGuidedFollowUpResult =
  | ConversationOperationFoundResult
  | ConversationOperationRejectedResult;

export type SteerTrackedConversationOperationResult =
  | ConversationOperationFoundResult
  | ConversationOperationRejectedResult;

export type ReadTrackedConversationOperationResult =
  | ConversationOperationFoundResult
  | ConversationOperationUntrackedResult
  | ConversationOperationMissingResult;

export type RegenerateTrackedConversationOperationResult =
  SubmitConversationOperationResult;

export type ContinueCapabilityRequestResult =
  SubmitConversationOperationResult;

export type ResolveTrackedConversationRecoveryResult =
  | ConversationRecoveryResolvedResult
  | ConversationOperationRejectedResult;

export type ResolveTrackedConversationApprovalResult =
  | ConversationApprovalResolvedResult
  | ConversationOperationRejectedResult;

export interface ConversationApprovalResolvedResult {
  readonly kind: "assistant.conversation-approval.resolved";
  readonly decision: ConversationApprovalDecision;
  readonly action: "turn_requeued";
  readonly operation: ReadTrackedConversationOperationResult;
}

export interface ConversationRecoveryResolvedResult {
  readonly kind: "assistant.conversation-recovery.resolved";
  readonly decision: ConversationRecoveryDecision;
  readonly action:
    | "waiting_for_other_recovery"
    | "turn_requeued"
    | "turn_abandoned";
  readonly operation: ReadTrackedConversationOperationResult;
}

export interface CancelTrackedConversationOperationResult {
  readonly kind: "assistant.conversation-operation.cancel";
  readonly status:
    | "cancelled"
    | "cancel_requested"
    | "already_terminal"
    | "missing"
    | "untracked";
  readonly operation: ReadTrackedConversationOperationResult;
}

export interface ConversationOperationFoundResult {
  readonly kind: "assistant.conversation-operation.found";
  readonly operation: ConversationOperationReadModel;
  readonly pendingFollowUp?: PendingGuidedFollowUpReadModel;
}

export interface PendingGuidedFollowUpReadModel {
  readonly kind: "assistant.conversation-guided-follow-up.pending";
  readonly operationId: string;
  readonly sessionId: string;
  readonly state: BackendConversationOperationState;
  readonly text: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ConversationOperationUntrackedResult {
  readonly kind: "assistant.conversation-operation.untracked";
  readonly sessionId?: string;
  readonly message: string;
}

export interface ConversationOperationMissingResult {
  readonly kind: "assistant.conversation-operation.missing";
  readonly sessionId: string;
  readonly operationId: string;
  readonly message: string;
}

export interface ConversationOperationRejectedResult {
  readonly kind: "assistant.conversation-operation.rejected";
  readonly reason:
    | "provider_not_ready"
    | "idempotency_conflict"
    | "operation_active"
    | "operation_identity_mismatch"
    | "operation_not_terminal"
    | "operation_not_found"
    | "guided_follow_up_pending"
    | "guided_follow_up_not_available"
    | "steering_pending"
    | "steering_not_available"
    | "source_input_missing"
    | "capability_request_not_found"
    | "capability_not_ready"
    | "unsupported_attachment"
    | "no_session"
    | "recovery_not_found"
    | "recovery_revision_stale"
    | "recovery_action_unavailable"
    | "invalid_recovery_payload"
    | "approval_not_found"
    | "approval_revision_stale"
    | "approval_action_unavailable"
    | "invalid_approval_payload";
  readonly message: string;
  readonly sessionId?: string;
  readonly operation?: ConversationOperationReadModel;
}

export interface ConversationOperationReadModel {
  readonly kind: "assistant.conversation-operation";
  readonly operationId: string;
  readonly sessionId: string;
  readonly state: BackendConversationOperationState;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly finishedAt?: number;
  readonly transcript: ConversationOperationTranscript;
  readonly result?: ConversationOperationResult;
  readonly error?: ConversationOperationError;
  readonly capabilities: ConversationOperationCapabilities;
  readonly approvals?: ConversationApprovalReview;
  readonly recovery?: ConversationRecoveryReview;
  readonly steering?: ConversationSteeringReview;
}

export interface ConversationSteeringReview {
  readonly pending: readonly ConversationPendingSteer[];
  readonly truncated: boolean;
}

export interface ConversationPendingSteer {
  readonly steeringId: string;
  readonly text: string;
  readonly textTruncated: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ConversationApprovalReview {
  readonly items: readonly ConversationApprovalItem[];
  readonly truncated: boolean;
}

export interface ConversationApprovalItem {
  readonly approvalId: string;
  readonly approvalRevision: number;
  readonly tool: ConversationApprovalTool;
  readonly presentation: ConversationApprovalPresentation;
  readonly attemptCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly availableDecisions: readonly ConversationApprovalDecision[];
}

export interface ConversationApprovalTool {
  readonly name: string;
  readonly title: string;
  readonly risk: "read_only" | "mutating" | "external";
  readonly idempotent: boolean;
}

export interface ConversationApprovalPresentation {
  readonly summary: string;
  readonly summaryTruncated: boolean;
  readonly details: readonly ConversationApprovalPresentationDetail[];
  readonly detailsTruncated: boolean;
}

export interface ConversationApprovalPresentationDetail {
  readonly label: string;
  readonly labelTruncated: boolean;
  readonly value: string;
  readonly valueTruncated: boolean;
}

export interface ConversationOperationTranscript {
  readonly rows: readonly ConversationOperationTranscriptRow[];
  readonly totalRows: number;
  readonly truncated: boolean;
}

export interface ConversationOperationTranscriptRow {
  readonly key: string;
  readonly kind: "input" | "message";
  readonly role: "user" | "assistant" | "tool" | "system";
  readonly status: string;
  readonly parts: readonly ConversationPresentationPart[];
  readonly capabilityRequests: readonly CapabilityRequestInteraction[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ConversationOperationResult {
  readonly assistantText: string;
  readonly assistantTextTruncated: boolean;
  readonly messageCount: number;
}

export type ConversationOperationError =
  | ConversationOperationRuntimeError
  | ConversationOperationCapacityError;

export interface ConversationOperationRuntimeError {
  readonly code:
    | "conversation_operation_failed"
    | "conversation_operation_recovery_required";
  readonly category: "runtime";
  readonly message: string;
}

export interface ConversationOperationCapacityError {
  readonly code: "conversation_context_capacity_exceeded";
  readonly category: "capacity";
  readonly message: string;
  readonly modelEndpointId: string;
  readonly capacity: ConversationOperationCapacityEvidence;
}

export interface ConversationOperationCapacityEvidence {
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

export interface ConversationOperationCapabilities {
  readonly cancellable: boolean;
  readonly regeneratable: boolean;
  readonly steerable: boolean;
  readonly terminal: boolean;
}

export interface ConversationRecoveryReview {
  readonly items: readonly ConversationRecoveryItem[];
  readonly truncated: boolean;
}

export interface ConversationRecoveryItem {
  readonly recoveryId: string;
  readonly recoveryRevision: number;
  readonly tool: ConversationRecoveryTool;
  readonly evidence: ConversationRecoveryEvidence;
  readonly attemptCount: number;
  readonly attempts: readonly ConversationRecoveryAttempt[];
  readonly attemptsTruncated: boolean;
  readonly availableDecisions: readonly ConversationRecoveryDecision[];
}

export interface ConversationRecoveryTool {
  readonly name: string;
  readonly title: string;
  readonly risk: "read_only" | "mutating" | "external";
  readonly idempotent: boolean;
}

export interface ConversationRecoveryEvidence {
  readonly message: string;
  readonly messageTruncated: boolean;
  readonly reconciliationRef?: string;
}

export interface ConversationRecoveryAttempt {
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

export interface ConversationEvents {
  subscribeConversationEvents(
    listener: ConversationEventListener,
  ): ConversationEventUnsubscribe;
}

export type ConversationEventListener = (
  event: ConversationEvent,
) => void;

export type ConversationEventUnsubscribe = () => void;

export interface ConversationAssistantTextDeltaEvent {
  readonly kind: "assistant.conversation.assistant-text-delta";
  readonly sequence: number;
  readonly at: number;
  readonly operationId: string;
  readonly sessionId: string;
  readonly partId: string;
  readonly text: string;
  readonly truncated: boolean;
}

export interface ConversationOperationInvalidatedEvent {
  readonly kind: "assistant.conversation.operation-invalidated";
  readonly sequence: number;
  readonly at: number;
  readonly operationId: string;
  readonly sessionId: string;
  readonly cause:
    | "execution_settled"
    | "execution_suspended";
}

export type ConversationEvent =
  | ConversationAssistantTextDeltaEvent
  | ConversationOperationInvalidatedEvent;
