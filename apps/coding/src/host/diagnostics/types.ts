import type {
  ProviderInvocationState,
  SchedulerJobState,
  SessionAttemptState,
  SessionTurnState,
  ToolExecutionAttemptState,
  ToolExecutionRecoveryDecision,
  ToolExecutionState,
  WorkspaceTaskAttemptState,
  WorkspaceTaskRunOutcome,
  WorkspaceTaskRunState,
} from "@wanex/protocol";
import type {
  CodingHostState,
  CodingModelEndpointResolutionState,
  CodingRepositoryState,
  CodingTurnExecutionStage,
  CodingTurnReference,
} from "../types.js";
import type { CodingHostTurnSignalKind } from "../events.js";
import type { AgentRuntimeExecutionStage } from "@wanex/runtime/execution";
import type { ProviderEvent } from "@wanex/runtime/provider";

export interface CodingRuntimeDiagnostics {
  readonly started: boolean;
  readonly workerCount: number;
  readonly activeLoopCount: number;
  readonly activeExecutionCount: number;
  readonly agentLoopRunCount: number;
  readonly agentLoopFailedCount: number;
  readonly settlement: CodingSettlementDiagnostics;
  readonly recentRecoveries: readonly CodingRecoveryDiagnostics[];
  readonly lastEvent?: CodingRuntimeEventDiagnostics;
}

export interface CodingRuntimeEventDiagnostics {
  readonly kind: "provider_event" | "turn_signal";
  readonly reference: CodingRuntimeTurnReference;
  readonly signal?: Exclude<
    CodingHostTurnSignalKind,
    "provider_event"
  >;
  readonly providerEventType?: ProviderEvent["type"];
}

export interface CodingSettlementDiagnostics {
  readonly pendingCount: number;
  readonly pendingReferences: readonly CodingRuntimeTurnReference[];
  readonly lastEvent?:
    | "wait_registered"
    | "wait_released"
    | "signal_observed"
    | "canonical_terminal"
    | "refresh_failed";
  readonly lastReference?: CodingRuntimeTurnReference;
  readonly lastOutcome?: "completed" | "failed" | "suspended";
}

export interface CodingRuntimeTurnReference {
  readonly sessionId: string;
  readonly inputId: string;
  readonly turnId: string;
  readonly jobId: string;
}

export interface CodingRecoveryCanonicalDiagnostics {
  readonly readState: "available" | "failed";
  readonly tool?: {
    readonly state: ToolExecutionState;
    readonly attemptCount: number;
    readonly currentAttemptState?: ToolExecutionAttemptState;
  };
  readonly provider: {
    readonly invocationCount: number;
    readonly latestState?: ProviderInvocationState;
  };
  readonly task?: {
    readonly state: WorkspaceTaskRunState;
    readonly attemptState?: WorkspaceTaskAttemptState;
  };
  readonly job?: {
    readonly state: SchedulerJobState;
    readonly attempt: number;
  };
  readonly turn?: {
    readonly state: SessionTurnState;
    readonly attemptState?: SessionAttemptState;
  };
  readonly readFailure?: CodingDiagnosticFailure;
}

export interface CodingRecoveryDiagnostics {
  readonly reference: CodingTurnReference;
  readonly executionId: string;
  readonly expectedRecoveryRevision: number;
  readonly decision: ToolExecutionRecoveryDecision;
  readonly phase: "resolving" | "requeued" | "settled" | "failed";
  readonly runtimeStage?: AgentRuntimeExecutionStage;
  readonly action?:
    | "waiting_for_other_recovery"
    | "turn_requeued"
    | "turn_abandoned";
  readonly canonical?: CodingRecoveryCanonicalDiagnostics;
  readonly failure?: CodingDiagnosticFailure;
}

export type CodingDiagnosticFailureCategory =
  | "cancelled"
  | "timeout"
  | "lease_lost"
  | "permission_denied"
  | "not_found"
  | "already_exists"
  | "invalid_path"
  | "conflict"
  | "process_failure"
  | "storage_failure"
  | "tool_failure"
  | "provider_failure"
  | "unknown";

export type CodingDiagnosticFailureSignal =
  | "cancelled"
  | "conflict"
  | "eacces"
  | "eexist"
  | "enoent"
  | "eperm"
  | "git"
  | "invalid_argument"
  | "lease"
  | "path"
  | "pipe"
  | "process"
  | "provider"
  | "rename"
  | "rpc"
  | "spawn"
  | "sqlite"
  | "storage"
  | "timeout"
  | "tool"
  | "transaction"
  | "worktree";

export interface CodingDiagnosticFailure {
  readonly category: CodingDiagnosticFailureCategory;
  readonly signals: readonly CodingDiagnosticFailureSignal[];
  readonly type?: string;
  readonly name?: string;
  readonly code?: string;
}

export interface CodingToolExecutionDiagnostics {
  readonly toolName: string;
  readonly state: ToolExecutionState;
  readonly attemptCount: number;
  readonly currentAttemptState?: ToolExecutionAttemptState;
  readonly failure?: CodingDiagnosticFailure;
}

export interface CodingToolDiagnostics {
  readonly state: "available" | "failed";
  readonly returnedCount: number;
  readonly truncated: boolean;
  readonly items: readonly CodingToolExecutionDiagnostics[];
  readonly failure?: CodingDiagnosticFailure;
}

export interface CodingTurnDiagnostics {
  readonly reference: CodingTurnReference;
  readonly stage: CodingTurnExecutionStage;
  readonly modelEndpointResolution: CodingModelEndpointResolutionState;
  readonly runtimeStage?: AgentRuntimeExecutionStage;
  readonly inputPresent: boolean;
  readonly userMessagePresent: boolean;
  readonly providerInvocationCount: number;
  readonly latestProviderInvocationState?: ProviderInvocationState;
  readonly providerFailure?: CodingDiagnosticFailure;
  readonly tools: CodingToolDiagnostics;
  readonly task: {
    readonly present: boolean;
    readonly state?: WorkspaceTaskRunState;
    readonly outcome?: WorkspaceTaskRunOutcome;
    readonly attemptState?: WorkspaceTaskAttemptState;
    readonly failure?: CodingDiagnosticFailure;
  };
  readonly job: {
    readonly present: boolean;
    readonly state?: SchedulerJobState;
    readonly attempt?: number;
    readonly leasePresent?: boolean;
    readonly failure?: CodingDiagnosticFailure;
  };
  readonly turn: {
    readonly present: boolean;
    readonly state?: SessionTurnState;
    readonly attemptState?: SessionAttemptState;
    readonly failure?: CodingDiagnosticFailure;
  };
}

export interface CodingRepositoryDiagnostics {
  readonly repositoryId: string;
  readonly state: CodingRepositoryState;
  readonly activeTurns: readonly CodingTurnDiagnostics[];
  readonly runtime?: CodingRuntimeDiagnostics;
}

export interface CodingHostDiagnostics {
  readonly state: CodingHostState;
  readonly repositories: readonly CodingRepositoryDiagnostics[];
}
