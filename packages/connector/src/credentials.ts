import type { ConnectorCredentialRecord } from "@wanex/protocol"
import type { ConnectorRuntimeStorage } from "./storage.js"
import type { PutConnectorCredentialRefRequest } from "./types.js"

export class ConnectorCredentialsRuntime {
  constructor(private readonly storage: ConnectorRuntimeStorage) {}

  async putCredentialRef(
    request: PutConnectorCredentialRefRequest
  ): Promise<ConnectorCredentialRecord> {
    return await this.storage.putConnectorCredential({
      ...(request.id === undefined ? {} : { id: request.id }),
      connectorId: request.connectorId,
      kind: request.kind,
      secretRef: request.secretRef,
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      ...(request.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: request.idempotencyKey })
    })
  }

  async listCredentialRefs(
    request: {
      readonly connectorId?: string
      readonly state?: ConnectorCredentialRecord["state"]
      readonly limit?: number
    } = {}
  ): Promise<ConnectorCredentialRecord[]> {
    return await this.storage.listConnectorCredentials({
      ...(request.connectorId === undefined
        ? {}
        : { connectorId: request.connectorId }),
      ...(request.state === undefined ? {} : { state: request.state }),
      ...(request.limit === undefined ? {} : { limit: request.limit })
    })
  }

  async revokeCredentialRef(
    credentialId: string
  ): Promise<ConnectorCredentialRecord> {
    return await this.storage.revokeConnectorCredential({ credentialId })
  }
}
