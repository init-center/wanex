import type {
  ChannelProjectionReceipt,
  ChannelProjectionRecord,
  ChannelProjectionTargetKind
} from "@wanex/protocol"
import type { ConnectorRuntimeStorage } from "./storage.js"
import type { ProjectConnectorEventRequest } from "./types.js"

export class ConnectorProjectionsRuntime {
  constructor(private readonly storage: ConnectorRuntimeStorage) {}

  async projectEvent(
    request: ProjectConnectorEventRequest
  ): Promise<ChannelProjectionReceipt> {
    return await this.storage.projectChannelInboundEvent({
      ...(request.id === undefined ? {} : { id: request.id }),
      inboundEventId: request.inboundEventId,
      target: request.target,
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      ...(request.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: request.idempotencyKey })
    })
  }

  async listProjections(
    request: {
      readonly inboundEventId?: string
      readonly targetKind?: ChannelProjectionTargetKind
      readonly limit?: number
    } = {}
  ): Promise<ChannelProjectionRecord[]> {
    return await this.storage.listChannelProjections({
      ...(request.inboundEventId === undefined
        ? {}
        : { inboundEventId: request.inboundEventId }),
      ...(request.targetKind === undefined
        ? {}
        : { targetKind: request.targetKind }),
      ...(request.limit === undefined ? {} : { limit: request.limit })
    })
  }
}
