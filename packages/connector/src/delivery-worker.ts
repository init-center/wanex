import type {
  ChannelDeliveryAcknowledgement,
  JsonValue,
  SchedulerJobRecord
} from "@wanex/protocol"
import {
  workerAcknowledged,
  type WanexWorker,
  type WorkerHandlerContext
} from "@wanex/runtime/jobs"
import type {
  CompleteConnectorDeliveryRequest,
  ConnectorDeliveryHandler,
  ConnectorDeliveryJobPayload,
  FailConnectorDeliveryRequest
} from "./types.js"

export interface RegisterConnectorDeliveryHandlerOptions {
  readonly worker: WanexWorker
  readonly handler: ConnectorDeliveryHandler
  completeDelivery(
    request: CompleteConnectorDeliveryRequest
  ): Promise<ChannelDeliveryAcknowledgement | null>
  failDelivery(
    request: FailConnectorDeliveryRequest
  ): Promise<ChannelDeliveryAcknowledgement | null>
}

export function registerConnectorDeliveryHandler(
  options: RegisterConnectorDeliveryHandlerOptions
): void {
  options.worker.register("channel.delivery", async (context) => {
    const delivery = parseConnectorDeliveryJobPayload(context.job)
    try {
      const result = await options.handler({
        job: context.job,
        delivery,
        signal: context.signal,
        heartbeat: context.heartbeat
      })
      const acknowledged = await options.completeDelivery({
        deliveryId: delivery.deliveryId,
        workerId: requireLeaseOwner(context),
        leaseToken: requireLeaseToken(context.job),
        ...(result === undefined ? {} : { result })
      })
      if (acknowledged === null) {
        throw new Error(
          `connector delivery acknowledgement failed: ${delivery.deliveryId}`
        )
      }
      return workerAcknowledged(acknowledged.job)
    } catch (error) {
      const normalized = normalizeDeliveryError(error)
      const resultError = error instanceof Error ? error : new Error(String(error))
      const acknowledged = await options.failDelivery({
        deliveryId: delivery.deliveryId,
        workerId: requireLeaseOwner(context),
        leaseToken: requireLeaseToken(context.job),
        error: normalized
      })
      if (acknowledged === null) {
        throw new Error(
          `connector delivery failure acknowledgement failed: ${delivery.deliveryId}`
        )
      }
      return workerAcknowledged(acknowledged.job, resultError)
    }
  })
}

function parseConnectorDeliveryJobPayload(
  job: SchedulerJobRecord
): ConnectorDeliveryJobPayload {
  if (job.kind !== "channel.delivery") {
    throw new Error(`expected channel.delivery job, got: ${job.kind}`)
  }
  const value = job.payload
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("channel delivery job payload must be an object")
  }
  const record = value as Record<string, JsonValue>
  return {
    deliveryId: expectString(record.deliveryId, "deliveryId"),
    connectorId: expectString(record.connectorId, "connectorId"),
    channelKind: expectString(record.channelKind, "channelKind"),
    channelId: expectString(record.channelId, "channelId"),
    ...(record.targetExternalIdentityId === undefined ||
    record.targetExternalIdentityId === null
      ? {}
      : {
          targetExternalIdentityId: expectString(
            record.targetExternalIdentityId,
            "targetExternalIdentityId"
          )
        }),
    ...(record.externalThreadId === undefined || record.externalThreadId === null
      ? {}
      : {
          externalThreadId: expectString(
            record.externalThreadId,
            "externalThreadId"
          )
        }),
    payload: (record.payload ?? null) as JsonValue
  }
}

function expectString(value: JsonValue | undefined, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`channel delivery payload ${name} must be a non-empty string`)
  }
  return value
}

function requireLeaseOwner(context: WorkerHandlerContext): string {
  if (context.job.leaseOwner === undefined) {
    throw new Error(`channel delivery job missing lease owner: ${context.job.id}`)
  }
  return context.job.leaseOwner
}

function requireLeaseToken(job: SchedulerJobRecord): string {
  if (job.leaseToken === undefined) {
    throw new Error(`channel delivery job missing lease token: ${job.id}`)
  }
  return job.leaseToken
}

function normalizeDeliveryError(error: unknown): JsonValue {
  if (error instanceof Error) {
    return {
      type: "connector.delivery_failed",
      name: error.name,
      message: error.message
    }
  }
  return {
    type: "connector.delivery_failed",
    message: String(error)
  }
}
