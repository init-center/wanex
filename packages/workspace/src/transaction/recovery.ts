import { randomBytes, randomUUID } from "node:crypto"
import { realpath } from "node:fs/promises"
import type { WorkspaceChangeTransactionSnapshot } from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import { LocalWorkspaceReader } from "../changesets/index.js"
import {
  cleanupCommittedArtifacts,
  transactionFilePlans
} from "./artifacts.js"
import { durableId, sha256 } from "./common.js"
import {
  WorkspaceTransactionCleanupRequiredError,
  WorkspaceTransactionRecoveryRequiredError
} from "./errors.js"
import { WorkspaceTransactionLease } from "./lease.js"
import { spawnNativeWorkspaceTransaction } from "./native-helper.js"
import { rebuildTransactionReceipt } from "./receipt.js"

export async function recoverPendingTransactions(input: {
  readonly storage: WorkspaceStore
  readonly rootDir: string
  readonly serviceBin: string
  readonly leaseMs: number
  readonly workspaceId: string
  readonly canonicalRoot?: string
}): Promise<void> {
  const canonicalRoot = input.canonicalRoot ?? await realpath(input.rootDir)
  const snapshots = await listRecoverable(input.storage, input.workspaceId)
  if (snapshots.length > 100) {
    throw new Error("workspace recovery exceeds the bounded transaction limit")
  }
  const rootIdentitySha256 = sha256(canonicalRoot)
  for (const snapshot of snapshots) {
    if (snapshot.transaction.rootIdentitySha256 !== rootIdentitySha256) {
      throw new Error(
        `workspace transaction belongs to another root: ${snapshot.transaction.id}`
      )
    }
    await recoverOne({ ...input, canonicalRoot, snapshot })
  }
}

async function listRecoverable(
  storage: WorkspaceStore,
  workspaceId: string
): Promise<WorkspaceChangeTransactionSnapshot[]> {
  const states = [
    "planning",
    "prepared",
    "committing",
    "recovery_required"
  ] as const
  const byId = new Map<string, WorkspaceChangeTransactionSnapshot>()
  for (const state of states) {
    for (const snapshot of await storage.listWorkspaceChangeTransactions({
      workspaceId,
      state,
      limit: 101
    })) {
      byId.set(snapshot.transaction.id, snapshot)
    }
  }
  return [...byId.values()].sort((left, right) =>
    left.transaction.createdAt - right.transaction.createdAt ||
    left.transaction.id.localeCompare(right.transaction.id)
  )
}

async function recoverOne(input: {
  readonly storage: WorkspaceStore
  readonly rootDir: string
  readonly serviceBin: string
  readonly leaseMs: number
  readonly canonicalRoot: string
  readonly snapshot: WorkspaceChangeTransactionSnapshot
}): Promise<void> {
  const transactionId = input.snapshot.transaction.id
  const attemptId = `wta_${randomUUID()}`
  const claimToken = randomBytes(32).toString("base64url")
  const claim = await input.storage.claimWorkspaceChangeTransactionRecovery({
    transactionId,
    attemptId,
    ownerId: "workspace-recovery",
    claimToken,
    leaseMs: input.leaseMs
  })
  if (claim.status === "already_terminal") return
  if (claim.status === "busy") return
  if (claim.status !== "claimed") {
    throw new Error(
      `workspace transaction recovery is ${claim.status}: ${transactionId}`
    )
  }
  const identity = { transactionId, attemptId, claimToken }
  const lease = new WorkspaceTransactionLease(input.storage, {
    ...identity,
    leaseMs: input.leaseMs
  })
  lease.start()
  let helper: Awaited<ReturnType<typeof spawnNativeWorkspaceTransaction>> | undefined
  try {
    if (claim.snapshot.files.length === 0) {
      await input.storage.finalizeWorkspaceChangeTransaction({
        ...identity,
        outcome: "rolled_back"
      })
      return
    }
    const files = transactionFilePlans(claim.snapshot.files)
    helper = await spawnNativeWorkspaceTransaction({
      rootDir: input.canonicalRoot,
      serviceBin: input.serviceBin,
      transactionId
    })
    const observations = await helper.inspect(files)
    const reconciliation = await input.storage.reconcileWorkspaceChangeTransactionFiles({
      ...identity,
      observations
    })
    switch (reconciliation.decision) {
      case "attention": {
        await helper.terminate()
        helper = undefined
        await input.storage.finalizeWorkspaceChangeTransaction({
          ...identity,
          outcome: "recovery_required",
          failure: {
            type: "workspace.transaction_external_change",
            message: "workspace content matches neither durable before nor after evidence"
          }
        })
        throw new WorkspaceTransactionRecoveryRequiredError(
          transactionId,
          new Error("workspace transaction requires manual recovery")
        )
      }
      case "rollback_noop": {
        await helper.cleanup(files)
        helper = undefined
        await input.storage.finalizeWorkspaceChangeTransaction({
          ...identity,
          outcome: "rolled_back"
        })
        return
      }
      case "finish_forward": {
        await helper.prepare(files)
        await helper.commit(
          files,
          files.map((file) => file.ordinal),
          async ({ ordinal }) => {
            await input.storage.recordWorkspaceChangeTransactionFileCommitted({
              ...identity,
              ordinal
            })
          }
        )
        break
      }
      case "finalize":
        break
    }
    lease.assertHealthy()
    const receipt = await rebuildTransactionReceipt({
      storage: input.storage,
      reader: new LocalWorkspaceReader(input.rootDir),
      snapshot: reconciliation.snapshot
    })
    await input.storage.finalizeWorkspaceChangeTransaction({
      ...identity,
      outcome: "applied",
      operationId: durableId("wop", transactionId),
      receipt
    })
    try {
      await cleanupCommittedArtifacts({
        canonicalRoot: input.canonicalRoot,
        serviceBin: input.serviceBin,
        transactionId,
        files,
        helper
      })
    } catch (error) {
      throw new WorkspaceTransactionCleanupRequiredError(transactionId, error)
    }
    helper = undefined
  } finally {
    if (helper !== undefined) await helper.terminate()
    await lease.stop()
  }
}
