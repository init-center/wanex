import type { PrincipalId } from "./ids.js"
import type { JsonValue } from "./json.js"
import type {
  RetryPolicy,
  SchedulerJobRecord
} from "./scheduler.js"

export type PluginCapability =
  | "resource.read"
  | "resource.write"
  | "workspace.change.propose"
  | "delegation.graph.read"
  | "delegation.graph.write"
  | "team.conversation.read"
  | "team.conversation.write"
  | "channel.connect"
  | "channel.receive"
  | "channel.deliver"
  | "config.read"
  | "config.write"
  | "network.fetch"

export type PluginManifestState = "registered" | "disabled"
export type PluginInstallState = "installed" | "disabled" | "removed"

export type ConnectorRegistrationState = "active" | "disabled"
export type ConnectorCredentialState = "active" | "revoked"
export type ConnectorSessionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "expired"
  | "failed"

export interface PluginManifestRecord {
  readonly id: string
  readonly pluginId: string
  readonly version: string
  readonly name?: string
  readonly entry?: JsonValue
  readonly capabilities: readonly PluginCapability[]
  readonly state: PluginManifestState
  readonly metadata?: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
  readonly disabledAt?: number
}

export interface PutPluginManifestRequest {
  readonly id?: string
  readonly pluginId: string
  readonly version: string
  readonly name?: string
  readonly entry?: JsonValue
  readonly capabilities: readonly PluginCapability[]
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface GetPluginManifestRequest {
  readonly pluginId: string
  readonly version?: string
}

export interface ListPluginManifestsRequest {
  readonly state?: PluginManifestState
  readonly capability?: PluginCapability
  readonly limit?: number
}

export interface UpdatePluginManifestStateRequest {
  readonly pluginId: string
  readonly version: string
  readonly state: PluginManifestState
}

export interface SubmitPluginActionRequest {
  readonly pluginId: string
  readonly version: string
  readonly actionId: string
  readonly principalId: PrincipalId
  readonly payload: JsonValue
  readonly requiredCapability?: PluginCapability
  readonly jobId?: string
  readonly jobIdempotencyKey?: string
  readonly scheduledAt?: number
  readonly notBefore?: number
  readonly priority?: number
  readonly maxAttempts?: number
  readonly retryPolicy?: RetryPolicy
  readonly budgetGrantId?: string
}

export interface PluginActionSubmission {
  readonly manifest: PluginManifestRecord
  readonly job: SchedulerJobRecord
}

export interface PluginInstallRecord {
  readonly id: string
  readonly pluginId: string
  readonly version: string
  readonly state: PluginInstallState
  readonly layout: JsonValue
  readonly trust: JsonValue
  readonly installRootDir: string
  readonly metadata?: JsonValue
  readonly installedAt: number
  readonly updatedAt: number
  readonly disabledAt?: number
  readonly removedAt?: number
}

export interface PutPluginInstallRequest {
  readonly id?: string
  readonly pluginId: string
  readonly version: string
  readonly layout: JsonValue
  readonly trust: JsonValue
  readonly installRootDir: string
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface ActivatePluginInstallRequest {
  readonly manifest: PutPluginManifestRequest
  readonly install: PutPluginInstallRequest
}

export interface PluginInstallActivation {
  readonly manifest: PluginManifestRecord
  readonly install: PluginInstallRecord
}

export interface GetPluginInstallRequest {
  readonly pluginId: string
  readonly version?: string
}

export interface ListPluginInstallsRequest {
  readonly pluginId?: string
  readonly state?: PluginInstallState
  readonly limit?: number
}

export interface UpdatePluginInstallStateRequest {
  readonly pluginId: string
  readonly version: string
  readonly expectedState: PluginInstallState
  readonly state: PluginInstallState
}

export interface GetPluginActionExecutionAdmissionRequest {
  readonly pluginId: string
  readonly version: string
  readonly requiredCapability: PluginCapability
}

export interface PluginActionExecutionAdmission {
  readonly manifest: PluginManifestRecord
  readonly install: PluginInstallRecord
}

export interface ConnectorRegistrationRecord {
  readonly id: string
  readonly connectorId: string
  readonly pluginId: string
  readonly pluginVersion: string
  readonly state: ConnectorRegistrationState
  readonly metadata?: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
  readonly disabledAt?: number
}

export interface ConnectorCredentialRecord {
  readonly id: string
  readonly connectorId: string
  readonly kind: string
  readonly secretRef: string
  readonly state: ConnectorCredentialState
  readonly metadata?: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
  readonly revokedAt?: number
}

export interface ConnectorSessionRecord {
  readonly id: string
  readonly connectorId: string
  readonly credentialId: string
  readonly state: ConnectorSessionState
  readonly ownerId: string
  readonly leaseToken: string
  readonly leaseExpiresAt: number
  readonly metadata?: JsonValue
  readonly lastError?: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
}

export interface PutConnectorRegistrationRequest {
  readonly id?: string
  readonly connectorId: string
  readonly pluginId: string
  readonly version?: string
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface ListConnectorRegistrationsRequest {
  readonly connectorId?: string
  readonly pluginId?: string
  readonly state?: ConnectorRegistrationState
  readonly limit?: number
}

export interface UpdateConnectorRegistrationStateRequest {
  readonly connectorId: string
  readonly state: ConnectorRegistrationState
}

export interface PutConnectorCredentialRequest {
  readonly id?: string
  readonly connectorId: string
  readonly kind: string
  readonly secretRef: string
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface ListConnectorCredentialsRequest {
  readonly connectorId?: string
  readonly state?: ConnectorCredentialState
  readonly limit?: number
}

export interface RevokeConnectorCredentialRequest {
  readonly credentialId: string
}

export interface StartConnectorSessionRequest {
  readonly id?: string
  readonly connectorId: string
  readonly credentialId: string
  readonly ownerId: string
  readonly leaseMs: number
  readonly state?: Extract<ConnectorSessionState, "connecting" | "connected">
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface HeartbeatConnectorSessionRequest {
  readonly sessionId: string
  readonly ownerId: string
  readonly leaseToken: string
  readonly leaseMs: number
  readonly state?: Extract<ConnectorSessionState, "connecting" | "connected">
  readonly metadata?: JsonValue
}

export interface FinishConnectorSessionRequest {
  readonly sessionId: string
  readonly ownerId: string
  readonly leaseToken: string
  readonly state: Extract<ConnectorSessionState, "disconnected" | "failed">
  readonly metadata?: JsonValue
  readonly error?: JsonValue
}

export interface ListConnectorSessionsRequest {
  readonly connectorId?: string
  readonly state?: ConnectorSessionState
  readonly ownerId?: string
  readonly limit?: number
}
