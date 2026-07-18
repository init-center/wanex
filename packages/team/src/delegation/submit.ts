import type { SubmitSessionRunReceipt } from "@wanex/protocol"
import type { DelegationExecutor } from "./executor.js"
import { runtimeIdsForTask } from "./ids.js"
import type {
  DelegationPlan,
  DelegationSubmission,
  DelegationTaskRuntimeIds,
  DelegationTaskSubmission
} from "./types.js"

export async function submitDelegation(input: {
  readonly executor: DelegationExecutor
  readonly plan: DelegationPlan
}): Promise<DelegationSubmission> {
  const tasks: DelegationTaskSubmission[] = []
  for (const task of input.plan.tasks) {
    const ids = runtimeIdsForTask(input.plan.id, task)
    const providerProfileId =
      task.providerProfileId ?? input.plan.providerProfileId
    const submitted = await input.executor.submitUserText({
      text: task.prompt,
      sessionId: ids.sessionId,
      title: task.title ?? input.plan.title ?? task.prompt,
      principalId:
        task.principalId ?? input.plan.principalId ?? "team-delegation",
      idempotencyKey: ids.inputIdempotencyKey,
      inputId: ids.inputId,
      jobId: ids.jobId,
      jobIdempotencyKey: ids.jobIdempotencyKey,
      ...(providerProfileId === undefined ? {} : { providerProfileId }),
      ...(task.mode === undefined ? {} : { mode: task.mode }),
      ...(task.maxSteps === undefined ? {} : { maxSteps: task.maxSteps })
    })
    assertReceiptMatchesTask(ids, submitted.receipt)
    tasks.push({
      task,
      ids,
      receipt: submitted.receipt
    })
  }
  return {
    delegationId: input.plan.id,
    tasks
  }
}

function assertReceiptMatchesTask(
  ids: DelegationTaskRuntimeIds,
  receipt: SubmitSessionRunReceipt
): void {
  if (receipt.admission.sessionId !== ids.sessionId) {
    throw new Error(`delegation task admitted unexpected session: ${ids.taskId}`)
  }
  if (receipt.admission.inputId !== ids.inputId) {
    throw new Error(`delegation task admitted unexpected input: ${ids.taskId}`)
  }
}
