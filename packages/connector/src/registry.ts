import type {
  ConnectorRegistrationRecord,
  ConnectorRegistrationState
} from "@wanex/protocol"
import type { ConnectorRuntimeStorage } from "./storage.js"
import type { RegisterConnectorRequest } from "./types.js"

export class ConnectorRegistryRuntime {
  constructor(private readonly storage: ConnectorRuntimeStorage) {}

  async registerConnector(
    request: RegisterConnectorRequest
  ): Promise<ConnectorRegistrationRecord> {
    return await this.storage.putConnectorRegistration({
      ...(request.id === undefined ? {} : { id: request.id }),
      connectorId: request.connectorId,
      pluginId: request.pluginId,
      ...(request.version === undefined ? {} : { version: request.version }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      ...(request.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: request.idempotencyKey })
    })
  }

  async listConnectors(
    request: {
      readonly connectorId?: string
      readonly pluginId?: string
      readonly state?: ConnectorRegistrationState
      readonly limit?: number
    } = {}
  ): Promise<ConnectorRegistrationRecord[]> {
    return await this.storage.listConnectorRegistrations({
      ...(request.connectorId === undefined
        ? {}
        : { connectorId: request.connectorId }),
      ...(request.pluginId === undefined ? {} : { pluginId: request.pluginId }),
      ...(request.state === undefined ? {} : { state: request.state }),
      ...(request.limit === undefined ? {} : { limit: request.limit })
    })
  }

  async updateConnectorState(
    connectorId: string,
    state: ConnectorRegistrationState
  ): Promise<ConnectorRegistrationRecord> {
    return await this.storage.updateConnectorRegistrationState({
      connectorId,
      state
    })
  }
}
