import type {
  LocalSystemServiceStorageMode,
  StorageHandle
} from "@wanex/storage"
import type { ProviderEventObserver } from "./provider/index.js"
import type { SecretResolverPort } from "./secrets/index.js"
import type {
  ProviderCapabilities,
  UserMessageInputPart
} from "@wanex/protocol"

export type WanexRuntimeStorageMode = LocalSystemServiceStorageMode

export type WanexRuntimeStorageConfig =
  | {
      readonly kind: "local-system-service"
      readonly mode?: LocalSystemServiceStorageMode
      readonly storeDir: string
      readonly serviceBin?: string
    }
  | {
      readonly kind: "local-profile"
      readonly mode?: LocalSystemServiceStorageMode
      readonly rootDir: string
      readonly profileId?: string
      readonly serviceBin?: string
    }
  | {
      readonly kind: "remote-http"
      readonly endpoint: string
      readonly token: string
      readonly timeoutMs?: number
    }
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
      readonly capabilities?: ProviderCapabilities
    }
  | {
      readonly kind: "openai-compatible" | "anthropic" | "deepseek"
      readonly id?: string
      readonly providerId?: string
      readonly modelId: string
      readonly baseUrl?: string
      readonly secretRef?: string
      readonly anthropicVersion?: string
      readonly capabilities: ProviderCapabilities
    }

export interface WanexRuntimeOptions {
  readonly storage: WanexRuntimeStorageConfig
  readonly artifacts?: {
    readonly explicitPath?: string
    readonly env?: {
      readonly WANEX_SYSTEM_SERVICE_BIN?: string
    }
    readonly manifest?: unknown
    readonly artifactDir?: string
  }
  readonly provider?: WanexRuntimeProviderOptions
  readonly secretResolver?: SecretResolverPort
  readonly workerCount?: number
  readonly leaseMs?: number
  readonly heartbeatIntervalMs?: number
  readonly timeoutMs?: number
  readonly idleIntervalMs?: number
  readonly errorIntervalMs?: number
  readonly observeProviderEvent?: ProviderEventObserver
}

export interface WanexRuntimeSubmitRequest {
  readonly content: readonly UserMessageInputPart[]
  readonly sessionId?: string
  readonly title?: string
  readonly principalId?: string
  readonly maxSteps?: number
}

export type WanexRuntimeRunRequest = WanexRuntimeSubmitRequest

export interface WanexRuntimeOperationReference {
  readonly sessionId: string
  readonly inputId: string
  readonly turnId: string
  readonly jobId: string
}

export interface WanexRuntimeSubmitResult
  extends WanexRuntimeOperationReference {}

export interface WanexRuntimeReadOperationRequest
  extends WanexRuntimeOperationReference {}

export type WanexRuntimeOperationState =
  | "queued"
  | "running"
  | "cancel_requested"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "recovery_required"

export interface WanexRuntimeOperationReadModel
  extends WanexRuntimeOperationReference {
  readonly state: WanexRuntimeOperationState
  readonly createdAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
  readonly activeAttemptId?: string
  readonly assistantText: string
  readonly messageCount: number
}

export type WanexRuntimeReadOperationResult =
  | {
      readonly kind: "found"
      readonly reference: WanexRuntimeOperationReference
      readonly operation: WanexRuntimeOperationReadModel
    }
  | {
      readonly kind: "missing"
      readonly reference: WanexRuntimeOperationReference
    }

export interface WanexRuntimeCancelOperationRequest
  extends WanexRuntimeOperationReference {
  readonly reason: string
}

export interface WanexRuntimeCancelOperationResult
  extends WanexRuntimeOperationReference {
  readonly status:
    | "cancelled"
    | "cancel_requested"
    | "already_terminal"
    | "missing"
}

export interface WanexRuntimeRunResult
  extends WanexRuntimeOperationReference {
  readonly state: WanexRuntimeOperationState
  readonly assistantText: string
  readonly messageCount: number
  readonly workerResults: readonly WanexRuntimeWorkerResultStatus[]
}

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
  readOperation(
    request: WanexRuntimeReadOperationRequest
  ): Promise<WanexRuntimeReadOperationResult>
  cancelOperation(
    request: WanexRuntimeCancelOperationRequest
  ): Promise<WanexRuntimeCancelOperationResult>
  runOnce(): Promise<WanexRuntimeRunOnceResult>
  run(request: WanexRuntimeRunRequest): Promise<WanexRuntimeRunResult>
  start(): void
  stop(): Promise<void>
  dispose(): Promise<void>
}
