import {
  LocalWorkspaceReader,
  planChangeSetApply,
  planChangeSetUndo
} from "./changesets/index.js"
import type { PrincipalId, WorkspaceChangeSetRecord } from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import { latestApplicableApplyOperation } from "./history.js"
import {
  DEFAULT_WORKSPACE_TRANSACTION_LEASE_MS,
  WorkspaceChangeTransactionRuntime
} from "./transaction/runtime.js"
import type {
  ApplyWorkspaceChangeSetRequest,
  ApplyWorkspaceChangeSetResult,
  ListWorkspaceRuntimeChangeSetsRequest,
  UndoWorkspaceChangeSetRequest,
  UndoWorkspaceChangeSetResult,
  WorkspaceRuntimeOptions,
  WorkspaceChangeSetHistory
} from "./types.js"

export const WANEX_WORKSPACE = "wanex-workspace" as const

const DEFAULT_WORKSPACE_ID = "local"
const DEFAULT_PRINCIPAL_ID = "workspace"

export class WorkspaceRuntime {
  readonly workspaceId: string
  readonly transactionLeaseMs: number

  private readonly storage: WorkspaceStore
  private readonly reader: LocalWorkspaceReader
  private readonly principalId: PrincipalId
  private readonly transactions: WorkspaceChangeTransactionRuntime

  constructor(options: WorkspaceRuntimeOptions) {
    this.storage = options.storage
    this.workspaceId = options.workspaceId ?? DEFAULT_WORKSPACE_ID
    this.transactionLeaseMs =
      options.transactionLeaseMs ?? DEFAULT_WORKSPACE_TRANSACTION_LEASE_MS
    this.principalId = options.principalId ?? DEFAULT_PRINCIPAL_ID
    this.reader = new LocalWorkspaceReader(options.rootDir)
    this.transactions = new WorkspaceChangeTransactionRuntime({
      storage: options.storage,
      rootDir: options.rootDir,
      serviceBin: options.serviceBin,
      leaseMs: this.transactionLeaseMs
    })
  }

  async recoverPendingTransactions(
    workspaceId: string = this.workspaceId
  ): Promise<void> {
    await this.transactions.recoverPending(workspaceId)
  }

  async applyChangeSet(
    request: ApplyWorkspaceChangeSetRequest
  ): Promise<ApplyWorkspaceChangeSetResult> {
    const changeSet = await this.storage.putWorkspaceChangeSet({
      workspaceId: request.workspaceId ?? this.workspaceId,
      principalId: request.principalId ?? this.principalId,
      changeSet: request.changeSet
    })
    const executed = await this.transactions.execute({
      workspaceId: changeSet.workspaceId,
      changeSetId: changeSet.id,
      operation: "apply",
      mutation: request.mutation,
      plan: async () => await planChangeSetApply(this.reader, changeSet.changeSet),
      ...(request.signal === undefined ? {} : { signal: request.signal })
    })
    const latest =
      (await this.storage.getWorkspaceChangeSet({ changeSetId: changeSet.id })) ??
      changeSet
    return {
      changeSet: latest,
      operation: executed.operation,
      receipt: executed.receipt,
      transaction: executed.finalization
    }
  }

  async undoChangeSet(
    request: UndoWorkspaceChangeSetRequest
  ): Promise<UndoWorkspaceChangeSetResult> {
    const changeSet = await this.storage.getWorkspaceChangeSet({
      changeSetId: request.changeSetId
    })
    if (changeSet === null) {
      throw new Error(`workspace changeset does not exist: ${request.changeSetId}`)
    }
    const operations = await this.storage.listWorkspaceChangeOperations({
      changeSetId: request.changeSetId
    })
    const applyOperation = latestApplicableApplyOperation(operations)
    if (applyOperation === undefined) {
      throw new Error(
        `workspace changeset has no applied receipt to undo: ${request.changeSetId}`
      )
    }
    const executed = await this.transactions.execute({
      workspaceId: changeSet.workspaceId,
      changeSetId: request.changeSetId,
      operation: "undo",
      undoSourceOperationId: applyOperation.id,
      mutation: request.mutation,
      plan: async () => await planChangeSetUndo(this.reader, applyOperation.receipt),
      ...(request.signal === undefined ? {} : { signal: request.signal })
    })
    const latest =
      (await this.storage.getWorkspaceChangeSet({
        changeSetId: request.changeSetId
      })) ?? changeSet
    return {
      changeSet: latest,
      operation: executed.operation,
      receipt: executed.receipt,
      transaction: executed.finalization
    }
  }

  async getHistory(changeSetId: string): Promise<WorkspaceChangeSetHistory | null> {
    const changeSet = await this.storage.getWorkspaceChangeSet({ changeSetId })
    if (changeSet === null) {
      return null
    }
    const operations = await this.storage.listWorkspaceChangeOperations({
      changeSetId
    })
    return { changeSet, operations }
  }

  async listChangeSets(
    request: ListWorkspaceRuntimeChangeSetsRequest = {}
  ): Promise<WorkspaceChangeSetRecord[]> {
    return await this.storage.listWorkspaceChangeSets({
      workspaceId: request.workspaceId ?? this.workspaceId,
      ...(request.state === undefined ? {} : { state: request.state }),
      ...(request.limit === undefined ? {} : { limit: request.limit })
    })
  }
}
