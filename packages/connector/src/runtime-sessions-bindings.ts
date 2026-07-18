import type {
  ChannelBindingRecord,
  ChannelBindingState,
  ConnectorSessionRecord,
  ConnectorSessionState,
  PrincipalId
} from "@wanex/protocol"
import {
  ConnectorRuntimeRegistryCredentialsFacade
} from "./runtime-registry-credentials.js"
import type {
  BindExternalIdentityRequest,
  FinishConnectorSessionLeaseRequest,
  HeartbeatConnectorSessionLeaseRequest,
  StartConnectorSessionLeaseRequest
} from "./types.js"

export abstract class ConnectorRuntimeSessionsBindingsFacade
  extends ConnectorRuntimeRegistryCredentialsFacade {
  async startSession(
    request: StartConnectorSessionLeaseRequest
  ): Promise<ConnectorSessionRecord> {
    return await this.subsystems.sessions.startSession(request)
  }

  async heartbeatSession(
    request: HeartbeatConnectorSessionLeaseRequest
  ): Promise<ConnectorSessionRecord> {
    return await this.subsystems.sessions.heartbeatSession(request)
  }

  async finishSession(
    request: FinishConnectorSessionLeaseRequest
  ): Promise<ConnectorSessionRecord> {
    return await this.subsystems.sessions.finishSession(request)
  }

  async listSessions(
    request: {
      readonly connectorId?: string
      readonly state?: ConnectorSessionState
      readonly ownerId?: string
      readonly limit?: number
    } = {}
  ): Promise<ConnectorSessionRecord[]> {
    return await this.subsystems.sessions.listSessions(request)
  }

  async bindExternalIdentity(
    request: BindExternalIdentityRequest
  ): Promise<ChannelBindingRecord> {
    return await this.subsystems.bindings.bindExternalIdentity(request)
  }

  async listBindings(
    request: {
      readonly connectorId?: string
      readonly channelKind?: string
      readonly channelId?: string
      readonly principalId?: PrincipalId
      readonly externalIdentityId?: string
      readonly state?: ChannelBindingState
      readonly limit?: number
    } = {}
  ): Promise<ChannelBindingRecord[]> {
    return await this.subsystems.bindings.listBindings(request)
  }

  async revokeBinding(bindingId: string): Promise<ChannelBindingRecord> {
    return await this.subsystems.bindings.revokeBinding(bindingId)
  }
}
