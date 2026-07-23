import type {
  JsonValue,
  MediaGenerationOperationBinding,
  MediaGenerationOperationRecord,
  MediaGenerationOutputModality,
  MediaGenerationProviderOutputReference,
  MediaGenerationProviderProfile,
  ResourceKind
} from "@wanex/protocol"

export type MediaGenerationProviderOutput =
  | MediaGenerationInlineBytesOutput
  | MediaGenerationBase64Output
  | MediaGenerationProviderFileOutput
  | MediaGenerationRemoteUrlOutput

export interface MediaGenerationProviderOutputBase {
  readonly mediaType?: string
  readonly kind?: ResourceKind
  readonly label?: string
  readonly metadata?: JsonValue
  readonly width?: number
  readonly height?: number
  readonly durationMs?: number
}

export interface MediaGenerationInlineBytesOutput
  extends MediaGenerationProviderOutputBase {
  readonly kindOfOutput: "inline_bytes"
  readonly bytes: Uint8Array
}

export interface MediaGenerationBase64Output
  extends MediaGenerationProviderOutputBase {
  readonly kindOfOutput: "base64"
  readonly data: string
}

export interface MediaGenerationProviderFileOutput
  extends MediaGenerationProviderOutputBase {
  readonly kindOfOutput: "provider_file"
  readonly provider: string
  readonly fileId: string
}

export interface MediaGenerationRemoteUrlOutput
  extends MediaGenerationProviderOutputBase {
  readonly kindOfOutput: "remote_url"
  readonly provider?: string
  readonly url: string
  readonly expiresAt?: number
}

export interface MediaGenerationAdapterRequest {
  readonly operationId: string
  readonly binding: MediaGenerationOperationBinding
  readonly signal: AbortSignal
}

export type MediaGenerationSubmitResult =
  | { readonly status: "rejected"; readonly error: JsonValue }
  | {
      readonly status: "accepted"
      readonly externalOperationId: string
      readonly providerCheckpoint?: JsonValue
    }
  | {
      readonly status: "completed"
      readonly outputs: readonly MediaGenerationProviderOutput[]
    }

export type MediaGenerationPollResult =
  | {
      readonly status: "pending"
      readonly providerCheckpoint?: JsonValue
      readonly progress?: JsonValue
    }
  | {
      readonly status: "completed"
      readonly outputs: readonly MediaGenerationProviderOutput[]
    }
  | { readonly status: "failed"; readonly error: JsonValue }

export interface MediaGenerationMaterializedOutput {
  readonly bytes: Uint8Array
  readonly mediaType?: string
  readonly kind?: ResourceKind
  readonly label?: string
  readonly metadata?: JsonValue
  readonly width?: number
  readonly height?: number
  readonly durationMs?: number
}

export interface MediaGenerationAdapter {
  readonly profile: MediaGenerationProviderProfile
  submit(request: MediaGenerationAdapterRequest): Promise<MediaGenerationSubmitResult>
  poll(
    request: MediaGenerationAdapterRequest & {
      readonly externalOperationId: string
      readonly providerCheckpoint?: JsonValue
    }
  ): Promise<MediaGenerationPollResult>
  cancel?(
    request: MediaGenerationAdapterRequest & {
      readonly externalOperationId?: string
    }
  ): Promise<void>
  materialize?(
    reference: MediaGenerationProviderOutputReference,
    request: MediaGenerationAdapterRequest
  ): Promise<MediaGenerationMaterializedOutput>
}

export interface SubmitMediaGenerationRequest {
  readonly providerProfileId: string
  readonly principalId?: string
  readonly idempotencyKey?: string
  readonly prompt: string
  readonly outputModality: MediaGenerationOutputModality
  readonly inputResourceIds?: readonly string[]
  readonly options?: JsonValue
  readonly priority?: number
}

export interface MediaGenerationRuntimeOptions {
  readonly storage: import("@wanex/storage").CoreStore
  readonly adapters: readonly MediaGenerationAdapter[]
  readonly workerId?: string
  readonly leaseMs?: number
  readonly heartbeatIntervalMs?: number
  readonly timeoutMs?: number
  readonly activeAbortRegistry?: import("../jobs/active-abort.js").ActiveExecutionAbortRegistry
  readonly maxOutputBytes?: number
}

export interface MediaGenerationRunResult {
  readonly status: "idle" | "completed" | "failed"
  readonly operation?: MediaGenerationOperationRecord
  readonly error?: Error
}
