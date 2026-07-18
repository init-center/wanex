export type WanexAppStorageMode = "oneshot" | "persistent"

export type WanexAppJobStatus =
  | "pending"
  | "ready"
  | "running"
  | "succeeded"
  | "retry_scheduled"
  | "failed"
  | "cancelled"

export type WanexAppStorageConfig =
  | {
      readonly kind: "local-system-service"
      readonly mode?: WanexAppStorageMode
      readonly storeDir: string
      readonly serviceBin: string
    }
  | {
      readonly kind: "local-profile"
      readonly mode?: WanexAppStorageMode
      readonly rootDir: string
      readonly profileId?: string
      readonly serviceBin: string
    }
  | {
      readonly kind: "remote-http"
      readonly endpoint: string
      readonly token: string
      readonly timeoutMs?: number
    }

export type WanexAppProviderProfileKind =
  | "fake"
  | "openai-compatible"
  | "anthropic"
  | "deepseek"

export interface WanexAppProviderOptions {
  readonly id?: string
  readonly kind?: WanexAppProviderProfileKind
  readonly providerId?: string
  readonly modelId?: string
  readonly baseUrl?: string
  readonly apiKey?: string
  readonly anthropicVersion?: string
}

export interface WanexAppOptions {
  readonly storage: WanexAppStorageConfig
  readonly provider?: WanexAppProviderOptions
}

export interface WanexAppRunRequest {
  readonly text: string
  readonly sessionId?: string
  readonly principalId?: string
}

export interface WanexAppRunResult {
  readonly sessionId: string
  readonly assistantText: string
  readonly messageCount: number
  readonly jobStatuses: readonly WanexAppJobStatus[]
}

export interface WanexAppStatus {
  readonly disposed: boolean
  readonly providerProfileId: string
  readonly activeProviderProfileId: string
}

export interface WanexApp {
  status(): WanexAppStatus
  run(request: WanexAppRunRequest): Promise<WanexAppRunResult>
  dispose(): Promise<void>
}
