import type {
  ProviderInvocationState,
  SchedulerJobState,
  SessionAttemptState,
  SessionTurnState,
  ToolExecutionAttemptState,
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

export interface CodingRuntimeDiagnostics {
  readonly started: boolean;
  readonly workerCount: number;
  readonly activeLoopCount: number;
  readonly activeExecutionCount: number;
  readonly agentLoopRunCount: number;
  readonly agentLoopFailedCount: number;
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
  readonly runtime?: CodingRuntimeDiagnostics;
}

export interface CodingRepositoryDiagnostics {
  readonly repositoryId: string;
  readonly state: CodingRepositoryState;
  readonly activeTurns: readonly CodingTurnDiagnostics[];
}

export interface CodingHostDiagnostics {
  readonly state: CodingHostState;
  readonly repositories: readonly CodingRepositoryDiagnostics[];
}
