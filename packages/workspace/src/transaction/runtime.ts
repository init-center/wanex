import { randomBytes, randomUUID } from "node:crypto"
import type { BorrowedExecutionScope } from "@wanex/runtime/execution"
import type {
  JsonValue,
  RuntimeAbortSignal,
  WorkspaceChangeOperationRecord,
  WorkspaceChangeTransactionFilePlan,
  WorkspaceChangeTransactionFinalization,
  WorkspaceChangeTransactionProposalBinding,
  WorkspaceChangeTransactionSourceKind
} from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import type { ChangeSetReceipt } from "../changesets/index.js"
import {
  cleanupCommittedArtifacts,
  cleanupTerminalArtifacts
} from "./artifacts.js"
import { durableId, sha256 } from "./common.js"
import {
  WorkspaceTransactionCleanupRequiredError,
  WorkspaceTransactionRecoveryRequiredError
} from "./errors.js"
import { WorkspaceTransactionLease } from "./lease.js"
import { spawnWorkspaceTransaction } from "./process-executor.js"
import { recoverPendingTransactions } from "./recovery.js"
import {
  finalizationResult,
  replayTerminalTransaction,
  transactionFiles
} from "./receipt.js"

export {
  WorkspaceTransactionCleanupRequiredError,
  WorkspaceTransactionRecoveryRequiredError
} from "./errors.js"

export const DEFAULT_WORKSPACE_TRANSACTION_LEASE_MS = 30_000

interface WorkspaceMutationIdentityBase {
  readonly sourceId: string
  readonly idempotencyKey: string
  readonly ownerId: string
}

export interface WorkspaceDirectMutationIdentity extends WorkspaceMutationIdentityBase {
  readonly sourceKind: Exclude<WorkspaceChangeTransactionSourceKind, "proposal">
}

export interface WorkspaceProposalMutationIdentity extends WorkspaceMutationIdentityBase {
  readonly sourceKind: "proposal"
  readonly proposal: WorkspaceChangeTransactionProposalBinding
}

export type WorkspaceMutationIdentity =
  | WorkspaceDirectMutationIdentity
  | WorkspaceProposalMutationIdentity

export interface ExecuteWorkspaceTransactionRequest {
  readonly workspaceId: string
  readonly changeSetId: string
  readonly operation: "apply" | "undo"
  readonly undoSourceOperationId?: string
  readonly mutation: WorkspaceMutationIdentity | WorkspaceProposalMutationIdentity
  readonly plan: () => Promise<ChangeSetReceipt>
  readonly signal?: RuntimeAbortSignal
}

export interface ExecuteWorkspaceTransactionResult {
  readonly operation: WorkspaceChangeOperationRecord
  readonly receipt: ChangeSetReceipt
  readonly finalization: WorkspaceChangeTransactionFinalization
}

export class WorkspaceChangeTransactionRuntime {
  private readonly storage: WorkspaceStore
  private readonly rootDir: string
  private readonly serviceBin: string
  private readonly executionScope: BorrowedExecutionScope
  private readonly leaseMs: number

  constructor(options: {
    readonly storage: WorkspaceStore
    readonly rootDir: string
    readonly serviceBin: string
    readonly executionScope: BorrowedExecutionScope
    readonly leaseMs?: number
  }) {
    this.storage = options.storage
    this.rootDir = options.rootDir
    this.serviceBin = options.serviceBin
    this.executionScope = options.executionScope
    this.leaseMs =
      options.leaseMs ?? DEFAULT_WORKSPACE_TRANSACTION_LEASE_MS
    if (
      !Number.isSafeInteger(this.leaseMs) ||
      this.leaseMs < 10 ||
      this.leaseMs > 300_000
    ) {
      throw new Error("workspace transaction leaseMs must be between 10 and 300000")
    }
  }

  async execute(
    request: ExecuteWorkspaceTransactionRequest
  ): Promise<ExecuteWorkspaceTransactionResult> {
    validateRequest(request)
    const canonicalRoot = await this.executionScope.fileSystem.canonicalize(this.rootDir)
    await this.recoverPending(request.workspaceId, canonicalRoot)
    const transactionId = durableId("wtx", request.mutation.idempotencyKey)
    const operationId = durableId("wop", transactionId)
    const attemptId = `wta_${randomUUID()}`
    const claimToken = randomBytes(32).toString("base64url")
    const claim = await this.storage.beginWorkspaceChangeTransaction({
      id: transactionId,
      workspaceId: request.workspaceId,
      changeSetId: request.changeSetId,
      operation: request.operation,
      ...(request.undoSourceOperationId === undefined
        ? {}
        : { undoSourceOperationId: request.undoSourceOperationId }),
      sourceKind: request.mutation.sourceKind,
      sourceId: request.mutation.sourceId,
      idempotencyKey: request.mutation.idempotencyKey,
      rootIdentitySha256: sha256(canonicalRoot),
      ...(request.mutation.sourceKind === "proposal"
        ? { proposal: request.mutation.proposal }
        : {}),
      attemptId,
      ownerId: request.mutation.ownerId,
      claimToken,
      leaseMs: this.leaseMs
    })
    if (claim.status === "already_terminal") {
      await cleanupTerminalArtifacts({
        canonicalRoot,
        serviceBin: this.serviceBin,
        executionScope: this.executionScope,
        transactionId,
        files: claim.snapshot.files
      })
      return await replayTerminalTransaction({
        storage: this.storage,
        changeSetId: request.changeSetId,
        snapshot: claim.snapshot,
        workspaceOperationId: claim.snapshot.transaction.workspaceOperationId
      })
    }
    if (claim.status !== "claimed") {
      throw new Error(
        `workspace transaction cannot execute: ${transactionId} (${claim.status})`
      )
    }

    const identity = { transactionId, attemptId, claimToken }
    const lease = new WorkspaceTransactionLease(this.storage, {
      ...identity,
      leaseMs: this.leaseMs
    })
    lease.start()
    let helper: Awaited<ReturnType<typeof spawnWorkspaceTransaction>> | undefined
    let files: readonly WorkspaceChangeTransactionFilePlan[] = []
    let commitStarted = false
    let terminalFinalization: WorkspaceChangeTransactionFinalization | undefined
    try {
      helper = await spawnWorkspaceTransaction({
        rootDir: canonicalRoot,
        serviceBin: this.serviceBin,
        transactionId,
        executionScope: this.executionScope
      })
      const receipt = await request.plan()
      if (receipt.changeSetId !== request.changeSetId) {
        throw new Error("workspace transaction plan belongs to another changeset")
      }
      if (receipt.status === "conflicted") {
        await helper.terminate()
        helper = undefined
        lease.assertHealthy()
        const finalization = await this.storage.finalizeWorkspaceChangeTransaction({
          ...identity,
          outcome: "conflicted",
          operationId,
          receipt
        })
        terminalFinalization = finalization
        return finalizationResult(finalization, receipt)
      }

      files = transactionFiles(receipt)
      if (files.length === 0) {
        await helper.terminate()
        helper = undefined
        lease.assertHealthy()
        const finalization = await this.storage.finalizeWorkspaceChangeTransaction({
          ...identity,
          outcome: "applied",
          operationId,
          receipt
        })
        terminalFinalization = finalization
        return finalizationResult(finalization, receipt)
      }

      await this.storage.recordWorkspaceChangeTransactionPlan({
        ...identity,
        files
      })
      await helper.prepare(files)
      await this.storage.markWorkspaceChangeTransactionPrepared(identity)
      if (request.signal?.aborted === true) {
        await helper.cleanup(files)
        helper = undefined
        await this.storage.finalizeWorkspaceChangeTransaction({
          ...identity,
          outcome: "rolled_back"
        })
        throw abortError()
      }

      await this.storage.beginWorkspaceChangeTransactionCommit(identity)
      commitStarted = true
      await helper.commit(
        files,
        files.map((file) => file.ordinal),
        async ({ ordinal }) => {
          await this.storage.recordWorkspaceChangeTransactionFileCommitted({
            ...identity,
            ordinal
          })
        }
      )
      lease.assertHealthy()
      const finalization = await this.storage.finalizeWorkspaceChangeTransaction({
        ...identity,
        outcome: "applied",
        operationId,
        receipt
      })
      terminalFinalization = finalization
      await cleanupCommittedArtifacts({
        canonicalRoot,
        serviceBin: this.serviceBin,
        executionScope: this.executionScope,
        transactionId,
        files,
        helper
      })
      helper = undefined
      return finalizationResult(finalization, receipt)
    } catch (error) {
      if (terminalFinalization !== undefined) {
        throw new WorkspaceTransactionCleanupRequiredError(transactionId, error)
      }
      let cleanupFailure: unknown
      if (helper !== undefined) {
        if (!commitStarted && files.length > 0) {
          try {
            await helper.cleanup(files)
          } catch (cleanupError) {
            cleanupFailure = cleanupError
            await helper.terminate()
          }
        } else {
          await helper.terminate()
        }
      }
      if (!commitStarted && cleanupFailure === undefined) {
        if (isAbortError(error)) throw error
        try {
          await this.storage.finalizeWorkspaceChangeTransaction({
            ...identity,
            outcome: "rolled_back"
          })
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "workspace transaction failed and rollback settlement also failed"
          )
        }
        throw error
      }
      let finalization: WorkspaceChangeTransactionFinalization | undefined
      const failure = cleanupFailure === undefined
        ? error
        : new AggregateError(
            [error, cleanupFailure],
            "workspace transaction failed and artifact cleanup also failed"
          )
      try {
        finalization = await this.storage.finalizeWorkspaceChangeTransaction({
          ...identity,
          outcome: "recovery_required",
          failure: normalizeFailure(failure)
        })
      } catch {}
      throw new WorkspaceTransactionRecoveryRequiredError(
        transactionId,
        failure,
        finalization
      )
    } finally {
      await lease.stop()
    }
  }

  async recoverPending(
    workspaceId: string,
    canonicalRoot?: string
  ): Promise<void> {
    await recoverPendingTransactions({
      storage: this.storage,
      rootDir: this.rootDir,
      serviceBin: this.serviceBin,
      executionScope: this.executionScope,
      leaseMs: this.leaseMs,
      workspaceId,
      ...(canonicalRoot === undefined ? {} : { canonicalRoot })
    })
  }
}

function validateRequest(request: ExecuteWorkspaceTransactionRequest): void {
  if (
    request.workspaceId.length === 0 ||
    request.changeSetId.length === 0 ||
    request.mutation.sourceId.length === 0 ||
    request.mutation.idempotencyKey.length === 0 ||
    request.mutation.ownerId.length === 0
  ) {
    throw new Error("workspace transaction identity must not be empty")
  }
  if ((request.operation === "undo") !== (request.undoSourceOperationId !== undefined)) {
    throw new Error("workspace undo transaction requires a source operation")
  }
}

function normalizeFailure(error: unknown): JsonValue {
  if (error instanceof Error) {
    return {
      type: "workspace.transaction_error",
      name: error.name,
      message: error.message
    }
  }
  return {
    type: "workspace.transaction_error",
    message: String(error)
  }
}

function abortError(): Error {
  const error = new Error("workspace transaction was aborted before commit")
  error.name = "AbortError"
  return error
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}
