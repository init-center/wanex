import type { ContextCompiler } from "../../context/memory/index.js"
import type { ContextCapacityCompactor } from "../../context/capacity/index.js"
import type {
  ProviderAdapter,
  ProviderEventObserver
} from "../../provider/index.js"
import type {
  DeferToolExecutionReceipt,
  RuntimeAbortSignal,
  SettleSessionTurnReceipt,
  ToolExecutionApprovalSuspensionReceipt
} from "@wanex/protocol"
import type { WanexSessionCore } from "../../sessions/index.js"
import type {
  ToolPermissionPolicy,
  ToolRegistry
} from "../../tools/index.js"
import type { AgentRuntimeExecutionStageObserver } from "../stage.js"

export interface WanexAgentRunnerOptions {
  readonly session: WanexSessionCore
  readonly provider: ProviderAdapter
  readonly tools?: ToolRegistry
  readonly toolPermissionPolicy?: ToolPermissionPolicy
  readonly toolMaxConcurrency?: number
  readonly contextCompiler?: ContextCompiler
  readonly compactContext?: ContextCapacityCompactor
  readonly timeoutMs?: number
  readonly observeProviderEvent?: ProviderEventObserver
  readonly observeExecutionStage?: AgentRuntimeExecutionStageObserver
}

export interface ActiveTurnAttempt {
  readonly sessionId: string
  readonly turnId: string
  readonly attemptId: string
  readonly inputId: string
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly principalId: string
  readonly maxSteps: number
  readonly maxOutputTokens: number
  readonly recovery: import("@wanex/protocol").SessionTurnRecoveryBinding
  readonly budgetGrantId?: string
}

export interface ExecuteTurnRequest {
  readonly execution: ActiveTurnAttempt
  readonly signal?: RuntimeAbortSignal
  heartbeat(): Promise<void>
}

export type ExecuteTurnResult =
  | ExecuteTurnSettlementResult
  | ExecuteTurnSuspendedResult

export interface ExecuteTurnSettlementResult {
  readonly outcome:
    | "succeeded"
    | "failed"
    | "cancelled"
    | "interrupted"
    | "recovery_required"
  readonly steps: number
  readonly settlement: SettleSessionTurnReceipt
  readonly error?: Error
}

export interface ExecuteTurnSuspendedResult {
  readonly outcome: "suspended"
  readonly steps: number
  readonly receipt:
    | DeferToolExecutionReceipt
    | ToolExecutionApprovalSuspensionReceipt
}
