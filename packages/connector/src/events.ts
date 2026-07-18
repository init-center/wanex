import type {
  ChannelInboundEventRecord,
  ChannelInboundEventState,
  JsonValue
} from "@wanex/protocol"
import type { ConnectorRuntimeStorage } from "./storage.js"
import type { IngestConnectorEventRequest } from "./types.js"

export class ConnectorEventsRuntime {
  constructor(private readonly storage: ConnectorRuntimeStorage) {}

  async ingestEvent(
    request: IngestConnectorEventRequest
  ): Promise<ChannelInboundEventRecord> {
    return await this.storage.ingestChannelInboundEvent({
      ...(request.id === undefined ? {} : { id: request.id }),
      connectorId: request.connectorId,
      channelKind: request.channelKind,
      channelId: request.channelId,
      externalEventId: request.externalEventId,
      ...(request.externalThreadId === undefined
        ? {}
        : { externalThreadId: request.externalThreadId }),
      senderExternalIdentityId: request.senderExternalIdentityId,
      ...(request.principalId === undefined
        ? {}
        : { principalId: request.principalId }),
      payload: request.payload,
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      ...(request.receivedAt === undefined
        ? {}
        : { receivedAt: request.receivedAt }),
      ...(request.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: request.idempotencyKey })
    })
  }

  async listEvents(
    request: {
      readonly connectorId?: string
      readonly channelKind?: string
      readonly channelId?: string
      readonly state?: ChannelInboundEventState
      readonly afterReceivedAt?: number
      readonly limit?: number
    } = {}
  ): Promise<ChannelInboundEventRecord[]> {
    return await this.storage.listChannelInboundEvents({
      ...(request.connectorId === undefined
        ? {}
        : { connectorId: request.connectorId }),
      ...(request.channelKind === undefined
        ? {}
        : { channelKind: request.channelKind }),
      ...(request.channelId === undefined ? {} : { channelId: request.channelId }),
      ...(request.state === undefined ? {} : { state: request.state }),
      ...(request.afterReceivedAt === undefined
        ? {}
        : { afterReceivedAt: request.afterReceivedAt }),
      ...(request.limit === undefined ? {} : { limit: request.limit })
    })
  }

  async updateEventState(
    eventId: string,
    state: ChannelInboundEventState,
    metadata?: JsonValue
  ): Promise<ChannelInboundEventRecord> {
    return await this.storage.updateChannelInboundEventState({
      eventId,
      state,
      ...(metadata === undefined ? {} : { metadata })
    })
  }
}
