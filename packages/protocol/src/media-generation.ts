import type { PrincipalId, ResourceId } from "./ids.js"
import type {
  ProviderInputModality,
  ProviderOutputModality
} from "./provider.js"
import type { ResourceInputEvidence, ResourceKind } from "./resource.js"
import type { JsonValue } from "./json.js"
import type { SchedulerJobRecord } from "./scheduler.js"

export type MediaGenerationOutputModality = Exclude<
  ProviderOutputModality,
  "text"
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

export interface MediaGenerationProviderProfile {
  readonly id: string
  readonly adapterId: string
  readonly providerId: string
  readonly modelId: string
  readonly input: readonly ProviderInputModality[]
  readonly output: readonly MediaGenerationOutputModality[]
}

export interface MediaGenerationRequestBinding {
  readonly prompt: string
  readonly outputModality: MediaGenerationOutputModality
  readonly inputResources: readonly ResourceInputEvidence[]
  readonly options: JsonValue
}

export interface MediaGenerationOperationBinding {
  readonly profileId: string
  readonly profileDigest: string
  readonly adapterId: string
  readonly providerId: string
  readonly modelId: string
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
  readonly state: MediaGenerationOperationState
  readonly binding: MediaGenerationOperationBinding
  readonly dispatchAttempt: number
  readonly externalOperationId?: string
  readonly providerCheckpoint?: JsonValue
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

export interface CheckpointMediaGenerationOperationRequest {
  readonly operationId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly providerCheckpoint?: JsonValue
  readonly progress?: JsonValue
}

export interface RecordMediaGenerationOutputsRequest {
  readonly operationId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly outputReferences: readonly MediaGenerationOutputReferenceRecord[]
  readonly progress?: JsonValue
}

export interface CompleteMediaGenerationOperationRequest {
  readonly operationId: string
  readonly workerId: string
  readonly leaseToken: string
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
