import type { SubmitSessionTurnReceipt } from "@wanex/protocol"
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
    const submitted = await input.executor.submitUserTurn({
      content: [{ type: "text", text: task.prompt }],
      sessionId: ids.sessionId,
      title: task.title ?? input.plan.title ?? task.prompt,
      principalId:
        task.principalId ?? input.plan.principalId ?? "team-delegation",
      idempotencyKey: ids.inputIdempotencyKey,
      inputId: ids.inputId,
      turnId: ids.turnId,
      jobId: ids.jobId,
      jobIdempotencyKey: ids.jobIdempotencyKey,
      ...(providerProfileId === undefined ? {} : { providerProfileId }),
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
  receipt: SubmitSessionTurnReceipt
): void {
  if (receipt.admission.sessionId !== ids.sessionId) {
    throw new Error(`delegation task admitted unexpected session: ${ids.taskId}`)
  }
  if (receipt.admission.inputId !== ids.inputId) {
    throw new Error(`delegation task admitted unexpected input: ${ids.taskId}`)
  }
  if (receipt.turn.id !== ids.turnId) {
    throw new Error(`delegation task admitted unexpected turn: ${ids.taskId}`)
  }
}
