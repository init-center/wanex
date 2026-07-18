import {
  type ChannelBindingRecord,
  type ChannelDeliveryRecord,
  type ChannelInboundEventRecord,
  type ChannelProjectionRecord,
  type JsonValue
} from "@wanex/protocol"

import {
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"
import {
  expectChannelBindingState,
  expectChannelDeliveryState,
  expectChannelInboundEventState,
  expectChannelProjectionState,
  expectChannelProjectionTargetKind
} from "./codec-channel-enums.js"

export function fromRpcChannelBindingRecord(
  value: JsonValue
): ChannelBindingRecord {
  if (!isRecord(value)) {
    throw new Error("channel binding must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "channel_binding.id"),
      connectorId: expectString(value.connector_id, "channel_binding.connector_id"),
      channelKind: expectString(value.channel_kind, "channel_binding.channel_kind"),
      channelId: expectString(value.channel_id, "channel_binding.channel_id"),
      externalIdentityId: expectString(
        value.external_identity_id,
        "channel_binding.external_identity_id"
      ),
      principalId: expectString(value.principal_id, "channel_binding.principal_id"),
      state: expectChannelBindingState(value.state),
      createdAt: expectNumber(value.created_at, "channel_binding.created_at"),
      updatedAt: expectNumber(value.updated_at, "channel_binding.updated_at")
    },
    {
      displayName: optionalString(value.display_name, "channel_binding.display_name"),
      metadata: value.metadata ?? undefined,
      revokedAt: optionalNumber(value.revoked_at, "channel_binding.revoked_at")
    }
  )
}

export function fromRpcChannelInboundEventRecord(
  value: JsonValue
): ChannelInboundEventRecord {
  if (!isRecord(value)) {
    throw new Error("channel inbound event must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "channel_inbound_event.id"),
      connectorId: expectString(
        value.connector_id,
        "channel_inbound_event.connector_id"
      ),
      channelKind: expectString(
        value.channel_kind,
        "channel_inbound_event.channel_kind"
      ),
      channelId: expectString(value.channel_id, "channel_inbound_event.channel_id"),
      externalEventId: expectString(
        value.external_event_id,
        "channel_inbound_event.external_event_id"
      ),
      senderExternalIdentityId: expectString(
        value.sender_external_identity_id,
        "channel_inbound_event.sender_external_identity_id"
      ),
      payload: (value.payload ?? null) as JsonValue,
      state: expectChannelInboundEventState(value.state),
      receivedAt: expectNumber(
        value.received_at,
        "channel_inbound_event.received_at"
      ),
      createdAt: expectNumber(value.created_at, "channel_inbound_event.created_at"),
      updatedAt: expectNumber(value.updated_at, "channel_inbound_event.updated_at")
    },
    {
      externalThreadId: optionalString(
        value.external_thread_id,
        "channel_inbound_event.external_thread_id"
      ),
      principalId: optionalString(
        value.principal_id,
        "channel_inbound_event.principal_id"
      ),
      metadata: value.metadata ?? undefined
    }
  )
}

export function fromRpcChannelDeliveryRecord(
  value: JsonValue
): ChannelDeliveryRecord {
  if (!isRecord(value)) {
    throw new Error("channel delivery must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "channel_delivery.id"),
      connectorId: expectString(value.connector_id, "channel_delivery.connector_id"),
      channelKind: expectString(value.channel_kind, "channel_delivery.channel_kind"),
      channelId: expectString(value.channel_id, "channel_delivery.channel_id"),
      principalId: expectString(value.principal_id, "channel_delivery.principal_id"),
      payload: (value.payload ?? null) as JsonValue,
      state: expectChannelDeliveryState(value.state),
      createdAt: expectNumber(value.created_at, "channel_delivery.created_at"),
      updatedAt: expectNumber(value.updated_at, "channel_delivery.updated_at")
    },
    {
      targetExternalIdentityId: optionalString(
        value.target_external_identity_id,
        "channel_delivery.target_external_identity_id"
      ),
      externalThreadId: optionalString(
        value.external_thread_id,
        "channel_delivery.external_thread_id"
      ),
      metadata: value.metadata ?? undefined,
      schedulerJobId: optionalString(
        value.scheduler_job_id,
        "channel_delivery.scheduler_job_id"
      ),
      finishedAt: optionalNumber(value.finished_at, "channel_delivery.finished_at")
    }
  )
}

export function fromRpcChannelProjectionRecord(
  value: JsonValue
): ChannelProjectionRecord {
  if (!isRecord(value)) {
    throw new Error("channel projection must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "channel_projection.id"),
      inboundEventId: expectString(
        value.inbound_event_id,
        "channel_projection.inbound_event_id"
      ),
      targetKind: expectChannelProjectionTargetKind(value.target_kind),
      state: expectChannelProjectionState(value.state),
      target: (value.target ?? null) as JsonValue,
      createdAt: expectNumber(value.created_at, "channel_projection.created_at"),
      updatedAt: expectNumber(value.updated_at, "channel_projection.updated_at")
    },
    {
      targetId: optionalString(value.target_id, "channel_projection.target_id"),
      targetJobId: optionalString(
        value.target_job_id,
        "channel_projection.target_job_id"
      ),
      metadata: value.metadata ?? undefined,
      idempotencyKey: optionalString(
        value.idempotency_key,
        "channel_projection.idempotency_key"
      )
    }
  )
}
