import type {
  SessionTurnExecutionBinding,
  TeamDeliveryMaterializationContext
} from "@wanex/protocol"
import {
  workerAcknowledged,
  type WanexWorker,
  type WorkerHandler
} from "@wanex/runtime/jobs"
import type { TeamConversationStorage } from "./storage.js"

export interface TeamDeliveryExecutionBindingResolution {
  readonly executionBinding: SessionTurnExecutionBinding
  readonly maxSteps?: number
  readonly childPriority?: number
}

export type TeamDeliveryExecutionBindingResolver = (input: {
  readonly context: TeamDeliveryMaterializationContext
  readonly signal: AbortSignal
}) =>
  | Promise<TeamDeliveryExecutionBindingResolution>
  | TeamDeliveryExecutionBindingResolution

export interface TeamDeliveryWorkerHandlerOptions {
  readonly storage: TeamConversationStorage
  readonly resolveExecutionBinding: TeamDeliveryExecutionBindingResolver
}

export interface TeamDeliveryOutcomeWorkerHandlerOptions {
  readonly storage: TeamConversationStorage
}

export function createTeamDeliveryWorkerHandler(
  options: TeamDeliveryWorkerHandlerOptions
): WorkerHandler {
  return async ({ job, signal }) => {
    if (job.kind !== "team.delivery") {
      throw new Error(`team delivery handler received job kind: ${job.kind}`)
    }
    const workerId = requireString(job.leaseOwner, "team delivery lease owner")
    const leaseToken = requireString(job.leaseToken, "team delivery lease token")
    const deliveryId = deliveryIdFromPayload(job.payload)
    try {
      if (signal.aborted) throw new Error("team delivery materialization was aborted")
      const context = await options.storage.getTeamDeliveryMaterializationContext(deliveryId)
      if (context === null) {
        throw new Error(`team delivery does not exist: ${deliveryId}`)
      }
      const resolved = await options.resolveExecutionBinding({ context, signal })
      if (signal.aborted) throw new Error("team delivery materialization was aborted")
      const receipt = await options.storage.materializeTeamDelivery({
        deliveryId,
        dispatchJobId: job.id,
        workerId,
        leaseToken,
        executionBinding: resolved.executionBinding,
        ...(resolved.maxSteps === undefined ? {} : { maxSteps: resolved.maxSteps }),
        ...(resolved.childPriority === undefined
          ? {}
          : { childPriority: resolved.childPriority })
      })
      return workerAcknowledged(receipt.dispatchJob)
    } catch (error) {
      const normalized = normalizeError(error)
      const receipt = await options.storage.failTeamDeliveryMaterialization({
        deliveryId,
        dispatchJobId: job.id,
        workerId,
        leaseToken,
        error: {
          type: "team_delivery_materialization",
          message: normalized.message
        }
      })
      return workerAcknowledged(receipt.dispatchJob, normalized)
    }
  }
}

export function registerTeamDeliveryWorkerHandler(
  worker: WanexWorker,
  options: TeamDeliveryWorkerHandlerOptions
): void {
  worker.register("team.delivery", createTeamDeliveryWorkerHandler(options))
}

export function createTeamDeliveryOutcomeWorkerHandler(
  options: TeamDeliveryOutcomeWorkerHandlerOptions
): WorkerHandler {
  return async ({ job }) => {
    if (job.kind !== "team.delivery.outcome") {
      throw new Error(`team outcome handler received job kind: ${job.kind}`)
    }
    const receipt = await options.storage.projectTeamDeliveryOutcome({
      deliveryId: deliveryIdFromPayload(job.payload),
      outcomeJobId: job.id,
      workerId: requireString(job.leaseOwner, "team outcome lease owner"),
      leaseToken: requireString(job.leaseToken, "team outcome lease token")
    })
    return workerAcknowledged(receipt.outcomeJob)
  }
}

export function registerTeamDeliveryOutcomeWorkerHandler(
  worker: WanexWorker,
  options: TeamDeliveryOutcomeWorkerHandlerOptions
): void {
  worker.register(
    "team.delivery.outcome",
    createTeamDeliveryOutcomeWorkerHandler(options)
  )
}

function deliveryIdFromPayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("team delivery job payload must be an object")
  }
  return requireString(
    (payload as Record<string, unknown>).teamDeliveryId,
    "team delivery job payload teamDeliveryId"
  )
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error(String(error))
}
