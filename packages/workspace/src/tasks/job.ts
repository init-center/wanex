import type { JsonValue, SchedulerJobRecord } from "@wanex/protocol"
import type { WorkspaceTaskStore } from "./storage.js"
import type { WanexWorker, WorkerHandler, WorkerHandlerContext } from "@wanex/runtime/jobs"
import {
  workspaceTaskJobPayloadFromJson,
  workspaceTaskJobPayloadToJson,
  workspaceTaskJobResultFromReceipt,
  workspaceTaskJobResultToJson
} from "./codec.js"
import {
  WorkspaceTaskJobFailedError,
  type SubmitWorkspaceTaskJobRequest,
  type WorkspaceTaskHandler,
  type WorkspaceTaskJobHandlerOptions
} from "./types.js"

export async function submitWorkspaceTaskJob(
  storage: WorkspaceTaskStore,
  request: SubmitWorkspaceTaskJobRequest
): Promise<SchedulerJobRecord> {
  if (request.handlerId.length === 0) {
    throw new Error("workspace.task handlerId must not be empty")
  }
  return await storage.enqueueJob({
    ...(request.id === undefined ? {} : { id: request.id }),
    kind: "workspace.task",
    principalId: request.principalId,
    payload: workspaceTaskJobPayloadToJson({
      handlerId: request.handlerId,
      access: request.access,
      input: request.input,
      ...(request.taskId === undefined ? {} : { taskId: request.taskId }),
      ...(request.workspaceId === undefined ? {} : { workspaceId: request.workspaceId }),
      principalId: request.principalId,
      ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
      ...(request.agentId === undefined ? {} : { agentId: request.agentId })
    }),
    ...(request.scheduledAt === undefined
      ? {}
      : { scheduledAt: request.scheduledAt }),
    ...(request.notBefore === undefined ? {} : { notBefore: request.notBefore }),
    ...(request.priority === undefined ? {} : { priority: request.priority }),
    ...(request.maxAttempts === undefined ? {} : { maxAttempts: request.maxAttempts }),
    ...(request.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: request.idempotencyKey })
  })
}

export function createWorkspaceTaskJobHandler(
  options: WorkspaceTaskJobHandlerOptions
): WorkerHandler {
  return async (context: WorkerHandlerContext): Promise<JsonValue> => {
    if (context.signal.aborted) {
      throw new Error(`workspace.task job aborted before start: ${context.job.id}`)
    }
    const payload = workspaceTaskJobPayloadFromJson(context.job.payload)
    const handler = getRegisteredTaskHandler(options.handlers, payload.handlerId)
    if (handler === undefined) {
      throw new Error(`workspace.task handler not registered: ${payload.handlerId}`)
    }
    const receipt = await options.runtime.runTask({
      access: payload.access,
      input: payload.input,
      ...(payload.taskId === undefined ? {} : { id: payload.taskId }),
      principalId: payload.principalId ?? context.job.principalId,
      jobId: payload.jobId ?? context.job.id,
      ...(payload.workspaceId === undefined ? {} : { workspaceId: payload.workspaceId }),
      ...(payload.agentId === undefined ? {} : { agentId: payload.agentId }),
      handler
    })
    const result = workspaceTaskJobResultFromReceipt(receipt)
    if (result.status === "failed") {
      throw new WorkspaceTaskJobFailedError(result)
    }
    return workspaceTaskJobResultToJson(result)
  }
}

export function registerWorkspaceTaskJobHandler(
  worker: WanexWorker,
  options: WorkspaceTaskJobHandlerOptions
): void {
  worker.register("workspace.task", createWorkspaceTaskJobHandler(options))
}

function getRegisteredTaskHandler(
  handlers: WorkspaceTaskJobHandlerOptions["handlers"],
  handlerId: string
): WorkspaceTaskHandler | undefined {
  if (isHandlerMap(handlers)) {
    return handlers.get(handlerId)
  }
  return handlers[handlerId]
}

function isHandlerMap(
  handlers: WorkspaceTaskJobHandlerOptions["handlers"]
): handlers is ReadonlyMap<string, WorkspaceTaskHandler> {
  return typeof (handlers as { get?: unknown }).get === "function"
}
