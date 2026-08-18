import { assert } from "../scenario-utils.js"
import type {
  DelegationTerminalPolicyFixtureRequest,
  DelegationTerminalReleaseResult
} from "./types.js"

export async function runTerminalReleasePolicyFixture(
  request: DelegationTerminalPolicyFixtureRequest
): Promise<DelegationTerminalReleaseResult> {
  const { context, runtime } = request
  const graph = await runtime.createGraph({
    id: "graph_eval_terminal_policy",
    title: "Eval delegation graph terminal policy",
    idempotencyKey: "eval-delegation-graph-terminal-policy"
  })
  const failedSource = await runtime.addNode({
    id: "dgn_eval_failed_source",
    graphId: graph.id,
    kind: "workspace_task",
    payload: { handlerId: "eval-failing-task" },
    idempotencyKey: "eval-terminal-policy-failed-source"
  })
  const failedAfterSuccess = await runtime.addNode({
    id: "dgn_eval_failed_after_success",
    graphId: graph.id,
    kind: "workspace_task",
    payload: { handlerId: "must-not-run-after-failure" },
    idempotencyKey: "eval-terminal-policy-failed-after-success"
  })
  const failedAfterTerminal = await runtime.addNode({
    id: "dgn_eval_failed_after_terminal",
    graphId: graph.id,
    kind: "workspace_task",
    payload: { handlerId: "cleanup-after-failure" },
    idempotencyKey: "eval-terminal-policy-failed-after-terminal"
  })
  const cancelledSource = await runtime.addNode({
    id: "dgn_eval_cancelled_source",
    graphId: graph.id,
    kind: "workspace_task",
    payload: { handlerId: "eval-cancelled-task" },
    idempotencyKey: "eval-terminal-policy-cancelled-source"
  })
  const cancelledAfterSuccess = await runtime.addNode({
    id: "dgn_eval_cancelled_after_success",
    graphId: graph.id,
    kind: "workspace_task",
    payload: { handlerId: "must-not-run-after-cancel" },
    idempotencyKey: "eval-terminal-policy-cancelled-after-success"
  })
  const cancelledAfterTerminal = await runtime.addNode({
    id: "dgn_eval_cancelled_after_terminal",
    graphId: graph.id,
    kind: "workspace_task",
    payload: { handlerId: "cleanup-after-cancel" },
    idempotencyKey: "eval-terminal-policy-cancelled-after-terminal"
  })
  await runtime.addDependency({
    graphId: graph.id,
    fromNodeId: failedSource.id,
    toNodeId: failedAfterSuccess.id
  })
  await runtime.addDependency({
    graphId: graph.id,
    fromNodeId: failedSource.id,
    toNodeId: failedAfterTerminal.id,
    kind: "after_terminal"
  })
  await runtime.addDependency({
    graphId: graph.id,
    fromNodeId: cancelledSource.id,
    toNodeId: cancelledAfterSuccess.id
  })
  await runtime.addDependency({
    graphId: graph.id,
    fromNodeId: cancelledSource.id,
    toNodeId: cancelledAfterTerminal.id,
    kind: "after_terminal"
  })
  await runtime.updateGraphState(graph.id, "running")

  const firstStep = await runtime.runGraphStep({
    graphId: graph.id,
    workerId: "eval_terminal_policy_graph_worker",
    jobKindsByNodeKind: {
      workspace_task: "workspace.task"
    },
    readyScanLimit: 2,
    materializeLimit: 2
  })
  assert(
    firstStep.materialized.length === 2,
    `expected two source nodes to materialize, got ${firstStep.materialized.length}`
  )
  const failedJob = firstStep.materialized.find(
    (item) => item.node.id === failedSource.id
  )?.job
  const cancelledJob = firstStep.materialized.find(
    (item) => item.node.id === cancelledSource.id
  )?.job
  assert(failedJob !== undefined, "failed source job should materialize")
  assert(cancelledJob !== undefined, "cancelled source job should materialize")

  const claimedFailed = await context.storage.claimJob({
    workerId: "eval_terminal_policy_workspace_worker",
    leaseMs: 60_000,
    kinds: ["workspace.task"]
  })
  assert(claimedFailed !== null, "failed source job should be claimable")
  const failed = await context.storage.failJob({
    jobId: claimedFailed.id,
    workerId: "eval_terminal_policy_workspace_worker",
    leaseToken: claimedFailed.leaseToken!,
    error: { message: "planned failure" }
  })
  assert(failed?.state === "failed", "source job should fail terminally")

  const cancelled = await context.storage.cancelJob({
    jobId: cancelledJob.id,
    reason: "planned cancellation"
  })
  assert(cancelled?.state === "cancelled", "source job should cancel terminally")

  const secondStep = await runtime.runGraphStep({
    graphId: graph.id,
    workerId: "eval_terminal_policy_graph_worker",
    jobKindsByNodeKind: {
      workspace_task: "workspace.task"
    },
    readyScanLimit: 4,
    materializeLimit: 4
  })
  const secondMaterializedNodeIds = secondStep.materialized.map(
    (item) => item.node.id
  )
  assert(
    secondMaterializedNodeIds.includes(failedAfterTerminal.id),
    "after_terminal dependent should release after failure"
  )
  assert(
    secondMaterializedNodeIds.includes(cancelledAfterTerminal.id),
    "after_terminal dependent should release after cancellation"
  )
  assert(
    !secondMaterializedNodeIds.includes(failedAfterSuccess.id),
    "after_success dependent must not release after failure"
  )
  assert(
    !secondMaterializedNodeIds.includes(cancelledAfterSuccess.id),
    "after_success dependent must not release after cancellation"
  )
  for (const materialized of secondStep.materialized) {
    const claimedCleanup = await context.storage.claimJob({
      workerId: "eval_terminal_policy_cleanup_worker",
      leaseMs: 60_000,
      kinds: ["workspace.task"]
    })
    assert(
      claimedCleanup?.id === materialized.job.id,
      "terminal cleanup job should be claimable without leaking queue state"
    )
    await context.storage.completeJob({
      jobId: claimedCleanup.id,
      workerId: "eval_terminal_policy_cleanup_worker",
      leaseToken: claimedCleanup.leaseToken!,
      result: { cleanup: "done" }
    })
  }

  return {
    graphId: graph.id,
    syncedTerminalNodeIds: secondStep.synced.map((item) => item.node.id),
    terminalMaterializedNodeIds: secondMaterializedNodeIds,
    blockedAfterSuccessNodeIds: [
      failedAfterSuccess.id,
      cancelledAfterSuccess.id
    ]
  }
}
