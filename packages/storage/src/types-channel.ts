import type {
  ChannelBindingRecord,
  ChannelDeliveryAcknowledgement,
  ChannelDeliverySubmission,
  ChannelInboundEventRecord,
  ChannelProjectionReceipt,
  ChannelProjectionRecord,
  CompleteChannelDeliveryRequest,
  FailChannelDeliveryRequest,
  IngestChannelInboundEventRequest,
  ListChannelBindingsRequest,
  ListChannelInboundEventsRequest,
  ListChannelProjectionsRequest,
  ProjectChannelInboundEventRequest,
  PutChannelBindingRequest,
  RevokeChannelBindingRequest,
  SubmitChannelDeliveryRequest,
  UpdateChannelInboundEventStateRequest
} from "@wanex/protocol"

export interface ChannelStore {
  putChannelBinding(
    request: PutChannelBindingRequest
  ): Promise<ChannelBindingRecord>
  listChannelBindings(
    request: ListChannelBindingsRequest
  ): Promise<ChannelBindingRecord[]>
  revokeChannelBinding(
    request: RevokeChannelBindingRequest
  ): Promise<ChannelBindingRecord>
  ingestChannelInboundEvent(
    request: IngestChannelInboundEventRequest
  ): Promise<ChannelInboundEventRecord>
  listChannelInboundEvents(
    request: ListChannelInboundEventsRequest
  ): Promise<ChannelInboundEventRecord[]>
  updateChannelInboundEventState(
    request: UpdateChannelInboundEventStateRequest
  ): Promise<ChannelInboundEventRecord>
  submitChannelDelivery(
    request: SubmitChannelDeliveryRequest
  ): Promise<ChannelDeliverySubmission>
  completeChannelDelivery(
    request: CompleteChannelDeliveryRequest
  ): Promise<ChannelDeliveryAcknowledgement | null>
  failChannelDelivery(
    request: FailChannelDeliveryRequest
  ): Promise<ChannelDeliveryAcknowledgement | null>
  projectChannelInboundEvent(
    request: ProjectChannelInboundEventRequest
  ): Promise<ChannelProjectionReceipt>
  listChannelProjections(
    request: ListChannelProjectionsRequest
  ): Promise<ChannelProjectionRecord[]>
}
