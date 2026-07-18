import type { JsonValue, SchedulerJobRecord } from "@wanex/protocol"
import type { DelegationExecutor } from "./executor.js"
import { runtimeIdsForTask } from "./ids.js"
import type {
  DelegationPlan,
  DelegationSummary,
  DelegationTaskResult,
  DelegationTaskRuntimeIds,
  DelegationTaskStatus
} from "./types.js"

export async function collectDelegation(input: {
  readonly executor: DelegationExecutor
  readonly plan: DelegationPlan
}): Promise<DelegationSummary> {
  const allJobs = await input.executor.listJobs({
    kind: "session.run",
    limit: Math.max(input.plan.tasks.length * 4, 20)
  })
  const tasks = await Promise.all(
    input.plan.tasks.map(async (task) => {
      const ids = runtimeIdsForTask(input.plan.id, task)
      const job = findTaskJob(allJobs, ids)
      const messages = await input.executor.listSessionMessages({
        sessionId: ids.sessionId
      })
      const assistantMessages = messages.filter(
        (message) => message.role === "assistant" && message.inputId === ids.inputId
      )
      const output = assistantMessages.flatMap((message) => message.content)
      return {
        task,
        ids,
        status: statusForJob(job),
        ...(job === undefined ? {} : { job }),
        assistantMessages,
        output,
        ...(job?.lastError === undefined ? {} : { error: job.lastError })
      }
    })
  )
  return {
    delegationId: input.plan.id,
    status: summarizeStatus(tasks),
    tasks
  }
}

function findTaskJob(
  jobs: readonly SchedulerJobRecord[],
  ids: DelegationTaskRuntimeIds
): SchedulerJobRecord | undefined {
  return jobs.find((job) => {
    if (job.id === ids.jobId || job.idempotencyKey === ids.jobIdempotencyKey) {
      return true
    }
    const payload = job.payload
    return (
      isRecord(payload) &&
      payload.sessionId === ids.sessionId &&
      payload.inputId === ids.inputId
    )
  })
}

function statusForJob(job: SchedulerJobRecord | undefined): DelegationTaskStatus {
  if (job === undefined) {
    return "pending"
  }
  switch (job.state) {
    case "succeeded":
      return "succeeded"
    case "failed":
      return "failed"
    case "cancelled":
      return "cancelled"
    case "running":
      return "running"
    case "pending":
    case "ready":
    case "retry_scheduled":
      return "pending"
    default: {
      const exhaustive: never = job.state
      throw new Error(`unknown scheduler job state: ${exhaustive}`)
    }
  }
}

function summarizeStatus(
  tasks: readonly Pick<DelegationTaskResult, "status">[]
): DelegationTaskStatus {
  if (tasks.some((task) => task.status === "running")) {
    return "running"
  }
  if (tasks.some((task) => task.status === "pending")) {
    return "pending"
  }
  if (tasks.every((task) => task.status === "succeeded")) {
    return "succeeded"
  }
  if (tasks.some((task) => task.status === "failed")) {
    return "failed"
  }
  return "cancelled"
}

function isRecord(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
