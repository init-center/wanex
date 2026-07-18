import type {
  EnqueueJobRequest,
  JsonValue,
  PrincipalId,
  RetryPolicy,
  SchedulerJobRecord,
  ConnectorSessionState,
  ChannelProjectionTarget
} from "@wanex/protocol"
import type { ConnectorRuntimeStorage } from "./storage.js"

export interface ConnectorRuntimeOptions {
  readonly storage: ConnectorRuntimeStorage
}

export interface RegisterConnectorRequest {
  readonly id?: string
  readonly connectorId: string
  readonly pluginId: string
  readonly version?: string
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface PutConnectorCredentialRefRequest {
  readonly id?: string
  readonly connectorId: string
  readonly kind: string
  readonly secretRef: string
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface StartConnectorSessionLeaseRequest {
  readonly id?: string
  readonly connectorId: string
  readonly credentialId: string
  readonly ownerId: string
  readonly leaseMs: number
  readonly state?: Extract<ConnectorSessionState, "connecting" | "connected">
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface HeartbeatConnectorSessionLeaseRequest {
  readonly sessionId: string
  readonly ownerId: string
  readonly leaseToken: string
  readonly leaseMs: number
  readonly state?: Extract<ConnectorSessionState, "connecting" | "connected">
  readonly metadata?: JsonValue
}

export interface FinishConnectorSessionLeaseRequest {
  readonly sessionId: string
  readonly ownerId: string
  readonly leaseToken: string
  readonly state: Extract<ConnectorSessionState, "disconnected" | "failed">
  readonly metadata?: JsonValue
  readonly error?: JsonValue
}

export interface BindExternalIdentityRequest {
  readonly id?: string
  readonly connectorId: string
  readonly channelKind: string
  readonly channelId: string
  readonly externalIdentityId: string
  readonly principalId: PrincipalId
  readonly displayName?: string
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface IngestConnectorEventRequest {
  readonly id?: string
  readonly connectorId: string
  readonly channelKind: string
  readonly channelId: string
  readonly externalEventId: string
  readonly externalThreadId?: string
  readonly senderExternalIdentityId: string
  readonly principalId?: PrincipalId
  readonly payload: JsonValue
  readonly metadata?: JsonValue
  readonly receivedAt?: number
  readonly idempotencyKey?: string
}

export interface SubmitConnectorDeliveryRequest {
  readonly id?: string
  readonly connectorId: string
  readonly channelKind: string
  readonly channelId: string
  readonly targetExternalIdentityId?: string
  readonly externalThreadId?: string
  readonly principalId: PrincipalId
  readonly payload: JsonValue
  readonly metadata?: JsonValue
  readonly jobId?: string
  readonly idempotencyKey?: string
  readonly scheduledAt?: number
  readonly notBefore?: number
  readonly priority?: number
  readonly maxAttempts?: number
  readonly retryPolicy?: RetryPolicy
  readonly budgetGrantId?: string
}

export interface CompleteConnectorDeliveryRequest {
  readonly deliveryId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly result?: JsonValue
  readonly metadata?: JsonValue
}

export interface FailConnectorDeliveryRequest {
  readonly deliveryId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly error: JsonValue
  readonly metadata?: JsonValue
}

export interface ProjectConnectorEventRequest {
  readonly id?: string
  readonly inboundEventId: string
  readonly target: ChannelProjectionTarget
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface ConnectorDeliveryJobPayload {
  readonly deliveryId: string
  readonly connectorId: string
  readonly channelKind: string
  readonly channelId: string
  readonly targetExternalIdentityId?: string
  readonly externalThreadId?: string
  readonly payload: JsonValue
}

export interface ConnectorDeliveryHandlerContext {
  readonly job: SchedulerJobRecord
  readonly delivery: ConnectorDeliveryJobPayload
  readonly signal: AbortSignal
  heartbeat(): Promise<void>
}

export type ConnectorDeliveryHandler = (
  context: ConnectorDeliveryHandlerContext
) => Promise<JsonValue | void> | JsonValue | void

export type ConnectorRetryPolicy = EnqueueJobRequest["retryPolicy"]
