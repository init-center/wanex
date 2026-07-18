import type {
  CleanupExpiredResourceTicketsRequest,
  JsonValue
} from "@wanex/protocol"
import type { WanexSessionCore } from "../sessions/index.js"
import type { WanexWorker } from "./worker.js"
import type { WorkerHandler } from "./types.js"

export function createResourceCleanupHandler(
  session: WanexSessionCore
): WorkerHandler {
  return async ({ job, signal }) => {
    if (signal.aborted) {
      throw new Error(`resource cleanup job aborted before start: ${job.id}`)
    }
    const request = resourceCleanupRequestFromPayload(job.payload)
    return (await session.cleanupExpiredResourceTickets(request)) as unknown as JsonValue
  }
}

export function registerResourceCleanupHandler(
  worker: WanexWorker,
  session: WanexSessionCore
): void {
  worker.register("resource.cleanup", createResourceCleanupHandler(session))
}

function resourceCleanupRequestFromPayload(
  payload: JsonValue
): CleanupExpiredResourceTicketsRequest {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return {}
  }

  const record = payload as Record<string, JsonValue>
  const request: {
    nowMs?: number
    limit?: number
  } = {}

  if (record.nowMs !== undefined) {
    request.nowMs = expectNonNegativeNumber(record.nowMs, "resource.cleanup.nowMs")
  }
  if (record.limit !== undefined) {
    request.limit = expectPositiveNumber(record.limit, "resource.cleanup.limit")
  }

  return request
}

function expectNonNegativeNumber(value: JsonValue, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`)
  }
  return Math.trunc(value)
}

function expectPositiveNumber(value: JsonValue, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`)
  }
  return Math.trunc(value)
}
