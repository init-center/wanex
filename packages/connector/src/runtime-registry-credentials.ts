import type {
  ConnectorCredentialRecord,
  ConnectorRegistrationRecord,
  ConnectorRegistrationState
} from "@wanex/protocol"
import {
  ConnectorRuntimeSubsystemFacade
} from "./runtime-subsystems.js"
import type {
  PutConnectorCredentialRefRequest,
  RegisterConnectorRequest
} from "./types.js"

export abstract class ConnectorRuntimeRegistryCredentialsFacade
  extends ConnectorRuntimeSubsystemFacade {
  async registerConnector(
    request: RegisterConnectorRequest
  ): Promise<ConnectorRegistrationRecord> {
    return await this.subsystems.registry.registerConnector(request)
  }

  async listConnectors(
    request: {
      readonly connectorId?: string
      readonly pluginId?: string
      readonly state?: ConnectorRegistrationState
      readonly limit?: number
    } = {}
  ): Promise<ConnectorRegistrationRecord[]> {
    return await this.subsystems.registry.listConnectors(request)
  }

  async updateConnectorState(
    connectorId: string,
    state: ConnectorRegistrationState
  ): Promise<ConnectorRegistrationRecord> {
    return await this.subsystems.registry.updateConnectorState(connectorId, state)
  }

  async putCredentialRef(
    request: PutConnectorCredentialRefRequest
  ): Promise<ConnectorCredentialRecord> {
    return await this.subsystems.credentials.putCredentialRef(request)
  }

  async listCredentialRefs(
    request: {
      readonly connectorId?: string
      readonly state?: ConnectorCredentialRecord["state"]
      readonly limit?: number
    } = {}
  ): Promise<ConnectorCredentialRecord[]> {
    return await this.subsystems.credentials.listCredentialRefs(request)
  }

  async revokeCredentialRef(
    credentialId: string
  ): Promise<ConnectorCredentialRecord> {
    return await this.subsystems.credentials.revokeCredentialRef(credentialId)
  }
}
