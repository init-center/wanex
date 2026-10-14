import type {
  JsonValue,
  MediaGenerationOperationBinding,
  MediaGenerationOperationRecord,
  MediaGenerationOutputModality,
  MediaGenerationProviderOutputReference,
  MediaGenerationOperation,
  ModelEndpoint,
  ModelEndpointExecutionBinding,
  ResourceInputEvidence,
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

/** An input resource whose bytes the runtime read and verified against its digest. */
export interface MediaGenerationInput {
  readonly resource: ResourceInputEvidence
  readonly bytes: Uint8Array
}

/**
 * Only submission carries input bytes: adapters never read Storage, and polls
 * and materialization do not need the inputs again.
 */
export interface MediaGenerationSubmitRequest extends MediaGenerationAdapterRequest {
  readonly inputs: readonly MediaGenerationInput[]
}

export type MediaGenerationSubmitResult =
  | { readonly status: "rejected"; readonly error: JsonValue }
  | {
      readonly status: "accepted"
      readonly externalOperationId: string
      readonly providerCheckpoint?: JsonValue
      readonly pollAfterMs?: number
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
      readonly pollAfterMs?: number
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
  readonly protocolId: string
  canExecute(modelEndpoint: ModelEndpoint): boolean
  submit(request: MediaGenerationSubmitRequest): Promise<MediaGenerationSubmitResult>
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
  readonly operation: MediaGenerationOperation
  readonly modelEndpoint: ModelEndpointExecutionBinding
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
  readonly pollInitialDelayMs?: number
  readonly pollMaxDelayMs?: number
  readonly maxConsecutivePollFailures?: number
}

export interface MediaGenerationRunResult {
  readonly status: "idle" | "suspended" | "completed" | "failed"
  readonly operation?: MediaGenerationOperationRecord
  readonly error?: Error
}

/** Optional execution implementation supplied by the trusted composition root. */
export interface MediaGenerationCapability {
  supports(modelEndpoint: ModelEndpoint): boolean
  createWorkers(options: {
    readonly storage: import("@wanex/storage").CoreStore
    readonly activeAbortRegistry: import("../jobs/active-abort.js").ActiveExecutionAbortRegistry
    readonly leaseMs?: number
    readonly heartbeatIntervalMs?: number
    readonly timeoutMs?: number
  }): readonly MediaGenerationWorker[]
}

export type MediaGenerationWorker = Pick<
  import("./runtime.js").WanexMediaGenerationRuntime,
  "submit" | "cancel" | "runOnce" | "start"
>
