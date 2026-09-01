import type {
  JsonValue,
  SessionMessageRecord,
  SessionPageCursor,
  SessionStatus,
  SessionTurnPageCursor,
  SessionTurnRecoveryBinding,
  SessionTurnState,
  ToolExecutionAttemptState,
  ToolExecutionRecoveryDecision,
  ToolResultContentPart,
  UserMessageInputPart,
  PrincipalId,
  WorkspaceTaskRunOutcome,
  WorkspaceTaskRunState,
} from "@wanex/protocol";
import type { PreparedAgentContext } from "@wanex/runtime/context";
import type {
  ResolveSystemServiceBinaryOptions,
  WanexBootstrapStorageConfig,
} from "@wanex/runtime/bootstrap";
import type {
  ProviderAdapter,
  ProviderEventObserver,
} from "@wanex/runtime/provider";
import type { ExecutionEnvironment } from "@wanex/runtime/execution";
import type { SecretResolverPort } from "@wanex/runtime/secrets";
import type { ToolPermissionPolicy } from "@wanex/runtime/tools";
import type { WorkspaceProgramPolicy } from "@wanex/workspace/tools";
import type {
  CodingHostDiagnostics,
  CodingRepositoryDiagnostics,
} from "./diagnostics/types.js";

export type CodingHostState = "open" | "closing" | "closed";
export type CodingRepositoryState = "open" | "closing" | "closed";

export type CodingTurnExecutionStage =
  | "scheduled"
  | "session_ownership"
  | "durable_input_check"
  | "input_admission"
  | "admission_read"
  | "existing_turn_wait"
  | "workspace_task_setup"
  | "context_prepare"
  | "model_endpoint_resolve"
  | "turn_submit"
  | "worker_start"
  | "settlement_wait"
  | "workspace_task_settlement";

export type CodingModelEndpointResolutionState =
  | "not_started"
  | "resolved"
  | "missing"
  | "failed";

export type CodingHostErrorCode =
  | "host_closed"
  | "invalid_data_directory"
  | "repository_unavailable"
  | "repository_invalid"
  | "repository_data_overlap"
  | "repository_recovery_failed"
  | "repository_not_ready"
  | "repository_closed"
  | "session_unavailable"
  | "turn_unavailable"
  | "invalid_request"
  | "proposal_unavailable"
  | "execution_unavailable";

export interface CodingApplicationHostOptions {
  readonly dataDir: string;
  readonly storage: WanexBootstrapStorageConfig;
  readonly artifacts?: ResolveSystemServiceBinaryOptions;
  readonly gitBin?: string;
  readonly gitTimeoutMs?: number;
  readonly ownerId?: PrincipalId;
  readonly principalId?: PrincipalId;
  readonly executionEnvironmentId?: string;
  readonly executionEnvironmentFactory?: CodingExecutionEnvironmentFactory;
  readonly recovery?: CodingRepositoryRecoveryPolicy;
  readonly context?: CodingRepositoryContextPolicy;
  readonly execution?: CodingExecutionOptions;
}

export interface CodingExecutionEnvironmentFactoryRequest {
  readonly environmentId: string;
  readonly serviceBin: string;
}

export type CodingExecutionEnvironmentFactory = (
  request: CodingExecutionEnvironmentFactoryRequest,
) => ExecutionEnvironment;

export interface CodingRepositoryContextPolicy {
  readonly globalConfigDir?: string;
  readonly instructionTargets?: readonly string[];
  readonly globalSkillDirs?: readonly string[];
  readonly projectSkillDirs?: readonly string[];
  readonly registerSkillActivationTool?: boolean;
  readonly skillActivation?: {
    readonly maxIndexedFiles?: number;
    readonly supportingDirectories?: readonly string[];
  };
}

export interface CodingExecutionOptions {
  readonly toolPermissionPolicy: ToolPermissionPolicy;
  readonly programPolicy: WorkspaceProgramPolicy;
  readonly baseAgentContext?: PreparedAgentContext;
  readonly workerCount?: number;
  readonly modelEndpointId?: string;
  /**
   * Trusted composition hook for resolving the endpoint used by each new
   * Turn. The returned ID is read from canonical Storage by Runtime and is
   * frozen into that Turn's execution binding.
   */
  readonly resolveModelEndpointId?: CodingModelEndpointResolver;
  readonly secretResolver?: SecretResolverPort;
  readonly provider?: ProviderAdapter;
  readonly recovery?: SessionTurnRecoveryBinding;
  readonly toolMaxConcurrency?: number;
  readonly leaseMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly timeoutMs?: number;
  readonly idleIntervalMs?: number;
  readonly errorIntervalMs?: number;
  readonly observeProviderEvent?: ProviderEventObserver;
}

export interface CodingModelEndpointResolutionRequest {
  readonly repositoryId: string;
  readonly sessionId: string;
  readonly inputId: string;
  readonly turnId: string;
  readonly jobId: string;
  readonly requestedModelEndpointId?: string;
}

export type CodingModelEndpointResolver = (
  request: CodingModelEndpointResolutionRequest,
) => Promise<string | undefined> | string | undefined;

export interface CodingRepositoryRecoveryPolicy {
  readonly maxRuns?: number;
  readonly budgetMs?: number;
}

export interface OpenCodingRepositoryRequest {
  readonly repositoryPath: string;
}

export interface CodingHost {
  readonly state: CodingHostState;
  openRepository(
    request: OpenCodingRepositoryRequest,
  ): Promise<CodingRepository>;
  readDiagnostics(): Promise<CodingHostDiagnostics>;
  close(): Promise<void>;
}

export interface CodingRepository {
  readonly repositoryId: string;
  readonly repositoryName: string;
  readonly state: CodingRepositoryState;
  readonly sharedCheckoutReady: boolean;
  readonly recovery: CodingRepositoryRecovery;
  startTurn(request: StartCodingTurnRequest): CodingTurnOperation;
  readDiagnostics(): Promise<CodingRepositoryDiagnostics>;
  listSessions(request: ListCodingSessionsRequest): Promise<CodingSessionPage>;
  getSession(sessionId: string): Promise<CodingSessionSnapshot | null>;
  readTranscript(
    request: ReadCodingTranscriptRequest,
  ): Promise<CodingTranscriptWindow | null>;
  listTurns(request: ListCodingTurnsRequest): Promise<CodingTurnPage>;
  getTurn(turnId: string): Promise<CodingTurnSnapshot | null>;
  resolveTurnRecovery(
    request: ResolveCodingTurnRecoveryRequest,
  ): Promise<CodingTurnSnapshot>;
  getProposal(proposalId: string): Promise<CodingProposalSnapshot | null>;
  decideProposal(
    request: CodingProposalDecisionRequest,
  ): Promise<CodingProposalActionReceipt>;
  requestProposalApply(
    request: CodingProposalActionRequest,
  ): Promise<CodingProposalActionReceipt>;
  applyProposal(proposalId: string): Promise<CodingProposalApplyReceipt>;
  undoProposal(
    request: UndoCodingProposalRequest,
  ): Promise<CodingProposalUndoReceipt>;
  close(): Promise<void>;
}

export interface ListCodingSessionsRequest {
  readonly before?: SessionPageCursor;
  readonly limit: number;
}

export interface CodingSessionPage {
  readonly items: readonly CodingSessionSnapshot[];
  readonly continuation?: SessionPageCursor;
}

export interface CodingSessionSnapshot {
  readonly sessionId: string;
  readonly title?: string;
  readonly status: SessionStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ReadCodingTranscriptRequest {
  readonly sessionId: string;
  readonly beforeSequence?: number;
  readonly limit: number;
}

export interface CodingTranscriptWindow {
  readonly messages: readonly SessionMessageRecord[];
  readonly hasMore: boolean;
  readonly continuation?: number;
}

export interface ListCodingTurnsRequest {
  readonly sessionId: string;
  readonly before?: SessionTurnPageCursor;
  readonly limit: number;
}

export interface CodingTurnPage {
  readonly items: readonly CodingTurnSnapshot[];
  readonly continuation?: SessionTurnPageCursor;
}

export interface CodingTurnSnapshot {
  readonly reference: CodingTurnReference;
  readonly state: SessionTurnState;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly finishedAt?: number;
  readonly taskOutcome?: WorkspaceTaskRunOutcome;
  readonly proposalId?: string;
  readonly approvals: CodingTurnApprovalReview;
  readonly recovery: CodingTurnRecoveryReview;
}

export interface CodingTurnApprovalReview {
  readonly totalCount: number;
  readonly returnedCount: number;
  readonly omittedCount: number;
  readonly items: readonly CodingTurnApprovalItem[];
}

export interface CodingTurnApprovalItem {
  readonly executionId: string;
  readonly approvalRevision: number;
  readonly tool: {
    readonly name: string;
    readonly title: string;
    readonly risk: "read_only" | "mutating" | "external";
    readonly idempotent: boolean;
  };
  readonly presentation: CodingTurnApprovalPresentation;
  readonly attemptCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly availableDecisions: readonly ["approve_once", "deny"];
}

export interface CodingTurnApprovalPresentation {
  readonly summary: string;
  readonly summaryTruncated: boolean;
  readonly details: readonly CodingTurnApprovalPresentationDetail[];
  readonly detailsTruncated: boolean;
}

export interface CodingTurnApprovalPresentationDetail {
  readonly label: string;
  readonly labelTruncated: boolean;
  readonly value: string;
  readonly valueTruncated: boolean;
}

export interface CodingTurnRecoveryReview {
  readonly totalCount: number;
  readonly returnedCount: number;
  readonly omittedCount: number;
  readonly items: readonly CodingTurnRecoveryItem[];
}

export interface CodingTurnRecoveryItem {
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

export interface CodingProposalDecisionRequest extends CodingProposalActionRequest {
  readonly decision: "approve" | "reject" | "withdraw";
}

export interface CodingProposalActionRequest {
  readonly proposalId: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface UndoCodingProposalRequest {
  readonly proposalId: string;
  readonly idempotencyKey: string;
}

export interface CodingProposalTextPreview {
  readonly sha256: string;
  readonly text?: string;
  readonly truncated: boolean;
}

export interface CodingProposalFileChange {
  readonly path: string;
  readonly kind: "create" | "update" | "delete";
  readonly before?: CodingProposalTextPreview;
  readonly after?: CodingProposalTextPreview;
}

export interface CodingProposalReviewOperation {
  readonly operationId: string;
  readonly action: "approve" | "reject" | "withdraw" | "request_apply";
  readonly fromState: import("@wanex/protocol").WorkspaceChangeProposalState;
  readonly toState: import("@wanex/protocol").WorkspaceChangeProposalState;
  readonly reason?: string;
  readonly createdAt: number;
}

export interface CodingProposalSnapshot {
  readonly proposalId: string;
  readonly changeSetId: string;
  readonly state: import("@wanex/protocol").WorkspaceChangeProposalState;
  readonly changeSetState: import("@wanex/protocol").WorkspaceChangeSetState;
  readonly title?: string;
  readonly summary?: string;
  readonly incomplete: boolean;
  readonly executionOutcome?: "failed";
  readonly totalFileCount: number;
  readonly returnedFileCount: number;
  readonly omittedFileCount: number;
  readonly files: readonly CodingProposalFileChange[];
  readonly totalOperationCount: number;
  readonly returnedOperationCount: number;
  readonly omittedOperationCount: number;
  readonly operations: readonly CodingProposalReviewOperation[];
}

export interface CodingProposalActionReceipt {
  readonly action: "approve" | "reject" | "withdraw" | "request_apply";
  readonly operationId: string;
  readonly proposal: CodingProposalSnapshot;
}

export interface CodingProposalMutationOperation {
  readonly operationId: string;
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
    readonly reason: import("@wanex/protocol").WorkspaceFileConflict["reason"];
    readonly currentSha256?: string;
    readonly expectedSha256?: string;
  }[];
}

export interface CodingProposalApplyReceipt {
  readonly status: import("@wanex/workspace/review").ApplyProposalStatus;
  readonly proposal: CodingProposalSnapshot;
  readonly operation?: CodingProposalMutationOperation;
  readonly error?: JsonValue;
}

export interface CodingProposalUndoReceipt {
  readonly status: "applied" | "already_applied" | "conflicted";
  readonly replayed: boolean;
  readonly proposal: CodingProposalSnapshot;
  readonly operation: CodingProposalMutationOperation;
}

export interface StartCodingTurnRequest {
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

export interface CodingTurnReference {
  readonly repositoryId: string;
  readonly taskId: string;
  readonly sessionId: string;
  readonly inputId: string;
  readonly turnId: string;
  readonly jobId: string;
}

export interface CodingTurnOperation {
  readonly reference: CodingTurnReference;
  readonly result: Promise<CodingTurnReceipt>;
  cancel(reason: string): Promise<void>;
  resolveApproval(
    request: ResolveCodingTurnApprovalRequest,
  ): Promise<ResolveCodingTurnApprovalReceipt>;
}

export interface ResolveCodingTurnApprovalRequest {
  readonly executionId: string;
  readonly expectedApprovalRevision: number;
  readonly decision: "approve_once" | "deny";
  readonly reason: string;
  readonly idempotencyKey?: string;
}

export interface ResolveCodingTurnRecoveryRequest {
  readonly turnId: string;
  readonly executionId: string;
  readonly expectedRecoveryRevision: number;
  readonly decision: ToolExecutionRecoveryDecision;
  readonly reason: string;
  readonly requestId: string;
  readonly content?: readonly ToolResultContentPart[];
  readonly contentDigest?: string;
  readonly error?: JsonValue;
}

export interface ResolveCodingTurnApprovalReceipt {
  readonly executionId: string;
  readonly decision: "approve_once" | "deny";
  readonly approvalRevision: number;
}

export interface CodingTurnReceipt {
  readonly reference: CodingTurnReference;
  readonly turnState?: SessionTurnState;
  readonly task: {
    readonly status: "succeeded" | "failed";
    readonly outcome?: WorkspaceTaskRunOutcome;
    readonly changeSetId?: string;
    readonly proposalId?: string;
  };
}

export interface CodingRepositoryRecovery {
  readonly transaction: "clean" | "attention";
  readonly tasks: CodingTaskRecovery;
}

export interface CodingTaskRecovery {
  readonly attempted: number;
  readonly released: number;
  readonly attention: number;
  readonly skipped: number;
  readonly failed: number;
  readonly remaining: boolean;
  readonly entries: readonly CodingTaskRecoveryEntry[];
  readonly diagnostics: readonly CodingTaskRecoveryDiagnostic[];
}

export interface CodingTaskRecoveryEntry {
  readonly runId: string;
  readonly previousState: WorkspaceTaskRunState;
  readonly outcome: "released" | "attention" | "skipped" | "failed";
}

export interface CodingTaskRecoveryDiagnostic {
  readonly code: "budget_exceeded" | "limit_reached" | "recovery_failed";
}
