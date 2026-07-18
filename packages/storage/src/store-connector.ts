import {
  type ConnectorCredentialRecord,
  type ConnectorRegistrationRecord,
  type ConnectorSessionRecord,
  type FinishConnectorSessionRequest,
  type HeartbeatConnectorSessionRequest,
  type ListConnectorCredentialsRequest,
  type ListConnectorRegistrationsRequest,
  type ListConnectorSessionsRequest,
  type PutConnectorCredentialRequest,
  type PutConnectorRegistrationRequest,
  type RevokeConnectorCredentialRequest,
  type StartConnectorSessionRequest,
  type UpdateConnectorRegistrationStateRequest
} from "@wanex/protocol"

import {
  fromRpcConnectorCredentialRecord,
  fromRpcConnectorRegistrationRecord,
  fromRpcConnectorSessionRecord,
  toRpcFinishConnectorSessionRequest,
  toRpcHeartbeatConnectorSessionRequest,
  toRpcListConnectorCredentialsRequest,
  toRpcListConnectorRegistrationsRequest,
  toRpcListConnectorSessionsRequest,
  toRpcPutConnectorCredentialRequest,
  toRpcPutConnectorRegistrationRequest,
  toRpcRevokeConnectorCredentialRequest,
  toRpcStartConnectorSessionRequest,
  toRpcUpdateConnectorRegistrationStateRequest
} from "./codec-connector.js"
import { assertArray } from "./codec-helpers.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"
import type { ConnectorStorageRpcCommand } from "./generated/storage-rpc.js"

export class ConnectorStoreMethods extends RpcStoreFacetBase {
  async putConnectorRegistration(
    request: PutConnectorRegistrationRequest
  ): Promise<ConnectorRegistrationRecord> {
    const value = await this.callConnector({
      command: "put-connector-registration",
      request: toRpcPutConnectorRegistrationRequest(request)
    })
    return fromRpcConnectorRegistrationRecord(value)
  }

  async listConnectorRegistrations(
    request: ListConnectorRegistrationsRequest
  ): Promise<ConnectorRegistrationRecord[]> {
    const value = await this.callConnector({
      command: "list-connector-registrations",
      request: toRpcListConnectorRegistrationsRequest(request)
    })
    assertArray(value, "connector registrations")
    return value.map(fromRpcConnectorRegistrationRecord)
  }

  async updateConnectorRegistrationState(
    request: UpdateConnectorRegistrationStateRequest
  ): Promise<ConnectorRegistrationRecord> {
    const value = await this.callConnector({
      command: "update-connector-registration-state",
      request: toRpcUpdateConnectorRegistrationStateRequest(request)
    })
    return fromRpcConnectorRegistrationRecord(value)
  }

  async putConnectorCredential(
    request: PutConnectorCredentialRequest
  ): Promise<ConnectorCredentialRecord> {
    const value = await this.callConnector({
      command: "put-connector-credential",
      request: toRpcPutConnectorCredentialRequest(request)
    })
    return fromRpcConnectorCredentialRecord(value)
  }

  async listConnectorCredentials(
    request: ListConnectorCredentialsRequest
  ): Promise<ConnectorCredentialRecord[]> {
    const value = await this.callConnector({
      command: "list-connector-credentials",
      request: toRpcListConnectorCredentialsRequest(request)
    })
    assertArray(value, "connector credentials")
    return value.map(fromRpcConnectorCredentialRecord)
  }

  async revokeConnectorCredential(
    request: RevokeConnectorCredentialRequest
  ): Promise<ConnectorCredentialRecord> {
    const value = await this.callConnector({
      command: "revoke-connector-credential",
      request: toRpcRevokeConnectorCredentialRequest(request)
    })
    return fromRpcConnectorCredentialRecord(value)
  }

  async startConnectorSession(
    request: StartConnectorSessionRequest
  ): Promise<ConnectorSessionRecord> {
    const value = await this.callConnector({
      command: "start-connector-session",
      request: toRpcStartConnectorSessionRequest(request)
    })
    return fromRpcConnectorSessionRecord(value)
  }

  async heartbeatConnectorSession(
    request: HeartbeatConnectorSessionRequest
  ): Promise<ConnectorSessionRecord> {
    const value = await this.callConnector({
      command: "heartbeat-connector-session",
      request: toRpcHeartbeatConnectorSessionRequest(request)
    })
    return fromRpcConnectorSessionRecord(value)
  }

  async finishConnectorSession(
    request: FinishConnectorSessionRequest
  ): Promise<ConnectorSessionRecord> {
    const value = await this.callConnector({
      command: "finish-connector-session",
      request: toRpcFinishConnectorSessionRequest(request)
    })
    return fromRpcConnectorSessionRecord(value)
  }

  async listConnectorSessions(
    request: ListConnectorSessionsRequest
  ): Promise<ConnectorSessionRecord[]> {
    const value = await this.callConnector({
      command: "list-connector-sessions",
      request: toRpcListConnectorSessionsRequest(request)
    })
    assertArray(value, "connector sessions")
    return value.map(fromRpcConnectorSessionRecord)
  }

  private callConnector(request: ConnectorStorageRpcCommand) {
    return this.call(request)
  }
}
