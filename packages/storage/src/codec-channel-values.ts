import {
  type ChannelDeliveryAcknowledgement,
  type ChannelDeliverySubmission,
  type ChannelProjectionReceipt,
  type JsonValue
} from "@wanex/protocol"

import { expectJsonField, isRecord, withOptionalFields } from "./codec-helpers.js"
import { fromRpcSchedulerJobRecord } from "./codec-scheduler.js"
import {
  fromRpcChannelDeliveryRecord,
  fromRpcChannelProjectionRecord
} from "./codec-channel-records.js"

export function fromRpcChannelDeliverySubmission(
  value: JsonValue
): ChannelDeliverySubmission {
  if (!isRecord(value)) {
    throw new Error("channel delivery submission must be an object")
  }
  return {
    delivery: fromRpcChannelDeliveryRecord(
      expectJsonField(value, "delivery", "channel_delivery.delivery")
    ),
    job: fromRpcSchedulerJobRecord(
      expectJsonField(value, "job", "channel_delivery.job")
    )
  }
}

export function fromRpcChannelDeliveryAcknowledgement(
  value: JsonValue
): ChannelDeliveryAcknowledgement {
  if (!isRecord(value)) {
    throw new Error("channel delivery acknowledgement must be an object")
  }
  return {
    delivery: fromRpcChannelDeliveryRecord(
      expectJsonField(value, "delivery", "channel_delivery_ack.delivery")
    ),
    job: fromRpcSchedulerJobRecord(
      expectJsonField(value, "job", "channel_delivery_ack.job")
    )
  }
}

export function fromRpcChannelProjectionReceipt(
  value: JsonValue
): ChannelProjectionReceipt {
  if (!isRecord(value)) {
    throw new Error("channel projection receipt must be an object")
  }
  return withOptionalFields(
    {
      projection: fromRpcChannelProjectionRecord(
        expectJsonField(value, "projection", "channel_projection_receipt.projection")
      )
    },
    {
      job:
        value.job === null || value.job === undefined
          ? undefined
          : fromRpcSchedulerJobRecord(
              expectJsonField(value, "job", "channel_projection_receipt.job")
            )
    }
  )
}
