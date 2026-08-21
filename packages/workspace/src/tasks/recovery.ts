import { randomBytes, randomUUID } from "node:crypto"
import type { WorkspaceTaskRunSnapshot } from "@wanex/protocol"
import type { WorkspaceIsolationAdapter } from "../isolation/index.js"
import {
  serializeWorkspaceTaskError,
  workspaceTaskFailureJson,
  workspaceTaskReceiptFromSnapshot
} from "./receipt.js"
import {
  WorkspaceTaskLeaseRenewal,
  type WorkspaceTaskClaimIdentity
} from "./renewal.js"
import type { WorkspaceTaskStore } from "./storage.js"
import type {
  RecoverWorkspaceTaskRequest,
  WorkspaceTaskReceipt
} from "./types.js"

const RECOVERY_REQUIRED_MESSAGE =
  "workspace task owner was lost before execution settlement could be proven"

export async function recoverWorkspaceTask(
  options: {
    readonly storage: WorkspaceTaskStore
    readonly readOnlyIsolation: WorkspaceIsolationAdapter
    readonly writableIsolation: WorkspaceIsolationAdapter
    readonly repositoryId: string
    readonly ownerId: string
    readonly leaseMs: number
  },
  request: RecoverWorkspaceTaskRequest
): Promise<WorkspaceTaskReceipt> {
  const runId = requireOpaqueId(request.runId)
  const current = await requireSnapshot(options.storage, runId)
  assertRepository(current, options.repositoryId)
  if (current.run.state === "released" || current.run.state === "attention") {
    return await workspaceTaskReceiptFromSnapshot(options.storage, current)
  }

  const identity: WorkspaceTaskClaimIdentity = {
    runId,
    attemptId: `wtat_${randomUUID().replaceAll("-", "")}`,
    claimToken: randomBytes(32).toString("hex")
  }
  const claim = await options.storage.claimWorkspaceTaskRecovery({
    ...identity,
    ownerId: options.ownerId,
    leaseMs: options.leaseMs
  })
  if (claim.status === "already_terminal") {
    return await workspaceTaskReceiptFromSnapshot(options.storage, claim.snapshot)
  }
  if (claim.status !== "claimed") {
    return failedRecoveryReceipt(claim.snapshot, "workspace task is already active")
  }

  const renewal = new WorkspaceTaskLeaseRenewal({
    storage: options.storage,
    identity,
    leaseMs: options.leaseMs
  })
  renewal.start()
  try {
    if (
      claim.snapshot.run.state === "preparing" ||
      claim.snapshot.run.state === "active" ||
      claim.snapshot.run.state === "collecting"
    ) {
      const attention = await options.storage.markWorkspaceTaskAttention({
        ...identity,
        failure: workspaceTaskFailureJson(
          { message: RECOVERY_REQUIRED_MESSAGE },
          "workspace_task.recovery_required"
        )
      })
      return await workspaceTaskReceiptFromSnapshot(options.storage, attention)
    }

    let snapshot = claim.snapshot
    if (snapshot.run.state === "proposed") {
      snapshot = await options.storage.beginWorkspaceTaskRelease(identity)
    }
    if (snapshot.run.state !== "releasing") {
      throw new Error(
        `workspace task recovery cannot continue from state ${snapshot.run.state}`
      )
    }
    await releaseDurableIsolation(options, snapshot)
    renewal.assertHealthy()
    const released = await options.storage.finalizeWorkspaceTaskRelease(identity)
    return await workspaceTaskReceiptFromSnapshot(options.storage, released)
  } catch (error) {
    const taskError = serializeWorkspaceTaskError(error)
    try {
      const attention = await options.storage.markWorkspaceTaskAttention({
        ...identity,
        failure: workspaceTaskFailureJson(
          taskError,
          "workspace_task.recovery_required"
        )
      })
      return await workspaceTaskReceiptFromSnapshot(options.storage, attention)
    } catch {
      return failedRecoveryReceipt(claim.snapshot, taskError.message)
    }
  } finally {
    await renewal.stop()
  }
}

async function releaseDurableIsolation(
  options: {
    readonly readOnlyIsolation: WorkspaceIsolationAdapter
    readonly writableIsolation: WorkspaceIsolationAdapter
    readonly repositoryId: string
  },
  snapshot: WorkspaceTaskRunSnapshot
): Promise<void> {
  const writable = snapshot.run.access === "writable"
  await (writable
    ? options.writableIsolation
    : options.readOnlyIsolation
  ).releaseDurable({
    id: snapshot.run.isolationId,
    kind: writable ? "git_worktree" : "fixed",
    ...(writable ? { repositoryId: options.repositoryId } : {}),
    ...(snapshot.run.baseRevision === undefined
      ? {}
      : { baseRevision: snapshot.run.baseRevision }),
    ...(snapshot.run.runtimeRef === undefined
      ? {}
      : { branchName: snapshot.run.runtimeRef })
  })
}

async function requireSnapshot(
  storage: WorkspaceTaskStore,
  runId: string
): Promise<WorkspaceTaskRunSnapshot> {
  const snapshot = await storage.getWorkspaceTaskRun({ runId })
  if (snapshot === null) {
    throw new Error(`workspace task run does not exist: ${runId}`)
  }
  return snapshot
}

function assertRepository(
  snapshot: WorkspaceTaskRunSnapshot,
  repositoryId: string
): void {
  if (snapshot.run.repositoryId !== repositoryId) {
    throw new Error("workspace task belongs to a different repository")
  }
}

function failedRecoveryReceipt(
  snapshot: WorkspaceTaskRunSnapshot,
  message: string
): WorkspaceTaskReceipt {
  return {
    taskId: snapshot.run.id,
    status: "failed",
    access: snapshot.run.access,
    workspaceId: snapshot.run.workspaceId,
    principalId: snapshot.run.principalId,
    resources: [],
    error: { message }
  }
}

function requireOpaqueId(value: string): string {
  if (!/^[A-Za-z0-9_.:-]{1,256}$/.test(value)) {
    throw new Error("workspace task runId must be an opaque identifier")
  }
  return value
}
