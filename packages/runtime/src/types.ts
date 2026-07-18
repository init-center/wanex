import type {
  CreateStorageConfig,
  LocalSystemServiceStorageMode,
  StorageHandle
} from "@wanex/storage"
import type { ProviderEventObserver } from "./provider/index.js"

export type WanexRuntimeStorageMode = LocalSystemServiceStorageMode

export type WanexRuntimeStorageConfig =
  | CreateStorageConfig
  | {
      readonly kind: "injected"
      readonly handle: Pick<StorageHandle, "core" | "transport">
    }

export type WanexRuntimeProviderProfileKind =
  | "fake"
  | "openai-compatible"
  | "anthropic"
  | "deepseek"

export type WanexRuntimeProviderOptions =
  | {
      readonly kind?: "fake"
      readonly id?: string
      readonly providerId?: string
      readonly modelId?: string
      readonly responseText?: string
    }
  | {
      readonly kind: "openai-compatible" | "anthropic" | "deepseek"
      readonly id?: string
      readonly providerId?: string
      readonly modelId: string
      readonly baseUrl?: string
      readonly apiKey?: string
      readonly anthropicVersion?: string
    }

export interface WanexRuntimeOptions {
  readonly storage: WanexRuntimeStorageConfig
  readonly provider?: WanexRuntimeProviderOptions
  readonly workerCount?: number
  readonly leaseMs?: number
  readonly heartbeatIntervalMs?: number
  readonly timeoutMs?: number
  readonly idleIntervalMs?: number
  readonly errorIntervalMs?: number
  readonly observeProviderEvent?: ProviderEventObserver
}

export interface WanexRuntimeSubmitRequest {
  readonly text: string
  readonly sessionId?: string
  readonly title?: string
  readonly principalId?: string
  readonly mode?: "once" | "to_completion"
  readonly maxSteps?: number
}

export type WanexRuntimeRunRequest = WanexRuntimeSubmitRequest

export interface WanexRuntimeSubmitResult {
  readonly sessionId: string
  readonly inputId: string
  readonly jobId: string
}

export interface WanexRuntimeRunResult extends WanexRuntimeSubmitResult {
  readonly jobState: WanexRuntimeJobState
  readonly assistantText: string
  readonly messageCount: number
  readonly workerResults: readonly WanexRuntimeWorkerResultStatus[]
}

export type WanexRuntimeJobState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"

export type WanexRuntimeWorkerResultStatus = "idle" | "completed" | "failed"

export interface WanexRuntimeRunOnceResult {
  readonly workerResults: readonly WanexRuntimeWorkerResultStatus[]
}

export interface WanexRuntimeStatus {
  readonly disposed: boolean
  readonly started: boolean
  readonly workerCount: number
  readonly providerProfileId: string
  readonly providerKind: WanexRuntimeProviderProfileKind
  readonly modelId: string
}

export interface WanexRuntimeHealth {
  readonly generatedAt: number
  readonly started: boolean
  readonly workerCount: number
  readonly loopCount: number
  readonly activeLoopCount: number
  readonly stoppedLoopCount: number
}

export interface WanexRuntime {
  status(): WanexRuntimeStatus
  health(now?: number): WanexRuntimeHealth
  submit(request: WanexRuntimeSubmitRequest): Promise<WanexRuntimeSubmitResult>
  runOnce(): Promise<WanexRuntimeRunOnceResult>
  run(request: WanexRuntimeRunRequest): Promise<WanexRuntimeRunResult>
  start(): void
  stop(): Promise<void>
  dispose(): Promise<void>
}
