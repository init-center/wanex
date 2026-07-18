import type { DelegationTask, DelegationTaskRuntimeIds } from "./types.js"

export function runtimeIdsForTask(
  delegationId: string,
  task: DelegationTask
): DelegationTaskRuntimeIds {
  const safeDelegationId = safeIdPart(delegationId, "delegation id")
  const safeTaskId = safeIdPart(task.id, "delegation task id")
  return {
    delegationId,
    taskId: task.id,
    sessionId: task.sessionId ?? `ses_delegation_${safeDelegationId}_${safeTaskId}`,
    inputId: task.inputId ?? `inp_delegation_${safeDelegationId}_${safeTaskId}`,
    jobId: task.jobId ?? `job_delegation_${safeDelegationId}_${safeTaskId}`,
    inputIdempotencyKey: `delegation:${delegationId}:${task.id}:input`,
    jobIdempotencyKey: `delegation:${delegationId}:${task.id}:job`
  }
}

function safeIdPart(value: string, label: string): string {
  if (value.length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  return value.replaceAll(/[^A-Za-z0-9_:-]/g, "_")
}
