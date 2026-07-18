import type { ContextCompiler } from "../../context/memory/index.js"
import type {
  ProviderAdapter,
  ProviderEventObserver
} from "../../provider/index.js"
import type { RuntimeAbortSignal, SessionId } from "@wanex/protocol"
import type { WanexSessionCore } from "../../sessions/index.js"
import type {
  ToolPermissionPolicy,
  ToolRecoveryPolicy,
  ToolRegistry
} from "../../tools/index.js"

export interface WanexAgentRunnerOptions {
  readonly session: WanexSessionCore
  readonly provider: ProviderAdapter
  readonly tools?: ToolRegistry
  readonly toolPermissionPolicy?: ToolPermissionPolicy
  readonly toolRecoveryPolicy?: ToolRecoveryPolicy
  readonly toolMaxConcurrency?: number
  readonly contextCompiler?: ContextCompiler
  readonly runnerId: string
  readonly leaseMs: number
  readonly timeoutMs?: number
  readonly observeProviderEvent?: ProviderEventObserver
}

export interface RunOnceRequest {
  readonly sessionId: SessionId
  readonly budgetGrantId?: string
  readonly signal?: RuntimeAbortSignal
}

export type RunOnceResult =
  | {
      readonly status: "idle"
      readonly sessionId: SessionId
    }
  | {
      readonly status: "cancelled"
      readonly sessionId: SessionId
      readonly inputId: string
      readonly runId: string
      readonly reason?: string
    }
  | {
      readonly status: "completed"
      readonly sessionId: SessionId
      readonly inputId: string
      readonly runId: string
    }

export interface RunToCompletionRequest {
  readonly sessionId: SessionId
  readonly budgetGrantId?: string
  readonly maxSteps?: number
  readonly signal?: RuntimeAbortSignal
}

export type RunToCompletionResult =
  | {
      readonly status: "idle"
      readonly sessionId: SessionId
      readonly steps: number
    }
  | {
      readonly status: "cancelled"
      readonly sessionId: SessionId
      readonly inputId: string
      readonly runId: string
      readonly steps: number
      readonly reason?: string
    }
  | {
      readonly status: "completed"
      readonly sessionId: SessionId
      readonly inputId: string
      readonly runId: string
      readonly steps: number
    }

export interface ClaimedRun {
  readonly runId: string
  readonly inputId: string
  readonly runnerId: string
  readonly leaseToken: string
}
