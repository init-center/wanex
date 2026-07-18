import type { ContextCompiler } from "../../context/memory/index.js"
import type {
  ProviderAdapter,
  ProviderEventObserver
} from "../../provider/index.js"
import type {
  SchedulerJobRecord,
  SessionId,
  SessionMessageRecord,
  SessionRecord,
  SubmitSessionRunReceipt
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type {
  ToolPermissionPolicy,
  ToolRecoveryPolicy,
  ToolRegistry
} from "../../tools/index.js"
import type { WorkerRunOnceResult } from "../../jobs/index.js"

export interface WanexAgentRuntimeOptions {
  readonly storage: CoreStore
  readonly workerId?: string
  readonly runnerId?: string
  readonly leaseMs?: number
  readonly heartbeatIntervalMs?: number
  readonly timeoutMs?: number
  readonly tools?: ToolRegistry
  readonly toolPermissionPolicy?: ToolPermissionPolicy
  readonly toolRecoveryPolicy?: ToolRecoveryPolicy
  readonly toolMaxConcurrency?: number
  readonly contextCompiler?: ContextCompiler
  readonly providerProfileId?: string
  readonly provider?: ProviderAdapter
  readonly fakeResponseText?: string
  readonly observeProviderEvent?: ProviderEventObserver
}

export interface SubmitUserTextRequest {
  readonly text: string
  readonly sessionId?: SessionId
  readonly title?: string
  readonly principalId?: string
  readonly idempotencyKey?: string
  readonly inputId?: string
  readonly jobId?: string
  readonly jobIdempotencyKey?: string
  readonly budgetGrantId?: string
  readonly providerProfileId?: string
  readonly mode?: "once" | "to_completion"
  readonly maxSteps?: number
}

export interface SubmitUserTextResult {
  readonly session: SessionRecord
  readonly inputId: string
  readonly receipt: SubmitSessionRunReceipt
}

export interface AgentRunOnceResult {
  readonly worker: WorkerRunOnceResult
  readonly job?: SchedulerJobRecord
}

export interface SubmitAndRunUserTextResult extends SubmitUserTextResult {
  readonly run: AgentRunOnceResult
  readonly messages: readonly SessionMessageRecord[]
}
