import {
  type ChannelBindingRecord,
  type ChannelDeliveryAcknowledgement,
  type ChannelDeliverySubmission,
  type ChannelInboundEventRecord,
  type ChannelProjectionReceipt,
  type ChannelProjectionRecord,
  type CompleteChannelDeliveryRequest,
  type FailChannelDeliveryRequest,
  type IngestChannelInboundEventRequest,
  type ListChannelBindingsRequest,
  type ListChannelInboundEventsRequest,
  type ListChannelProjectionsRequest,
  type ProjectChannelInboundEventRequest,
  type PutChannelBindingRequest,
  type RevokeChannelBindingRequest,
  type SubmitChannelDeliveryRequest,
  type UpdateChannelInboundEventStateRequest
} from "@wanex/protocol"

import {
  fromRpcChannelBindingRecord,
  fromRpcChannelDeliveryAcknowledgement,
  fromRpcChannelDeliverySubmission,
  fromRpcChannelInboundEventRecord,
  fromRpcChannelProjectionReceipt,
  fromRpcChannelProjectionRecord,
  toRpcCompleteChannelDeliveryRequest,
  toRpcFailChannelDeliveryRequest,
  toRpcIngestChannelInboundEventRequest,
  toRpcListChannelBindingsRequest,
  toRpcListChannelInboundEventsRequest,
  toRpcListChannelProjectionsRequest,
  toRpcProjectChannelInboundEventRequest,
  toRpcPutChannelBindingRequest,
  toRpcRevokeChannelBindingRequest,
  toRpcSubmitChannelDeliveryRequest,
  toRpcUpdateChannelInboundEventStateRequest
} from "./codec-channel.js"
import { assertArray } from "./codec-helpers.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"
import type { ChannelStorageRpcCommand } from "./generated/storage-rpc.js"

export class ChannelStoreMethods extends RpcStoreFacetBase {
  async putChannelBinding(
    request: PutChannelBindingRequest
  ): Promise<ChannelBindingRecord> {
    const value = await this.callChannel({
      command: "put-channel-binding",
      request: toRpcPutChannelBindingRequest(request)
    })
    return fromRpcChannelBindingRecord(value)
  }

  async listChannelBindings(
    request: ListChannelBindingsRequest
  ): Promise<ChannelBindingRecord[]> {
    const value = await this.callChannel({
      command: "list-channel-bindings",
      request: toRpcListChannelBindingsRequest(request)
    })
    assertArray(value, "channel bindings")
    return value.map(fromRpcChannelBindingRecord)
  }

  async revokeChannelBinding(
    request: RevokeChannelBindingRequest
  ): Promise<ChannelBindingRecord> {
    const value = await this.callChannel({
      command: "revoke-channel-binding",
      request: toRpcRevokeChannelBindingRequest(request)
    })
    return fromRpcChannelBindingRecord(value)
  }

  async ingestChannelInboundEvent(
    request: IngestChannelInboundEventRequest
  ): Promise<ChannelInboundEventRecord> {
    const value = await this.callChannel({
      command: "ingest-channel-inbound-event",
      request: toRpcIngestChannelInboundEventRequest(request)
    })
    return fromRpcChannelInboundEventRecord(value)
  }

  async listChannelInboundEvents(
    request: ListChannelInboundEventsRequest
  ): Promise<ChannelInboundEventRecord[]> {
    const value = await this.callChannel({
      command: "list-channel-inbound-events",
      request: toRpcListChannelInboundEventsRequest(request)
    })
    assertArray(value, "channel inbound events")
    return value.map(fromRpcChannelInboundEventRecord)
  }

  async updateChannelInboundEventState(
    request: UpdateChannelInboundEventStateRequest
  ): Promise<ChannelInboundEventRecord> {
    const value = await this.callChannel({
      command: "update-channel-inbound-event-state",
      request: toRpcUpdateChannelInboundEventStateRequest(request)
    })
    return fromRpcChannelInboundEventRecord(value)
  }

  async submitChannelDelivery(
    request: SubmitChannelDeliveryRequest
  ): Promise<ChannelDeliverySubmission> {
    const value = await this.callChannel({
      command: "submit-channel-delivery",
      request: toRpcSubmitChannelDeliveryRequest(request)
    })
    return fromRpcChannelDeliverySubmission(value)
  }

  async completeChannelDelivery(
    request: CompleteChannelDeliveryRequest
  ): Promise<ChannelDeliveryAcknowledgement | null> {
    const value = await this.callChannel({
      command: "complete-channel-delivery",
      request: toRpcCompleteChannelDeliveryRequest(request)
    })
    return value === null ? null : fromRpcChannelDeliveryAcknowledgement(value)
  }

  async failChannelDelivery(
    request: FailChannelDeliveryRequest
  ): Promise<ChannelDeliveryAcknowledgement | null> {
    const value = await this.callChannel({
      command: "fail-channel-delivery",
      request: toRpcFailChannelDeliveryRequest(request)
    })
    return value === null ? null : fromRpcChannelDeliveryAcknowledgement(value)
  }

  async projectChannelInboundEvent(
    request: ProjectChannelInboundEventRequest
  ): Promise<ChannelProjectionReceipt> {
    const value = await this.callChannel({
      command: "project-channel-inbound-event",
      request: toRpcProjectChannelInboundEventRequest(request)
    })
    return fromRpcChannelProjectionReceipt(value)
  }

  async listChannelProjections(
    request: ListChannelProjectionsRequest
  ): Promise<ChannelProjectionRecord[]> {
    const value = await this.callChannel({
      command: "list-channel-projections",
      request: toRpcListChannelProjectionsRequest(request)
    })
    assertArray(value, "channel projections")
    return value.map(fromRpcChannelProjectionRecord)
  }

  private callChannel(request: ChannelStorageRpcCommand) {
    return this.call(request)
  }
}
