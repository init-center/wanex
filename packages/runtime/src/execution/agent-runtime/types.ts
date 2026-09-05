import type { ContextCompiler } from "../../context/memory/index.js"
import type { PreparedAgentContext } from "../../context/agent/index.js"
import type {
  ProviderAdapter,
  ProviderEventObserver
} from "../../provider/index.js"
import type {
  ApplicationScopeBinding,
  ExecutionEnvironmentBinding,
  MessagePart,
  SchedulerJobRecord,
  RunControlPolicy,
  SessionId,
  SessionInputIntent,
  SessionInputOrigin,
  SessionMessageRecord,
  SessionRecord,
  SessionScope,
  SubmitSessionTurnRequest,
  SubmitSessionTurnReceipt,
  SessionTurnExecutionBinding,
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
import type {
  SessionTurnAgentContextIdentity,
  SessionTurnAgentContextResolver
} from "../worker/types.js"
import type { TurnControlEventObserver } from "../worker/turn-control-observer.js"
import type { AgentRuntimeExecutionStageObserver } from "../stage.js"

export interface WanexAgentRuntimeOptions {
  readonly storage: CoreStore
  readonly workerId?: string
  readonly queue?: string
  readonly leaseMs?: number
  readonly heartbeatIntervalMs?: number
  readonly timeoutMs?: number
  readonly tools?: ToolRegistry
  readonly toolPermissionPolicy?: ToolPermissionPolicy
  readonly recovery?: SessionTurnRecoveryBinding
  readonly toolMaxConcurrency?: number
  readonly contextCompiler?: ContextCompiler
  readonly agentContext?: PreparedAgentContext
  readonly modelEndpointId?: string
  readonly secretResolver?: SecretResolverPort
  readonly provider?: ProviderAdapter
  readonly fakeResponseText?: string
  readonly observeProviderEvent?: ProviderEventObserver
  readonly observeExecutionStage?: AgentRuntimeExecutionStageObserver
  readonly resolveAgentContext?: SessionTurnAgentContextResolver
  /** @internal */
  readonly activeAbortRegistry?: ActiveExecutionAbortRegistry
  /** @internal */
  readonly turnControlObserver?: TurnControlEventObserver
}

export interface SubmitUserTurnRequest {
  readonly content: readonly UserMessageInputPart[]
  readonly sessionId?: SessionId
  readonly sessionScope?: SessionScope
  readonly title?: string
  readonly principalId?: string
  readonly idempotencyKey?: string
  readonly inputId?: string
  readonly turnId?: string
  readonly jobId?: string
  readonly jobIdempotencyKey?: string
  readonly budgetGrantId?: string
  readonly modelEndpointId?: string
  readonly maxSteps?: number
  readonly maxOutputTokens?: number
  readonly executionEnvironment?: ExecutionEnvironmentBinding
  readonly applicationScope?: ApplicationScopeBinding
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

export interface PreparedUserTurn {
  readonly session: SessionRecord
  readonly inputId: string
  readonly turnId: string
  readonly request: SubmitSessionTurnRequest
  readonly context: PreparedSessionTurnContext
}

export interface PreparedSessionTurnContext {
  readonly identity?: SessionTurnAgentContextIdentity
  commit(): void
  rollback(): void
}

export interface PrepareSessionTurnExecutionBindingRequest {
  readonly sessionId: SessionId
  readonly inputId: string
  readonly turnId: string
  readonly content: readonly MessagePart[]
  readonly origin?: SessionInputOrigin
  /** Reuses a parent Turn's exact dynamic context without acquiring ownership. */
  readonly inheritedContextBinding?: SessionTurnExecutionBinding
  /** Reuses the parent's process-local dynamic context generation exactly. */
  readonly inheritedContextIdentity?: SessionTurnAgentContextIdentity
  readonly modelEndpointId?: string
  readonly maxOutputTokens?: number
  readonly executionEnvironment?: ExecutionEnvironmentBinding
  readonly applicationScope?: ApplicationScopeBinding
}

export interface PreparedSessionTurnExecutionBinding {
  readonly binding: SessionTurnExecutionBinding
  readonly context: PreparedSessionTurnContext
}

export interface AgentRunOnceResult {
  readonly worker: WorkerRunOnceResult
  readonly job?: SchedulerJobRecord
}

export interface SubmitAndRunUserTurnResult extends SubmitUserTurnResult {
  readonly run: AgentRunOnceResult
  readonly messages: readonly SessionMessageRecord[]
}
