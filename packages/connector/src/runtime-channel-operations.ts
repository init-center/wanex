import type {
  ChannelDeliveryAcknowledgement,
  ChannelDeliverySubmission,
  ChannelInboundEventRecord,
  ChannelInboundEventState,
  ChannelProjectionReceipt,
  ChannelProjectionRecord,
  ChannelProjectionTargetKind,
  JsonValue
} from "@wanex/protocol"
import type { WanexWorker } from "@wanex/runtime/jobs"
import { registerConnectorDeliveryHandler } from "./delivery-worker.js"
import {
  ConnectorRuntimeSessionsBindingsFacade
} from "./runtime-sessions-bindings.js"
import type {
  CompleteConnectorDeliveryRequest,
  ConnectorDeliveryHandler,
  FailConnectorDeliveryRequest,
  IngestConnectorEventRequest,
  ProjectConnectorEventRequest,
  SubmitConnectorDeliveryRequest
} from "./types.js"

export abstract class ConnectorRuntimeChannelOperationsFacade
  extends ConnectorRuntimeSessionsBindingsFacade {
  async ingestEvent(
    request: IngestConnectorEventRequest
  ): Promise<ChannelInboundEventRecord> {
    return await this.subsystems.events.ingestEvent(request)
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
    return await this.subsystems.events.listEvents(request)
  }

  async updateEventState(
    eventId: string,
    state: ChannelInboundEventState,
    metadata?: JsonValue
  ): Promise<ChannelInboundEventRecord> {
    return await this.subsystems.events.updateEventState(eventId, state, metadata)
  }

  async submitDelivery(
    request: SubmitConnectorDeliveryRequest
  ): Promise<ChannelDeliverySubmission> {
    return await this.subsystems.deliveries.submitDelivery(request)
  }

  async completeDelivery(
    request: CompleteConnectorDeliveryRequest
  ): Promise<ChannelDeliveryAcknowledgement | null> {
    return await this.subsystems.deliveries.completeDelivery(request)
  }

  async failDelivery(
    request: FailConnectorDeliveryRequest
  ): Promise<ChannelDeliveryAcknowledgement | null> {
    return await this.subsystems.deliveries.failDelivery(request)
  }

  async projectEvent(
    request: ProjectConnectorEventRequest
  ): Promise<ChannelProjectionReceipt> {
    return await this.subsystems.projections.projectEvent(request)
  }

  async listProjections(
    request: {
      readonly inboundEventId?: string
      readonly targetKind?: ChannelProjectionTargetKind
      readonly limit?: number
    } = {}
  ): Promise<ChannelProjectionRecord[]> {
    return await this.subsystems.projections.listProjections(request)
  }

  registerDeliveryHandler(
    worker: WanexWorker,
    handler: ConnectorDeliveryHandler
  ): void {
    registerConnectorDeliveryHandler({
      worker,
      handler,
      completeDelivery: (request) => this.completeDelivery(request),
      failDelivery: (request) => this.failDelivery(request)
    })
  }
}
