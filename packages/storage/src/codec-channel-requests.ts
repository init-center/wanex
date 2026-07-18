import {
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
  toRpcJsonValue,
  toRpcJsonValueFromUnknown
} from "./codec-common.js"
import type {
  CompleteChannelDeliveryWire,
  FailChannelDeliveryWire,
  IngestChannelInboundEventWire,
  ListChannelBindingsWire,
  ListChannelInboundEventsWire,
  ListChannelProjectionsWire,
  ProjectChannelInboundEventWire,
  PutChannelBindingWire,
  RevokeChannelBindingWire,
  SubmitChannelDeliveryWire,
  UpdateChannelInboundEventStateWire
} from "./generated/storage-rpc.js"

export function toRpcPutChannelBindingRequest(
  request: PutChannelBindingRequest
): PutChannelBindingWire {
  return {
    id: request.id ?? null,
    connector_id: request.connectorId,
    channel_kind: request.channelKind,
    channel_id: request.channelId,
    external_identity_id: request.externalIdentityId,
    principal_id: request.principalId,
    display_name: request.displayName ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcListChannelBindingsRequest(
  request: ListChannelBindingsRequest
): ListChannelBindingsWire {
  return {
    connector_id: request.connectorId ?? null,
    channel_kind: request.channelKind ?? null,
    channel_id: request.channelId ?? null,
    principal_id: request.principalId ?? null,
    external_identity_id: request.externalIdentityId ?? null,
    state: request.state ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcRevokeChannelBindingRequest(
  request: RevokeChannelBindingRequest
): RevokeChannelBindingWire {
  return {
    binding_id: request.bindingId
  }
}

export function toRpcIngestChannelInboundEventRequest(
  request: IngestChannelInboundEventRequest
): IngestChannelInboundEventWire {
  return {
    id: request.id ?? null,
    connector_id: request.connectorId,
    channel_kind: request.channelKind,
    channel_id: request.channelId,
    external_event_id: request.externalEventId,
    external_thread_id: request.externalThreadId ?? null,
    sender_external_identity_id: request.senderExternalIdentityId,
    principal_id: request.principalId ?? null,
    payload: toRpcJsonValue(request.payload),
    metadata: toRpcJsonValue(request.metadata ?? null),
    received_at: request.receivedAt ?? null,
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcListChannelInboundEventsRequest(
  request: ListChannelInboundEventsRequest
): ListChannelInboundEventsWire {
  return {
    connector_id: request.connectorId ?? null,
    channel_kind: request.channelKind ?? null,
    channel_id: request.channelId ?? null,
    state: request.state ?? null,
    after_received_at: request.afterReceivedAt ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcUpdateChannelInboundEventStateRequest(
  request: UpdateChannelInboundEventStateRequest
): UpdateChannelInboundEventStateWire {
  return {
    event_id: request.eventId,
    state: request.state,
    metadata: toRpcJsonValue(request.metadata ?? null)
  }
}

export function toRpcSubmitChannelDeliveryRequest(
  request: SubmitChannelDeliveryRequest
): SubmitChannelDeliveryWire {
  return {
    id: request.id ?? null,
    connector_id: request.connectorId,
    channel_kind: request.channelKind,
    channel_id: request.channelId,
    target_external_identity_id: request.targetExternalIdentityId ?? null,
    external_thread_id: request.externalThreadId ?? null,
    principal_id: request.principalId,
    payload: toRpcJsonValue(request.payload),
    metadata: toRpcJsonValue(request.metadata ?? null),
    job_id: request.jobId ?? null,
    idempotency_key: request.idempotencyKey ?? null,
    scheduled_at: request.scheduledAt ?? null,
    not_before: request.notBefore ?? null,
    priority: request.priority ?? null,
    max_attempts: request.maxAttempts ?? null,
    retry_policy:
      request.retryPolicy === undefined
        ? null
        : {
            strategy: request.retryPolicy.strategy,
            initial_delay_ms: request.retryPolicy.initialDelayMs ?? null,
            max_delay_ms: request.retryPolicy.maxDelayMs ?? null
          },
    budget_grant_id: request.budgetGrantId ?? null
  }
}

export function toRpcCompleteChannelDeliveryRequest(
  request: CompleteChannelDeliveryRequest
): CompleteChannelDeliveryWire {
  return {
    delivery_id: request.deliveryId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    result: toRpcJsonValue(request.result ?? null),
    metadata: toRpcJsonValue(request.metadata ?? null)
  }
}

export function toRpcFailChannelDeliveryRequest(
  request: FailChannelDeliveryRequest
): FailChannelDeliveryWire {
  return {
    delivery_id: request.deliveryId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    error: toRpcJsonValue(request.error),
    metadata: toRpcJsonValue(request.metadata ?? null)
  }
}

export function toRpcProjectChannelInboundEventRequest(
  request: ProjectChannelInboundEventRequest
): ProjectChannelInboundEventWire {
  return {
    id: request.id ?? null,
    inbound_event_id: request.inboundEventId,
    target: toRpcJsonValueFromUnknown(request.target),
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcListChannelProjectionsRequest(
  request: ListChannelProjectionsRequest
): ListChannelProjectionsWire {
  return {
    inbound_event_id: request.inboundEventId ?? null,
    target_kind: request.targetKind ?? null,
    limit: request.limit ?? null
  }
}
