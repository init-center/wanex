import type {
  ConnectorCredentialRecord,
  ConnectorRegistrationRecord,
  ConnectorSessionRecord,
  FinishConnectorSessionRequest,
  HeartbeatConnectorSessionRequest,
  ListConnectorCredentialsRequest,
  ListConnectorRegistrationsRequest,
  ListConnectorSessionsRequest,
  PutConnectorCredentialRequest,
  PutConnectorRegistrationRequest,
  RevokeConnectorCredentialRequest,
  StartConnectorSessionRequest,
  UpdateConnectorRegistrationStateRequest
} from "@wanex/protocol"

export interface ConnectorStore {
  putConnectorRegistration(
    request: PutConnectorRegistrationRequest
  ): Promise<ConnectorRegistrationRecord>
  listConnectorRegistrations(
    request: ListConnectorRegistrationsRequest
  ): Promise<ConnectorRegistrationRecord[]>
  updateConnectorRegistrationState(
    request: UpdateConnectorRegistrationStateRequest
  ): Promise<ConnectorRegistrationRecord>
  putConnectorCredential(
    request: PutConnectorCredentialRequest
  ): Promise<ConnectorCredentialRecord>
  listConnectorCredentials(
    request: ListConnectorCredentialsRequest
  ): Promise<ConnectorCredentialRecord[]>
  revokeConnectorCredential(
    request: RevokeConnectorCredentialRequest
  ): Promise<ConnectorCredentialRecord>
  startConnectorSession(
    request: StartConnectorSessionRequest
  ): Promise<ConnectorSessionRecord>
  heartbeatConnectorSession(
    request: HeartbeatConnectorSessionRequest
  ): Promise<ConnectorSessionRecord>
  finishConnectorSession(
    request: FinishConnectorSessionRequest
  ): Promise<ConnectorSessionRecord>
  listConnectorSessions(
    request: ListConnectorSessionsRequest
  ): Promise<ConnectorSessionRecord[]>
}
