import type {
  JsonValue,
  SessionTurnState,
  MessagePartVisibility,
  ResourceKind,
  ToolExecutionAttemptState,
  ToolExecutionRecoveryDecision,
  ToolResultContentPart,
  UserMessageInputPart,
  WorkspaceChangeProposalState,
  WorkspaceChangeSetState,
  WorkspaceFileConflict,
} from "@wanex/protocol";
import type { CodingApplicationErrorCode } from "./errors.js";
export type { CodingApplicationErrorCode } from "./errors.js";

export type CodingApplicationState = "open" | "closing" | "closed";

export interface CodingApplication {
  readonly state: CodingApplicationState;
  listProjects(): Promise<readonly CodingProjectReadModel[]>;
  readProject(
    request: ReadCodingProjectRequest,
  ): Promise<CodingProjectReadModel | null>;
  closeProject(request: CloseCodingProjectRequest): Promise<void>;
  listSessions(request: ListCodingSessionsRequest): Promise<CodingSessionPage>;
  readSession(
    request: ReadCodingSessionRequest,
  ): Promise<CodingSessionReadModel | null>;
  readTranscript(
    request: ReadCodingTranscriptRequest,
  ): Promise<CodingTranscriptPage | null>;
  listTurns(request: ListCodingTurnsRequest): Promise<CodingTurnPage>;
  startTurn(request: StartCodingTurnCommand): Promise<CodingTurnReadModel>;
  readTurn(request: ReadCodingTurnRequest): Promise<CodingTurnReadModel | null>;
  readLiveTurn(
    request: ReadCodingTurnRequest,
  ): Promise<CodingLiveTurnReadModel | null>;
  cancelTurn(request: CancelCodingTurnRequest): Promise<CodingTurnReadModel>;
  resolveTurnRecovery(
    request: ResolveCodingTurnRecoveryRequest,
  ): Promise<CodingTurnReadModel>;
  resolveTurnApproval(
    request: ResolveCodingTurnApprovalRequest,
  ): Promise<CodingTurnReadModel>;
  readProposal(
    request: ReadCodingProposalRequest,
  ): Promise<CodingProposalReadModel | null>;
  decideProposal(
    request: CodingProposalDecisionRequest,
  ): Promise<CodingProposalActionResult>;
  requestProposalApply(
    request: RequestCodingProposalApplyRequest,
  ): Promise<CodingProposalActionResult>;
  applyProposal(
    request: ApplyCodingProposalRequest,
  ): Promise<CodingProposalApplyResult>;
  undoProposal(
    request: UndoCodingProposalRequest,
  ): Promise<CodingProposalUndoResult>;
  readEvents(
    request?: ListCodingEventsRequest,
  ): Promise<CodingApplicationEventPage>;
  subscribe(listener: CodingApplicationEventListener): () => void;
}

export interface CodingProjectReadModel {
  readonly projectId: string;
  readonly name: string;
  readonly state: "ready" | "attention";
  readonly openedAt: number;
  readonly recovery: CodingProjectRecoveryReadModel;
}

export interface CodingProjectRecoveryReadModel {
  readonly transactionAttention: boolean;
  readonly taskAttentionCount: number;
  readonly taskFailureCount: number;
  readonly moreTasksPending: boolean;
}

export interface ReadCodingProjectRequest {
  readonly projectId: string;
}

export interface CloseCodingProjectRequest extends ReadCodingProjectRequest {}

export interface ListCodingSessionsRequest extends ReadCodingProjectRequest {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ReadCodingSessionRequest extends ReadCodingProjectRequest {
  readonly sessionId: string;
}

export interface CodingSessionReadModel {
  readonly projectId: string;
  readonly sessionId: string;
  readonly title?: string;
  readonly status: "active" | "archived";
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CodingSessionPage {
  readonly sessions: readonly CodingSessionReadModel[];
  readonly returnedCount: number;
  readonly hasMore: boolean;
  readonly nextCursor?: string;
}

export interface ReadCodingTranscriptRequest extends ReadCodingSessionRequest {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface CodingTranscriptPage {
  readonly projectId: string;
  readonly sessionId: string;
  readonly messages: readonly CodingTranscriptMessageReadModel[];
  readonly returnedCount: number;
  readonly hasMore: boolean;
  readonly contentTruncated: boolean;
  readonly omittedPartCount: number;
  readonly nextCursor?: string;
}

export interface CodingTranscriptMessageReadModel {
  readonly messageId: string;
  readonly sequence: number;
  readonly turnId: string;
  readonly role: "user" | "assistant" | "tool" | "system";
  readonly status: "completed" | "failed" | "partial";
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly parts: readonly CodingTranscriptPartReadModel[];
}

export type CodingTranscriptPartReadModel =
  | CodingTranscriptTextPartReadModel
  | CodingTranscriptReasoningPartReadModel
  | CodingTranscriptToolCallPartReadModel
  | CodingTranscriptToolResultPartReadModel
  | CodingTranscriptResourcePartReadModel
  | CodingTranscriptHiddenPartReadModel;

export interface CodingTranscriptPartBase {
  readonly partId: string;
  readonly visibility: MessagePartVisibility | "default";
}

export interface CodingTranscriptTextPartReadModel extends CodingTranscriptPartBase {
  readonly type: "text";
  readonly text: string;
  readonly truncated: boolean;
}

export interface CodingTranscriptReasoningPartReadModel extends CodingTranscriptPartBase {
  readonly type: "reasoning";
  readonly text?: string;
  readonly truncated: boolean;
}

export interface CodingTranscriptToolCallPartReadModel extends CodingTranscriptPartBase {
  readonly type: "tool_call";
  readonly toolCallId: string;
  readonly toolName: string;
}

export interface CodingTranscriptToolResultPartReadModel extends CodingTranscriptPartBase {
  readonly type: "tool_result";
  readonly toolCallId: string;
  readonly isError: boolean;
}

export interface CodingTranscriptResourcePartReadModel extends CodingTranscriptPartBase {
  readonly type: "resource";
  readonly resourceId: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly kind: ResourceKind;
  readonly mediaType?: string;
}

export interface CodingTranscriptHiddenPartReadModel extends CodingTranscriptPartBase {
  readonly type: "hidden";
  readonly sourceType:
    | "text"
    | "reasoning"
    | "tool_call"
    | "tool_result"
    | "resource";
  readonly hidden: true;
}

export interface ListCodingTurnsRequest extends ReadCodingSessionRequest {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface CodingTurnPage {
  readonly turns: readonly CodingTurnReadModel[];
  readonly returnedCount: number;
  readonly hasMore: boolean;
  readonly nextCursor?: string;
}

export interface StartCodingTurnCommand {
  readonly projectId: string;
  /** Stable caller-owned key for retrying one logical coding operation. */
  readonly idempotencyKey: string;
  readonly content: readonly UserMessageInputPart[];
  readonly sessionId?: string;
  readonly title?: string;
  readonly proposalTitle?: string;
  readonly agentId?: string;
  readonly modelEndpointId?: string;
  readonly maxSteps?: number;
  readonly maxOutputTokens?: number;
}

export interface ReadCodingTurnRequest {
  readonly projectId: string;
  readonly turnId: string;
}

export interface CancelCodingTurnRequest extends ReadCodingTurnRequest {
  readonly reason: string;
}

export interface ResolveCodingTurnRecoveryRequest extends ReadCodingTurnRequest {
  readonly executionId: string;
  readonly expectedRecoveryRevision: number;
  readonly decision: ToolExecutionRecoveryDecision;
  readonly reason: string;
  readonly requestId: string;
  readonly content?: readonly ToolResultContentPart[];
  readonly contentDigest?: string;
  readonly error?: JsonValue;
}

export interface ResolveCodingTurnApprovalRequest extends ReadCodingTurnRequest {
  readonly executionId: string;
  readonly expectedApprovalRevision: number;
  readonly decision: "approve_once" | "deny";
  readonly reason: string;
  readonly requestId: string;
}

export type CodingTurnState = "starting" | SessionTurnState;

export type CodingTurnResultKind =
  | "proposal_available"
  | "no_changes"
  | "failed"
  | "cancelled"
  | "attention";

export interface CodingTurnReadModel {
  readonly projectId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly state: CodingTurnState;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly finishedAt?: number;
  readonly canCancel: boolean;
  readonly result?: CodingTurnResultKind;
  readonly proposalId?: string;
  readonly approvals: CodingTurnApprovalReviewReadModel;
  readonly recovery: CodingTurnRecoveryReviewReadModel;
  readonly error?: {
    readonly code: CodingApplicationErrorCode | "turn_execution_failed";
    readonly message: string;
  };
}

export interface CodingTurnRecoveryReviewReadModel {
  readonly totalCount: number;
  readonly returnedCount: number;
  readonly omittedCount: number;
  readonly items: readonly CodingTurnRecoveryItemReadModel[];
}

export interface CodingTurnRecoveryItemReadModel {
  readonly executionId: string;
  readonly recoveryRevision: number;
  readonly tool: {
    readonly name: string;
    readonly title: string;
    readonly risk: "read_only" | "mutating" | "external";
    readonly idempotent: boolean;
    readonly resultMode: "immediate" | "deferred";
  };
  readonly evidence: {
    readonly message: string;
    readonly messageTruncated: boolean;
    readonly reconciliationRef?: string;
  };
  readonly attemptCount: number;
  readonly attempts: readonly {
    readonly attemptNumber: number;
    readonly state: ToolExecutionAttemptState;
    readonly startedAt: number;
    readonly updatedAt: number;
    readonly finishedAt?: number;
  }[];
  readonly attemptsTruncated: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly availableDecisions: readonly ToolExecutionRecoveryDecision[];
}

export interface CodingTurnApprovalReviewReadModel {
  readonly totalCount: number;
  readonly returnedCount: number;
  readonly omittedCount: number;
  readonly items: readonly CodingTurnApprovalReadModel[];
}

export interface CodingTurnApprovalReadModel {
  readonly executionId: string;
  readonly approvalRevision: number;
  readonly tool: {
    readonly name: string;
    readonly title: string;
    readonly risk: "read_only" | "mutating" | "external";
    readonly idempotent: boolean;
  };
  readonly presentation: {
    readonly summary: string;
    readonly summaryTruncated: boolean;
    readonly details: readonly {
      readonly label: string;
      readonly labelTruncated: boolean;
      readonly value: string;
      readonly valueTruncated: boolean;
    }[];
    readonly detailsTruncated: boolean;
  };
  readonly attemptCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly availableDecisions: readonly ["approve_once", "deny"];
}

export type CodingLiveTurnPhase =
  | "starting"
  | "thinking"
  | "responding"
  | "tool_calling"
  | "waiting"
  | "cancelling"
  | "settling"
  | "failed";

export interface CodingLiveToolActivityReadModel {
  readonly ordinal: number;
  readonly name?: string;
  readonly nameTruncated: boolean;
  readonly state: "streaming" | "ready";
}

export interface CodingLiveTurnReadModel {
  readonly projectId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly revision: number;
  readonly updatedAt: number;
  readonly phase: CodingLiveTurnPhase;
  readonly assistantText: string;
  readonly assistantTextTruncated: boolean;
  readonly activities: readonly CodingLiveToolActivityReadModel[];
  readonly activitiesTruncated: boolean;
}

export interface ReadCodingProposalRequest {
  readonly projectId: string;
  readonly proposalId: string;
}

export interface CodingProposalDecisionRequest extends ReadCodingProposalRequest {
  readonly decision: "approve" | "reject" | "withdraw";
  readonly reason: string;
  readonly requestId: string;
}

export interface RequestCodingProposalApplyRequest extends ReadCodingProposalRequest {
  readonly reason: string;
  readonly requestId: string;
}

export interface ApplyCodingProposalRequest extends ReadCodingProposalRequest {}

export interface UndoCodingProposalRequest extends ReadCodingProposalRequest {
  readonly requestId: string;
}

export interface CodingProposalReadModel {
  readonly projectId: string;
  readonly proposalId: string;
  readonly state: WorkspaceChangeProposalState;
  readonly changeState: WorkspaceChangeSetState;
  readonly title?: string;
  readonly summary?: string;
  readonly incomplete: boolean;
  readonly executionOutcome?: "failed";
  readonly totalFileCount: number;
  readonly returnedFileCount: number;
  readonly omittedFileCount: number;
  readonly files: readonly CodingProposalFileChangeReadModel[];
  readonly totalOperationCount: number;
  readonly returnedOperationCount: number;
  readonly omittedOperationCount: number;
  readonly operations: readonly {
    readonly action: "approve" | "reject" | "withdraw" | "request_apply";
    readonly fromState: WorkspaceChangeProposalState;
    readonly toState: WorkspaceChangeProposalState;
    readonly reason?: string;
    readonly createdAt: number;
  }[];
}

export interface CodingProposalFileChangeReadModel {
  readonly path: string;
  readonly kind: "create" | "update" | "delete";
  readonly before?: CodingProposalTextPreviewReadModel;
  readonly after?: CodingProposalTextPreviewReadModel;
}

export interface CodingProposalTextPreviewReadModel {
  readonly sha256: string;
  readonly text?: string;
  readonly truncated: boolean;
}

export interface CodingProposalActionResult {
  readonly action: "approve" | "reject" | "withdraw" | "request_apply";
  readonly proposal: CodingProposalReadModel;
}

export type CodingProposalApplyStatus =
  | "applied"
  | "apply_failed"
  | "busy"
  | "recovery_required"
  | "not_ready"
  | "already_terminal";

export interface CodingProposalApplyResult {
  readonly status: CodingProposalApplyStatus;
  readonly proposal: CodingProposalReadModel;
  readonly mutation?: CodingProposalMutationReadModel;
}

export interface CodingProposalUndoResult {
  readonly status: "applied" | "already_applied" | "conflicted";
  readonly replayed: boolean;
  readonly proposal: CodingProposalReadModel;
  readonly mutation: CodingProposalMutationReadModel;
}

export interface CodingProposalMutationReadModel {
  readonly kind: "apply" | "undo";
  readonly status: "applied" | "already_applied" | "conflicted";
  readonly totalFileCount: number;
  readonly returnedFileCount: number;
  readonly omittedFileCount: number;
  readonly files: readonly {
    readonly path: string;
    readonly kind: "create" | "update" | "delete";
    readonly beforeSha256?: string;
    readonly afterSha256?: string;
  }[];
  readonly totalConflictCount: number;
  readonly returnedConflictCount: number;
  readonly omittedConflictCount: number;
  readonly conflicts: readonly {
    readonly path: string;
    readonly reason: WorkspaceFileConflict["reason"];
    readonly currentSha256?: string;
    readonly expectedSha256?: string;
  }[];
}

export type CodingApplicationEventReason =
  | "project_opened"
  | "project_closed"
  | "recovery_attention"
  | "turn_started"
  | "turn_admitted"
  | "turn_progress"
  | "turn_waiting"
  | "turn_execution_settled"
  | "turn_settled"
  | "turn_cancel_requested"
  | "approval_resolved"
  | "turn_recovery_resolved"
  | "turn_live_updated"
  | "proposal_reviewed"
  | "proposal_apply_requested"
  | "proposal_applied"
  | "proposal_undone";

export type CodingApplicationEvent = {
  readonly streamId: string;
  readonly sequence: number;
  readonly occurredAt: number;
  readonly projectId: string;
  readonly reason: CodingApplicationEventReason;
} & (
  | { readonly kind: "project_invalidated" }
  | { readonly kind: "turn_invalidated"; readonly turnId: string }
  | {
      readonly kind: "turn_live_invalidated";
      readonly turnId: string;
      readonly revision: number;
    }
  | { readonly kind: "proposal_invalidated"; readonly proposalId: string }
);

export type CodingApplicationEventListener = (
  event: CodingApplicationEvent,
) => void;

export interface ListCodingEventsRequest {
  readonly streamId?: string;
  readonly afterSequence?: number;
  readonly limit?: number;
}

export interface CodingApplicationEventPage {
  readonly streamId: string;
  readonly events: readonly CodingApplicationEvent[];
  readonly firstRetainedSequence: number;
  readonly lastSequence: number;
  readonly gap: boolean;
  readonly hasMore: boolean;
}
