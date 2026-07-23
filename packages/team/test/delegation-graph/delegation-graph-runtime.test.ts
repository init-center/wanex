import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { DelegationGraphRuntime } from "../../src/delegation/graph/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const clients: StorageTestStore[] = []

afterEach(async () => {
  while (clients.length > 0) {
    await clients.pop()?.dispose()
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/team/delegation/graph", () => {
  it("records a durable graph and releases dependent nodes after success", async () => {
    const { runtime } = await createRuntime()
    const graph = await runtime.createGraph({
      title: "Runtime delegation graph",
      metadata: { source: "runtime-test" },
      idempotencyKey: "runtime-graph-key"
    })
    const duplicate = await runtime.createGraph({
      title: "Runtime delegation graph",
      metadata: { source: "runtime-test" },
      idempotencyKey: "runtime-graph-key"
    })
    expect(duplicate.id).toBe(graph.id)

    const inspect = await runtime.addNode({
      graphId: graph.id,
      kind: "agent_task",
      principalId: "agent_inspect",
      payload: { prompt: "inspect" },
      idempotencyKey: "runtime-node-inspect"
    })
    const summarize = await runtime.addNode({
      graphId: graph.id,
      kind: "aggregation",
      payload: { mode: "summary" }
    })
    await runtime.addDependency({
      graphId: graph.id,
      fromNodeId: inspect.id,
      toNodeId: summarize.id
    })

    await expect(runtime.listReadyNodes(graph.id)).resolves.toMatchObject([
      { id: inspect.id }
    ])

    await runtime.updateGraphState(graph.id, "running")
    const materialized = await runtime.materializeReadyNode({
      graphId: graph.id,
      nodeId: inspect.id,
      workerId: "orchestrator_runtime",
      jobId: "job_runtime_inspect",
      jobKind: "workspace.task"
    })
    expect(materialized?.node).toMatchObject({
      id: inspect.id,
      schedulerJobId: "job_runtime_inspect"
    })
    expect(materialized?.job.payload).toMatchObject({
      delegationGraphId: graph.id,
      delegationNodeId: inspect.id,
      nodeKind: "agent_task"
    })
    await expect(runtime.listReadyNodes(graph.id)).resolves.toEqual([])

    await runtime.markNodeSucceeded(inspect.id, { result: "ok" })
    await expect(runtime.listReadyNodes(graph.id)).resolves.toMatchObject([
      { id: summarize.id }
    ])

    const snapshot = await runtime.getGraphSnapshot(graph.id)
    expect(snapshot?.graph).toMatchObject({
      id: graph.id,
      state: "running"
    })
    expect(snapshot?.nodes.map((node) => node.id)).toEqual([
      inspect.id,
      summarize.id
    ])
    expect(snapshot?.dependencies).toHaveLength(1)
  })

  it("supports after_terminal dependencies for failed source nodes", async () => {
    const { runtime } = await createRuntime()
    const graph = await runtime.createGraph({ id: "graph_terminal" })
    const source = await runtime.addNode({
      graphId: graph.id,
      kind: "agent_task",
      payload: { prompt: "may fail" }
    })
    const cleanup = await runtime.addNode({
      graphId: graph.id,
      kind: "tool_task",
      payload: { tool: "cleanup" }
    })
    await runtime.addDependency({
      graphId: graph.id,
      fromNodeId: source.id,
      toNodeId: cleanup.id,
      kind: "after_terminal"
    })

    await expect(runtime.listReadyNodes(graph.id)).resolves.toMatchObject([
      { id: source.id }
    ])
    await runtime.markNodeRunning(source.id)
    await runtime.markNodeFailed(source.id, { error: "expected" })
    await expect(runtime.listReadyNodes(graph.id)).resolves.toMatchObject([
      { id: cleanup.id }
    ])
  })

  it("rejects invalid graph dependencies through the durable contract", async () => {
    const { runtime } = await createRuntime()
    const graphA = await runtime.createGraph({ id: "graph_a" })
    const graphB = await runtime.createGraph({ id: "graph_b" })
    const nodeA = await runtime.addNode({
      graphId: graphA.id,
      kind: "agent_task",
      payload: {}
    })
    const nodeB = await runtime.addNode({
      graphId: graphB.id,
      kind: "agent_task",
      payload: {}
    })

    await expect(
      runtime.addDependency({
        graphId: graphA.id,
        fromNodeId: nodeA.id,
        toNodeId: nodeA.id
      })
    ).rejects.toThrow(/same node/)
    await expect(
      runtime.addDependency({
        graphId: graphA.id,
        fromNodeId: nodeA.id,
        toNodeId: nodeB.id
      })
    ).rejects.toThrow(/belong to graph/)
  })

  it("syncs materialized node state from terminal scheduler jobs", async () => {
    const { runtime, storage } = await createRuntime()
    const graph = await runtime.createGraph({ id: "graph_sync_success" })
    const source = await runtime.addNode({
      id: "node_sync_success",
      graphId: graph.id,
      kind: "workspace_task",
      payload: { handlerId: "sync" }
    })
    const dependent = await runtime.addNode({
      id: "node_sync_dependent",
      graphId: graph.id,
      kind: "aggregation",
      payload: { mode: "summary" }
    })
    await runtime.addDependency({
      graphId: graph.id,
      fromNodeId: source.id,
      toNodeId: dependent.id
    })
    await runtime.updateGraphState(graph.id, "running")
    const materialized = await runtime.materializeReadyNode({
      graphId: graph.id,
      nodeId: source.id,
      workerId: "worker_sync",
      jobId: "job_sync_success",
      jobKind: "workspace.task"
    })
    const claimed = await storage.claimJob({
      workerId: "workspace_worker_sync",
      leaseMs: 60_000,
      kinds: ["workspace.task"]
    })
    expect(claimed?.id).toBe(materialized?.job.id)
    await storage.completeJob({
      jobId: claimed!.id,
      workerId: "workspace_worker_sync",
      leaseToken: claimed!.leaseToken!,
      result: { ok: true }
    })

    const synced = await runtime.syncMaterializedNodeJob(source.id)
    expect(synced).toMatchObject({
      status: "synced",
      node: {
        id: source.id,
        state: "succeeded",
        metadata: {
          schedulerJob: {
            id: "job_sync_success",
            kind: "workspace.task",
            state: "succeeded",
            result: { ok: true }
          }
        }
      }
    })
    await expect(runtime.listReadyNodes(graph.id)).resolves.toMatchObject([
      { id: dependent.id }
    ])
  })

  it("syncs failed and cancelled scheduler jobs into terminal node states", async () => {
    const { runtime, storage } = await createRuntime()
    const graph = await runtime.createGraph({ id: "graph_sync_terminal" })
    const failed = await runtime.addNode({
      id: "node_sync_failed",
      graphId: graph.id,
      kind: "workspace_task",
      payload: { handlerId: "fail" }
    })
    const cancelled = await runtime.addNode({
      id: "node_sync_cancelled",
      graphId: graph.id,
      kind: "workspace_task",
      payload: { handlerId: "cancel" }
    })
    await runtime.updateGraphState(graph.id, "running")
    await runtime.materializeReadyNode({
      graphId: graph.id,
      nodeId: failed.id,
      workerId: "worker_sync_failed",
      jobId: "job_sync_failed",
      jobKind: "workspace.task"
    })
    await runtime.materializeReadyNode({
      graphId: graph.id,
      nodeId: cancelled.id,
      workerId: "worker_sync_cancelled",
      jobId: "job_sync_cancelled",
      jobKind: "workspace.task"
    })

    const failedClaim = await storage.claimJob({
      workerId: "workspace_worker_failed",
      leaseMs: 60_000,
      kinds: ["workspace.task"]
    })
    await storage.failJob({
      jobId: failedClaim!.id,
      workerId: "workspace_worker_failed",
      leaseToken: failedClaim!.leaseToken!,
      error: { message: "expected failure" }
    })
    await storage.cancelJob({
      jobId: "job_sync_cancelled",
      reason: "not needed"
    })

    await expect(runtime.syncMaterializedNodeJob(failed.id)).resolves.toMatchObject({
      status: "synced",
      node: {
        id: failed.id,
        state: "failed",
        metadata: {
          schedulerJob: {
            id: "job_sync_failed",
            state: "failed",
            lastError: { message: "expected failure" }
          }
        }
      }
    })
    await expect(
      runtime.syncMaterializedNodeJob(cancelled.id)
    ).resolves.toMatchObject({
      status: "synced",
      node: {
        id: cancelled.id,
        state: "cancelled",
        metadata: {
          schedulerJob: {
            id: "job_sync_cancelled",
            state: "cancelled"
          }
        }
      }
    })
  })

  it("keeps sync as no-op for missing, unattached, non-terminal, and terminal nodes", async () => {
    const { runtime } = await createRuntime()
    const graph = await runtime.createGraph({ id: "graph_sync_noop" })
    const unattached = await runtime.addNode({
      id: "node_sync_unattached",
      graphId: graph.id,
      kind: "workspace_task",
      payload: { handlerId: "noop" }
    })
    const running = await runtime.addNode({
      id: "node_sync_running",
      graphId: graph.id,
      kind: "workspace_task",
      payload: { handlerId: "running" }
    })
    const missingJob = await runtime.addNode({
      id: "node_sync_missing_job",
      graphId: graph.id,
      kind: "workspace_task",
      payload: { handlerId: "missing" }
    })
    await runtime.updateGraphState(graph.id, "running")
    await runtime.materializeReadyNode({
      graphId: graph.id,
      nodeId: running.id,
      workerId: "worker_sync_running",
      jobId: "job_sync_running",
      jobKind: "workspace.task"
    })
    await runtime.attachNodeJob(missingJob.id, "job_sync_missing")
    await runtime.markNodeSucceeded(unattached.id)

    await expect(
      runtime.syncMaterializedNodeJob("node_sync_absent")
    ).resolves.toMatchObject({
      status: "noop",
      reason: "missing_node"
    })
    await expect(
      runtime.syncMaterializedNodeJob(unattached.id)
    ).resolves.toMatchObject({
      status: "noop",
      reason: "already_terminal"
    })
    await expect(
      runtime.syncMaterializedNodeJob(running.id)
    ).resolves.toMatchObject({
      status: "noop",
      reason: "non_terminal_job",
      job: { id: "job_sync_running", state: "ready" }
    })
    await expect(
      runtime.syncMaterializedNodeJob(missingJob.id)
    ).resolves.toMatchObject({
      status: "noop",
      reason: "missing_job"
    })
  })

  it("runs one graph step by syncing terminal jobs and materializing ready nodes", async () => {
    const { runtime, storage } = await createRuntime()
    const graph = await runtime.createGraph({ id: "graph_step" })
    const source = await runtime.addNode({
      id: "node_step_source",
      graphId: graph.id,
      kind: "workspace_task",
      payload: { handlerId: "source" }
    })
    const dependent = await runtime.addNode({
      id: "node_step_dependent",
      graphId: graph.id,
      kind: "workspace_task",
      payload: { handlerId: "dependent" }
    })
    await runtime.addDependency({
      graphId: graph.id,
      fromNodeId: source.id,
      toNodeId: dependent.id
    })
    await runtime.updateGraphState(graph.id, "running")

    const first = await runtime.runGraphStep({
      graphId: graph.id,
      workerId: "graph_step_worker",
      jobKindsByNodeKind: {
        workspace_task: "workspace.task"
      }
    })
    expect(first).toMatchObject({
      graphId: graph.id,
      synced: [],
      syncNoops: [],
      materialized: [
        {
          node: {
            id: source.id,
            state: "running"
          },
          job: {
            kind: "workspace.task"
          }
        }
      ],
      skippedReadyNodes: []
    })

    const claimed = await storage.claimJob({
      workerId: "graph_step_workspace_worker",
      leaseMs: 60_000,
      kinds: ["workspace.task"]
    })
    expect(claimed?.id).toBe(first.materialized[0]!.job.id)
    await storage.completeJob({
      jobId: claimed!.id,
      workerId: "graph_step_workspace_worker",
      leaseToken: claimed!.leaseToken!,
      result: { source: "done" }
    })

    const second = await runtime.runGraphStep({
      graphId: graph.id,
      workerId: "graph_step_worker",
      jobKindsByNodeKind: {
        workspace_task: "workspace.task"
      }
    })
    expect(second.synced).toMatchObject([
      {
        node: {
          id: source.id,
          state: "succeeded"
        },
        job: {
          id: claimed!.id,
          state: "succeeded"
        }
      }
    ])
    expect(second.materialized).toMatchObject([
      {
        node: {
          id: dependent.id,
          state: "running"
        },
        job: {
          kind: "workspace.task"
        }
      }
    ])
  })

  it("keeps graph step policy explicit through mappings and limits", async () => {
    const { runtime } = await createRuntime()
    const graph = await runtime.createGraph({ id: "graph_step_policy" })
    const unsupported = await runtime.addNode({
      id: "node_step_unsupported",
      graphId: graph.id,
      kind: "aggregation",
      payload: { mode: "summary" }
    })
    const supported = await runtime.addNode({
      id: "node_step_supported",
      graphId: graph.id,
      kind: "workspace_task",
      payload: { handlerId: "supported" }
    })
    await runtime.updateGraphState(graph.id, "running")

    const skipped = await runtime.runGraphStep({
      graphId: graph.id,
      workerId: "graph_step_policy_worker",
      jobKindsByNodeKind: {
        workspace_task: "workspace.task"
      },
      readyScanLimit: 2,
      materializeLimit: 1
    })
    expect(skipped.materialized).toMatchObject([
      {
        node: {
          id: supported.id
        }
      }
    ])
    expect(skipped.skippedReadyNodes).toMatchObject([
      {
        node: {
          id: unsupported.id
        },
        reason: "unsupported_node_kind"
      }
    ])

    await expect(
      runtime.runGraphStep({
        graphId: graph.id,
        workerId: "graph_step_policy_worker",
        jobKindsByNodeKind: {
          workspace_task: "workspace.task"
        },
        materializeLimit: -1
      })
    ).rejects.toThrow(/materializeLimit/)
  })

  it("projects graph status for app-facing read models", async () => {
    const { runtime } = await createRuntime()
    const graph = await runtime.createGraph({ id: "graph_status" })
    const ready = await runtime.addNode({
      id: "node_status_ready",
      graphId: graph.id,
      kind: "workspace_task",
      payload: { handlerId: "ready" }
    })
    const running = await runtime.addNode({
      id: "node_status_running",
      graphId: graph.id,
      kind: "workspace_task",
      payload: { handlerId: "running" }
    })
    const failed = await runtime.addNode({
      id: "node_status_failed",
      graphId: graph.id,
      kind: "workspace_task",
      payload: { handlerId: "failed" }
    })
    const cancelled = await runtime.addNode({
      id: "node_status_cancelled",
      graphId: graph.id,
      kind: "workspace_task",
      payload: { handlerId: "cancelled" }
    })
    const blocked = await runtime.addNode({
      id: "node_status_blocked",
      graphId: graph.id,
      kind: "workspace_task",
      payload: { handlerId: "blocked" }
    })
    await runtime.addDependency({
      graphId: graph.id,
      fromNodeId: failed.id,
      toNodeId: blocked.id
    })
    await runtime.updateGraphState(graph.id, "running")
    await runtime.materializeReadyNode({
      graphId: graph.id,
      nodeId: running.id,
      workerId: "worker_status",
      jobId: "job_status_running",
      jobKind: "workspace.task"
    })
    await runtime.markNodeFailed(failed.id, { error: "expected" })
    await runtime.markNodeCancelled(cancelled.id, { reason: "expected" })

    const status = await runtime.getGraphStatus(graph.id)
    expect(status).toMatchObject({
      graph: {
        id: graph.id
      },
      progressState: "failed",
      nodeCount: 5,
      dependencyCount: 1,
      completedNodeCount: 2,
      activeNodeCount: 2,
      blockedNodeCount: 1,
      progressRatio: 0.4,
      counts: {
        pending: 2,
        ready: 0,
        running: 1,
        succeeded: 0,
        failed: 1,
        cancelled: 1,
        skipped: 0
      },
      readyNodes: [
        {
          id: ready.id
        }
      ],
      runningNodes: [
        {
          id: running.id
        }
      ],
      blockedNodes: [
        {
          node: {
            id: blocked.id
          },
          blockedBy: [
            {
              fromNodeId: failed.id,
              toNodeId: blocked.id,
              kind: "after_success"
            }
          ]
        }
      ],
      failedNodes: [
        {
          id: failed.id
        }
      ],
      cancelledNodes: [
        {
          id: cancelled.id
        }
      ]
    })
    await expect(runtime.getGraphStatus("graph_status_missing")).resolves.toBeNull()
  })
})

async function createRuntime(): Promise<{
  readonly storeDir: string
  readonly storage: StorageTestStore
  readonly runtime: DelegationGraphRuntime
}> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-delegation-graph-"))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({ kind: "local-system-service", mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  const runtime = new DelegationGraphRuntime({
    storage,
    principalId: "controller_runtime"
  })
  return { storeDir, storage, runtime }
}
