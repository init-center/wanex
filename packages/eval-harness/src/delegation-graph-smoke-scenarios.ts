import { DelegationGraphRuntime } from "@wanex/team/delegation/graph"
import { createEvalScenario } from "./runner.js"
import { assert } from "./scenario-utils.js"

export const delegationGraphProductSmokeScenario = createEvalScenario({
  id: "delegation-graph.product-smoke",
  title: "Delegation graph step syncs terminal work and materializes dependents",
  tags: ["delegation", "graph", "scheduler", "product-path"],
  async run(context) {
    const runtime = new DelegationGraphRuntime({
      storage: context.storage,
      principalId: "principal_eval_delegation_graph"
    })
    const graph = await runtime.createGraph({
      id: "graph_eval_product",
      title: "Eval delegation graph",
      idempotencyKey: "eval-delegation-graph"
    })
    const source = await runtime.addNode({
      id: "dgn_eval_source",
      graphId: graph.id,
      kind: "workspace_task",
      payload: { handlerId: "eval-workspace-task", prompt: "inspect first" },
      idempotencyKey: "eval-delegation-graph-source"
    })
    const dependent = await runtime.addNode({
      id: "dgn_eval_dependent",
      graphId: graph.id,
      kind: "workspace_task",
      payload: { handlerId: "eval-summary-task", mode: "summary" },
      idempotencyKey: "eval-delegation-graph-dependent"
    })
    await runtime.addDependency({
      graphId: graph.id,
      fromNodeId: source.id,
      toNodeId: dependent.id
    })
    await runtime.updateGraphState(graph.id, "running")
    const firstStep = await runtime.runGraphStep({
      graphId: graph.id,
      workerId: "eval_delegation_graph_worker",
      jobKindsByNodeKind: {
        workspace_task: "workspace.task"
      }
    })
    const sourceMaterialized = firstStep.materialized[0]
    assert(sourceMaterialized !== undefined, "source node should materialize")
    assert(
      sourceMaterialized.node.id === source.id,
      "materialized node should attach scheduler job"
    )
    const claimed = await context.storage.claimJob({
      workerId: "eval_delegation_graph_workspace_worker",
      leaseMs: 60_000,
      kinds: ["workspace.task"]
    })
    assert(
      claimed?.id === sourceMaterialized.job.id,
      "app worker should claim source materialized job"
    )
    const completed = await context.storage.completeJob({
      jobId: claimed.id,
      workerId: "eval_delegation_graph_workspace_worker",
      leaseToken: claimed.leaseToken!,
      result: { source: "done" }
    })
    assert(completed?.state === "succeeded", "source job should complete")
    const secondStep = await runtime.runGraphStep({
      graphId: graph.id,
      workerId: "eval_delegation_graph_worker",
      jobKindsByNodeKind: {
        workspace_task: "workspace.task"
      }
    })
    const snapshot = await runtime.getGraphSnapshot(graph.id)
    assert(
      secondStep.synced.some((item) => item.node.id === source.id),
      "second graph step should sync source success"
    )
    assert(
      secondStep.materialized.some((item) => item.node.id === dependent.id),
      "second graph step should materialize dependent node"
    )
    assert(snapshot !== null, "graph snapshot should exist")
    return {
      graphId: graph.id,
      sourceJobState: completed.state,
      firstMaterializedNodeIds: firstStep.materialized.map(
        (item) => item.node.id
      ),
      syncedNodeIds: secondStep.synced.map((item) => item.node.id),
      secondMaterializedNodeIds: secondStep.materialized.map(
        (item) => item.node.id
      ),
      snapshotNodeCount: snapshot.nodes.length,
      snapshotDependencyCount: snapshot.dependencies.length
    }
  }
})
