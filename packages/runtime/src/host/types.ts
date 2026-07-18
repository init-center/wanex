import type { AgentRunOnceResult } from "../execution/agent-runtime/index.js"
import type { ContextCompiler } from "../context/memory/index.js"
import type {
  ProviderAdapter,
  ProviderEventObserver
} from "../provider/index.js"
import type {
  CreateStorageConfig,
  CoreStore
} from "@wanex/storage"
import type {
  ToolPermissionPolicy,
  ToolRecoveryPolicy,
  ToolRegistry
} from "../tools/index.js"
import type {
  EphemeralQueryRequest,
  EphemeralQueryResult
} from "@wanex/protocol"
import type {
  RuntimeHostMemoryCompactionOptions,
  RuntimeHostMemoryRunOnceResult
} from "./memory-compaction.js"

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
  readonly memoryCompaction?: RuntimeHostMemoryCompactionOptions
  readonly providerProfileId?: string
  readonly provider?: ProviderAdapter
  readonly tools?: ToolRegistry
  readonly toolPermissionPolicy?: ToolPermissionPolicy
  readonly toolRecoveryPolicy?: ToolRecoveryPolicy
  readonly toolMaxConcurrency?: number
  readonly contextCompiler?: ContextCompiler
  readonly fakeResponseText?: string
  readonly leaseMs?: number
  readonly heartbeatIntervalMs?: number
  readonly timeoutMs?: number
  readonly idleIntervalMs?: number
  readonly errorIntervalMs?: number
  readonly observeProviderEvent?: ProviderEventObserver
}

export interface RuntimeHostStatus {
  readonly started: boolean
  readonly workerCount: number
  readonly memoryWorkerCount: number
}

export type RuntimeHostLoopKind = "agent" | "memory"

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
  readonly loopCount: number
  readonly activeLoopCount: number
  readonly stoppedLoopCount: number
  readonly loops: readonly RuntimeHostLoopHealth[]
}

export interface RuntimeHostHealthSnapshotRequest {
  readonly now?: number
}

export interface RuntimeHostRunOnceResult {
  readonly results: readonly AgentRunOnceResult[]
  readonly memory?: RuntimeHostMemoryRunOnceResult
}

export type RuntimeHostEphemeralQueryRequest = EphemeralQueryRequest
export type RuntimeHostEphemeralQueryResult = EphemeralQueryResult

export interface RuntimeHostJobSummaryRequest {
  readonly now?: number
  readonly jobLimit?: number
}
