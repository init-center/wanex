import { assert } from "../scenario-utils.js"
import type {
  DelegationRetryPolicyResult,
  DelegationTerminalPolicyFixtureRequest
} from "./types.js"

export async function runRetryPolicyFixture(
  request: DelegationTerminalPolicyFixtureRequest
): Promise<DelegationRetryPolicyResult> {
  const { context, runtime } = request
  const retryGraph = await runtime.createGraph({
    id: "graph_eval_retry_policy",
    title: "Eval retry dependency policy",
    idempotencyKey: "eval-delegation-graph-retry-policy"
  })
  const retrySource = await runtime.addNode({
    id: "dgn_eval_retry_source",
    graphId: retryGraph.id,
    kind: "workspace_task",
    payload: { handlerId: "eval-retry-task" },
    idempotencyKey: "eval-retry-policy-source"
  })
  const retryDependent = await runtime.addNode({
    id: "dgn_eval_retry_after_success",
    graphId: retryGraph.id,
    kind: "workspace_task",
    payload: { handlerId: "must-not-run-while-retrying" },
    idempotencyKey: "eval-retry-policy-after-success"
  })
  await runtime.addDependency({
    graphId: retryGraph.id,
    fromNodeId: retrySource.id,
    toNodeId: retryDependent.id
  })
  await runtime.updateGraphState(retryGraph.id, "running")
  const retryMaterialized = await runtime.materializeReadyNode({
    graphId: retryGraph.id,
    nodeId: retrySource.id,
    workerId: "eval_retry_policy_graph_worker",
    jobId: "job_eval_retry_policy_source",
    jobKind: "tool.deferred_result",
    priority: 100,
    maxAttempts: 2,
    retryPolicy: {
      strategy: "fixed",
      initialDelayMs: 60_000
    }
  })
  assert(retryMaterialized !== null, "retry source should materialize")
  const retryClaimed = await context.storage.claimJob({
    workerId: "eval_retry_policy_workspace_worker",
    leaseMs: 60_000,
    kinds: ["tool.deferred_result"]
  })
  assert(
    retryClaimed?.id === retryMaterialized.job.id,
    "retry source job should be claimed"
  )
  const retryScheduled = await context.storage.failJob({
    jobId: retryClaimed.id,
    workerId: "eval_retry_policy_workspace_worker",
    leaseToken: retryClaimed.leaseToken!,
    error: { message: "retry later" }
  })
  assert(
    retryScheduled?.state === "retry_scheduled",
    "retry job should remain non-terminal"
  )
  const retryStep = await runtime.runGraphStep({
    graphId: retryGraph.id,
    workerId: "eval_retry_policy_graph_worker",
    jobKindsByNodeKind: {
      workspace_task: "tool.deferred_result"
    },
    readyScanLimit: 1,
    materializeLimit: 1
  })
  assert(
    retryStep.materialized.length === 0,
    "retry_scheduled source must not release dependents"
  )
  assert(
    retryStep.syncNoops.some(
      (item) =>
        item.reason === "non_terminal_job" &&
        item.node?.id === retrySource.id &&
        item.job?.state === "retry_scheduled"
    ),
    "retry_scheduled source should be reported as non-terminal"
  )
  await context.storage.cancelJob({
    jobId: retryMaterialized.job.id,
    reason: "eval cleanup after retry policy assertion"
  })
  await runtime.runGraphStep({
    graphId: retryGraph.id,
    workerId: "eval_retry_policy_graph_worker",
    jobKindsByNodeKind: {
      workspace_task: "tool.deferred_result"
    },
    readyScanLimit: 1,
    materializeLimit: 0
  })

  return {
    retryGraphId: retryGraph.id,
    retryJobState: retryScheduled.state,
    retrySyncNoopReasons: retryStep.syncNoops.map((item) => item.reason),
    retryMaterializedNodeIds: retryStep.materialized.map((item) => item.node.id)
  }
}
