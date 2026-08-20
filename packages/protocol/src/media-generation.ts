import type { PrincipalId, ResourceId } from "./ids.js"
import type {
  ModelEndpoint,
  ModelInputModality,
  ModelOperation,
  ModelOutputModality
} from "./provider.js"
import type { ResourceInputEvidence, ResourceKind } from "./resource.js"
import type { JsonValue } from "./json.js"
import type { SchedulerJobRecord } from "./scheduler.js"

export type MediaGenerationOutputModality = Exclude<
  ModelOutputModality,
  "text"
>

export type MediaGenerationOperation = Extract<
  ModelOperation,
  | "image.generate"
  | "image.edit"
  | "video.generate"
  | "audio.synthesize"
>

export type MediaGenerationOperationState =
  | "queued"
  | "submitting"
  | "polling"
  | "materializing"
  | "cancel_requested"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "recovery_required"

export type MediaGenerationModelEndpoint = ModelEndpoint & {
  readonly model: ModelEndpoint["model"] & {
    readonly inputModalities: readonly ModelInputModality[]
    readonly outputModalities: readonly MediaGenerationOutputModality[]
  }
}

export interface MediaGenerationRequestBinding {
  readonly operation: MediaGenerationOperation
  readonly prompt: string
  readonly outputModality: MediaGenerationOutputModality
  readonly inputResources: readonly ResourceInputEvidence[]
  readonly options: JsonValue
}

export interface MediaGenerationOperationBinding {
  readonly endpointId: string
  readonly endpointDigest: string
  readonly connection: ModelEndpoint["connection"]
  readonly protocol: ModelEndpoint["protocol"]
  readonly model: ModelEndpoint["model"]
  readonly request: MediaGenerationRequestBinding
  readonly requestDigest: string
}

export interface MediaGenerationProviderOutputReferenceBase {
  readonly mediaType?: string
  readonly kind?: ResourceKind
  readonly label?: string
  readonly metadata?: JsonValue
  readonly width?: number
  readonly height?: number
  readonly durationMs?: number
}

export type MediaGenerationProviderOutputReference =
  | MediaGenerationProviderFileReference
  | MediaGenerationRemoteUrlReference

export interface MediaGenerationProviderFileReference
  extends MediaGenerationProviderOutputReferenceBase {
  readonly kindOfReference: "provider_file"
  readonly provider: string
  readonly fileId: string
}

export interface MediaGenerationRemoteUrlReference
  extends MediaGenerationProviderOutputReferenceBase {
  readonly kindOfReference: "remote_url"
  readonly url: string
  readonly expiresAt?: number
}

export interface MediaGenerationOutputReferenceRecord
  extends MediaGenerationProviderOutputReferenceBase {
  readonly kindOfReference: MediaGenerationProviderOutputReference["kindOfReference"]
  readonly provider?: string
  readonly providerFileId?: string
  readonly sourceUrl?: string
  readonly sourceExpiresAt?: number
}

export interface MediaGenerationOperationRecord {
  readonly id: string
  readonly jobId: string
  readonly principalId: PrincipalId
  readonly idempotencyKey: string
  readonly conversation?: MediaGenerationConversationRelation
  readonly state: MediaGenerationOperationState
  readonly binding: MediaGenerationOperationBinding
  readonly dispatchAttempt: number
  readonly externalOperationId?: string
  readonly providerCheckpoint?: JsonValue
  readonly pollCount: number
  readonly consecutivePollFailures: number
  readonly nextPollAt?: number
  readonly lastPollError?: JsonValue
  readonly outputReferences: readonly MediaGenerationOutputReferenceRecord[]
  readonly outputResourceIds: readonly ResourceId[]
  readonly progress?: JsonValue
  readonly error?: JsonValue
  readonly cancelRequestedAt?: number
  readonly cancelReason?: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
}

export interface MediaGenerationConversationRelation {
  readonly sessionId: string
  readonly turnId: string
  readonly sourceMessageId: string
  readonly toolExecutionId: string
  readonly toolCallId: string
}

export interface SubmitMediaGenerationOperationRequest {
  readonly id?: string
  readonly jobId?: string
  readonly principalId: PrincipalId
  readonly idempotencyKey: string
  readonly binding: MediaGenerationOperationBinding
  readonly priority?: number
}

export interface MediaGenerationOperationSubmission {
  readonly operation: MediaGenerationOperationRecord
  readonly job: SchedulerJobRecord
}

export interface BeginMediaGenerationOperationRequest {
  readonly operationId: string
  readonly workerId: string
  readonly leaseToken: string
}

export type MediaGenerationBeginAction =
  | "started"
  | "resume_polling"
  | "resume_materializing"
  | "cancel"
  | "recovery_required"
  | "terminal"

export interface MediaGenerationBeginReceipt {
  readonly operation: MediaGenerationOperationRecord
  readonly job: SchedulerJobRecord
  readonly action: MediaGenerationBeginAction
}

export interface AcceptMediaGenerationOperationRequest {
  readonly operationId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly externalOperationId: string
  readonly providerCheckpoint?: JsonValue
}

export type MediaGenerationSuspensionOutcome =
  | "scheduled"
  | "pending"
  | "transient_error"

export type MediaGenerationTerminalPollOutcome =
  | "none"
  | "completed"
  | "provider_failure"
  | "transient_error"

export interface SuspendMediaGenerationOperationRequest {
  readonly operationId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly delayMs: number
  readonly outcome: MediaGenerationSuspensionOutcome
  readonly providerCheckpoint?: JsonValue
  readonly progress?: JsonValue
  readonly error?: JsonValue
}

export type MediaGenerationSuspendAction = "suspended" | "cancel"

export interface MediaGenerationSuspendReceipt {
  readonly operation: MediaGenerationOperationRecord
  readonly job: SchedulerJobRecord
  readonly action: MediaGenerationSuspendAction
}

export interface RecordMediaGenerationOutputsRequest {
  readonly operationId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly pollOutcome: MediaGenerationTerminalPollOutcome
  readonly outputReferences: readonly MediaGenerationOutputReferenceRecord[]
  readonly progress?: JsonValue
}

export interface CompleteMediaGenerationOperationRequest {
  readonly operationId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly pollOutcome: MediaGenerationTerminalPollOutcome
  readonly outputResourceIds: readonly ResourceId[]
  readonly result?: JsonValue
}

export type MediaGenerationTerminalOutcome =
  | "failed"
  | "cancelled"
  | "recovery_required"

export interface SettleMediaGenerationOperationRequest {
  readonly operationId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly pollOutcome: MediaGenerationTerminalPollOutcome
  readonly outcome: MediaGenerationTerminalOutcome
  readonly error?: JsonValue
  readonly reason?: string
}

export interface RequestMediaGenerationCancelRequest {
  readonly operationId: string
  readonly reason: string
}

export interface GetMediaGenerationOperationRequest {
  readonly operationId: string
}

export interface ListMediaGenerationOperationsRequest {
  readonly principalId?: PrincipalId
  readonly state?: MediaGenerationOperationState
  readonly limit?: number
}
