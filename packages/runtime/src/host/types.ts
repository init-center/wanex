import type {
  AgentRunOnceResult,
  PrepareSessionTurnExecutionBindingRequest,
  PreparedSessionTurnExecutionBinding
} from "../execution/agent-runtime/index.js"
import type { PreparedAgentContext } from "../context/agent/index.js"
import type { ContextCompiler } from "../context/memory/index.js"
import type {
  ProviderAdapter,
  ProviderEventObserver
} from "../provider/index.js"
import type { AgentRuntimeExecutionStageObserver } from "../execution/stage.js"
import type { CreateStorageConfig, CoreStore } from "@wanex/storage"
import type { ToolPermissionPolicy, ToolRegistry } from "../tools/index.js"
import type {
  EphemeralQueryRequest,
  EphemeralQueryResult,
  RuntimeAbortSignal,
  SessionTurnRecoveryBinding
} from "@wanex/protocol"
import type {
  RuntimeHostMemoryCompactionOptions,
  RuntimeHostMemoryRunOnceResult
} from "./memory-compaction.js"
import type { SecretResolverPort } from "../secrets/index.js"
import type { SessionTurnAgentContextResolver } from "../execution/worker/index.js"
import type {
  MediaGenerationAdapter,
  MediaGenerationRunResult,
  SubmitMediaGenerationRequest
} from "../media-generation/index.js"
import type {
  MediaGenerationOperationRecord,
  MediaGenerationOperationSubmission
} from "@wanex/protocol"

export type WanexRuntimeHostOptions = WanexRuntimeHostStorageOptions &
  WanexRuntimeHostBehaviorOptions

export type WanexRuntimeHostStorageOptions =
  | {
      readonly storage: CoreStore
      readonly storageConfig?: never
    }
  | {
      readonly storage?: never
      readonly storageConfig: CreateStorageConfig
    }

export interface WanexRuntimeHostBehaviorOptions {
  readonly workerCount?: number
  readonly agentQueue?: string
  readonly memoryCompaction?: RuntimeHostMemoryCompactionOptions
  readonly modelEndpointId?: string
  readonly secretResolver?: SecretResolverPort
  readonly provider?: ProviderAdapter
  readonly tools?: ToolRegistry
  readonly toolPermissionPolicy?: ToolPermissionPolicy
  readonly recovery?: SessionTurnRecoveryBinding
  readonly toolMaxConcurrency?: number
  readonly contextCompiler?: ContextCompiler
  readonly agentContext?: PreparedAgentContext
  readonly fakeResponseText?: string
  readonly leaseMs?: number
  readonly heartbeatIntervalMs?: number
  readonly timeoutMs?: number
  readonly idleIntervalMs?: number
  readonly errorIntervalMs?: number
  readonly observeProviderEvent?: ProviderEventObserver
  readonly observeExecutionStage?: AgentRuntimeExecutionStageObserver
  readonly observeSessionTurnLifecycle?: RuntimeHostSessionTurnLifecycleObserver
  readonly resolveAgentContext?: SessionTurnAgentContextResolver
  readonly mediaGenerationAdapters?: readonly MediaGenerationAdapter[]
  readonly mediaGenerationWorkerCount?: number
  readonly mediaGenerationMaxOutputBytes?: number
  readonly mediaGenerationPollInitialDelayMs?: number
  readonly mediaGenerationPollMaxDelayMs?: number
  readonly mediaGenerationMaxConsecutivePollFailures?: number
}

export type RuntimeHostSessionTurnLifecycleObserver = (
  signal: RuntimeHostSessionTurnLifecycleSignal
) => void

export interface RuntimeHostSessionTurnLifecycleSignal {
  readonly kind: "wanex-runtime.session-turn-lifecycle"
  readonly phase: "suspended" | "terminal"
  readonly reference: RuntimeHostSessionTurnReference
}

export interface RuntimeHostSessionTurnReference {
  readonly sessionId: string
  readonly inputId: string
  readonly turnId: string
  readonly jobId: string
}

export interface RuntimeHostStatus {
  readonly started: boolean
  readonly workerCount: number
  readonly memoryWorkerCount: number
  readonly mediaGenerationWorkerCount: number
}

export type RuntimeHostLoopKind = "agent" | "memory" | "media_generation"

export type RuntimeHostLoopResultStatus = "idle" | "completed" | "failed"

export interface RuntimeHostLoopHealth {
  readonly id: string
  readonly kind: RuntimeHostLoopKind
  readonly index: number
  readonly startedAt: number
  readonly stopped: boolean
  readonly runCount: number
  readonly idleCount: number
  readonly completedCount: number
  readonly failedCount: number
  readonly errorCount: number
  readonly lastResultStatus?: RuntimeHostLoopResultStatus
  readonly lastResultAt?: number
  readonly lastErrorAt?: number
}

export interface RuntimeHostHealthSnapshot {
  readonly generatedAt: number
  readonly started: boolean
  readonly workerCount: number
  readonly memoryWorkerCount: number
  readonly mediaGenerationWorkerCount: number
  readonly loopCount: number
  readonly activeLoopCount: number
  readonly stoppedLoopCount: number
  readonly activeExecutionCount: number
  readonly loops: readonly RuntimeHostLoopHealth[]
}

export interface RuntimeHostHealthSnapshotRequest {
  readonly now?: number
}

export interface RuntimeHostRunOnceResult {
  readonly results: readonly AgentRunOnceResult[]
  readonly memory?: RuntimeHostMemoryRunOnceResult
  readonly mediaGeneration?: readonly MediaGenerationRunResult[]
}

export type RuntimeHostSubmitMediaGenerationResult =
  MediaGenerationOperationSubmission
export type RuntimeHostMediaGenerationRequest = SubmitMediaGenerationRequest
export type RuntimeHostMediaGenerationRecord = MediaGenerationOperationRecord
export type RuntimeHostPrepareExecutionBindingRequest =
  PrepareSessionTurnExecutionBindingRequest
export type RuntimeHostPreparedExecutionBinding =
  PreparedSessionTurnExecutionBinding

export interface RuntimeHostEphemeralQueryRequest extends EphemeralQueryRequest {
  readonly signal?: RuntimeAbortSignal
}
export type RuntimeHostEphemeralQueryResult = EphemeralQueryResult

export interface RuntimeHostJobSummaryRequest {
  readonly now?: number
  readonly jobLimit?: number
}
