import type {
  ConnectorSessionRecord,
  ConnectorSessionState
} from "@wanex/protocol"
import type { ConnectorRuntimeStorage } from "./storage.js"
import type {
  FinishConnectorSessionLeaseRequest,
  HeartbeatConnectorSessionLeaseRequest,
  StartConnectorSessionLeaseRequest
} from "./types.js"

export class ConnectorSessionsRuntime {
  constructor(private readonly storage: ConnectorRuntimeStorage) {}

  async startSession(
    request: StartConnectorSessionLeaseRequest
  ): Promise<ConnectorSessionRecord> {
    return await this.storage.startConnectorSession({
      ...(request.id === undefined ? {} : { id: request.id }),
      connectorId: request.connectorId,
      credentialId: request.credentialId,
      ownerId: request.ownerId,
      leaseMs: request.leaseMs,
      ...(request.state === undefined ? {} : { state: request.state }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      ...(request.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: request.idempotencyKey })
    })
  }

  async heartbeatSession(
    request: HeartbeatConnectorSessionLeaseRequest
  ): Promise<ConnectorSessionRecord> {
    return await this.storage.heartbeatConnectorSession({
      sessionId: request.sessionId,
      ownerId: request.ownerId,
      leaseToken: request.leaseToken,
      leaseMs: request.leaseMs,
      ...(request.state === undefined ? {} : { state: request.state }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata })
    })
  }

  async finishSession(
    request: FinishConnectorSessionLeaseRequest
  ): Promise<ConnectorSessionRecord> {
    return await this.storage.finishConnectorSession({
      sessionId: request.sessionId,
      ownerId: request.ownerId,
      leaseToken: request.leaseToken,
      state: request.state,
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      ...(request.error === undefined ? {} : { error: request.error })
    })
  }

  async listSessions(
    request: {
      readonly connectorId?: string
      readonly state?: ConnectorSessionState
      readonly ownerId?: string
      readonly limit?: number
    } = {}
  ): Promise<ConnectorSessionRecord[]> {
    return await this.storage.listConnectorSessions({
      ...(request.connectorId === undefined
        ? {}
        : { connectorId: request.connectorId }),
      ...(request.state === undefined ? {} : { state: request.state }),
      ...(request.ownerId === undefined ? {} : { ownerId: request.ownerId }),
      ...(request.limit === undefined ? {} : { limit: request.limit })
    })
  }
}
