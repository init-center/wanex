import type { ContextCompiler } from "../../context/memory/index.js"
import type { PreparedAgentContext } from "../../context/agent/index.js"
import type {
  ProviderAdapter,
  ProviderEventObserver
} from "../../provider/index.js"
import type {
  SchedulerJobRecord,
  RunControlPolicy,
  SessionId,
  SessionInputIntent,
  SessionInputOrigin,
  SessionMessageRecord,
  SessionRecord,
  SubmitSessionTurnReceipt,
  SessionTurnRecoveryBinding,
  UserMessageInputPart
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type {
  ToolPermissionPolicy,
  ToolRegistry
} from "../../tools/index.js"
import type { WorkerRunOnceResult } from "../../jobs/index.js"
import type { ActiveExecutionAbortRegistry } from "../../jobs/active-abort.js"
import type { SecretResolverPort } from "../../secrets/index.js"
import type { SessionTurnAgentContextResolver } from "../worker/types.js"

export interface WanexAgentRuntimeOptions {
  readonly storage: CoreStore
  readonly workerId?: string
  readonly leaseMs?: number
  readonly heartbeatIntervalMs?: number
  readonly timeoutMs?: number
  readonly tools?: ToolRegistry
  readonly toolPermissionPolicy?: ToolPermissionPolicy
  readonly recovery?: SessionTurnRecoveryBinding
  readonly toolMaxConcurrency?: number
  readonly contextCompiler?: ContextCompiler
  readonly agentContext?: PreparedAgentContext
  readonly providerProfileId?: string
  readonly secretResolver?: SecretResolverPort
  readonly provider?: ProviderAdapter
  readonly fakeResponseText?: string
  readonly observeProviderEvent?: ProviderEventObserver
  readonly resolveAgentContext?: SessionTurnAgentContextResolver
  /** @internal */
  readonly activeAbortRegistry?: ActiveExecutionAbortRegistry
}

export interface SubmitUserTurnRequest {
  readonly content: readonly UserMessageInputPart[]
  readonly sessionId?: SessionId
  readonly title?: string
  readonly principalId?: string
  readonly idempotencyKey?: string
  readonly inputId?: string
  readonly turnId?: string
  readonly jobId?: string
  readonly jobIdempotencyKey?: string
  readonly budgetGrantId?: string
  readonly providerProfileId?: string
  readonly maxSteps?: number
  readonly parentTurnId?: string
  readonly regeneratesTurnId?: string
  readonly origin?: SessionInputOrigin
  readonly intent?: SessionInputIntent
  readonly runControlPolicy?: RunControlPolicy
  readonly expectedTurnId?: string
}

export interface SubmitUserTurnResult {
  readonly session: SessionRecord
  readonly inputId: string
  readonly turnId: string
  readonly receipt: SubmitSessionTurnReceipt
}

export interface AgentRunOnceResult {
  readonly worker: WorkerRunOnceResult
  readonly job?: SchedulerJobRecord
}

export interface SubmitAndRunUserTurnResult extends SubmitUserTurnResult {
  readonly run: AgentRunOnceResult
  readonly messages: readonly SessionMessageRecord[]
}
