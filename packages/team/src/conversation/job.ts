import type { SchedulerJobRecord } from "@wanex/protocol"
import type { WanexWorker, WorkerHandler } from "@wanex/runtime/jobs"
import {
  teamRoundJobPayloadFromJson,
  teamRoundJobPayloadToJson,
  teamRoundJobResultToJson
} from "./codec.js"
import type {
  SubmitTeamRoundJobRequest,
  TeamRoundJobHandlerOptions,
  TeamRoundJobPayload
} from "./types.js"
import type { TeamRoundJobStorage } from "./storage.js"

export async function submitTeamRoundJob(
  storage: TeamRoundJobStorage,
  request: SubmitTeamRoundJobRequest
): Promise<SchedulerJobRecord> {
  const payload: TeamRoundJobPayload = {
    conversationId: request.conversationId,
    policy: request.policy,
    ...(request.metadata === undefined ? {} : { metadata: request.metadata })
  }
  return await storage.enqueueJob({
    ...(request.id === undefined ? {} : { id: request.id }),
    kind: "team.round.close",
    principalId: request.principalId,
    payload: teamRoundJobPayloadToJson(payload),
    ...(request.scheduledAt === undefined
      ? {}
      : { scheduledAt: request.scheduledAt }),
    ...(request.notBefore === undefined ? {} : { notBefore: request.notBefore }),
    ...(request.priority === undefined ? {} : { priority: request.priority }),
    ...(request.maxAttempts === undefined
      ? {}
      : { maxAttempts: request.maxAttempts }),
    ...(request.retryPolicy === undefined
      ? {}
      : { retryPolicy: request.retryPolicy }),
    ...(request.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: request.idempotencyKey }),
    ...(request.budgetGrantId === undefined
      ? {}
      : { budgetGrantId: request.budgetGrantId })
  })
}

export function createTeamRoundJobHandler(
  options: TeamRoundJobHandlerOptions
): WorkerHandler {
  return async ({ job, signal }) => {
    if (signal.aborted) {
      throw new Error(`team round job aborted before start: ${job.id}`)
    }
    const payload = teamRoundJobPayloadFromJson(job.payload)
    const result = await options.runtime.orchestrateRound({
      conversationId: payload.conversationId,
      policy: payload.policy,
      speakers: options.speakers
    })
    return teamRoundJobResultToJson({
      conversationId: result.conversation.id,
      stopReason: result.stopReason,
      turnIds: result.turns.map((turn) => turn.id),
      ...(payload.metadata === undefined ? {} : { metadata: payload.metadata })
    })
  }
}

export function registerTeamRoundJobHandler(
  worker: WanexWorker,
  options: TeamRoundJobHandlerOptions
): void {
  worker.register("team.round.close", createTeamRoundJobHandler(options))
}
