import { ChangeSetApplier, LocalWorkspace } from "./changesets/index.js"
import type { PrincipalId, WorkspaceChangeSetRecord } from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import { latestApplicableApplyOperation } from "./history.js"
import {
  FileSystemWorkspaceMutationGate,
  NoopWorkspaceMutationGate
} from "./mutation-gate.js"
import type {
  ApplyWorkspaceChangeSetRequest,
  ApplyWorkspaceChangeSetResult,
  ListWorkspaceRuntimeChangeSetsRequest,
  UndoWorkspaceChangeSetRequest,
  UndoWorkspaceChangeSetResult,
  WorkspaceRuntimeOptions,
  WorkspaceChangeSetHistory,
  WorkspaceMutationGate
} from "./types.js"

export const WANEX_WORKSPACE = "wanex-workspace" as const

const DEFAULT_WORKSPACE_ID = "local"
const DEFAULT_PRINCIPAL_ID = "workspace"

export class WorkspaceRuntime {
  readonly workspaceId: string

  private readonly storage: WorkspaceStore
  private readonly applier: ChangeSetApplier
  private readonly principalId: PrincipalId
  private readonly mutationGate: WorkspaceMutationGate

  constructor(options: WorkspaceRuntimeOptions) {
    this.storage = options.storage
    this.workspaceId = options.workspaceId ?? DEFAULT_WORKSPACE_ID
    this.principalId = options.principalId ?? DEFAULT_PRINCIPAL_ID
    const workspace =
      options.workspace ??
      (options.rootDir === undefined
        ? undefined
        : new LocalWorkspace(options.rootDir))
    if (workspace === undefined) {
      throw new Error("workspace requires workspace or rootDir")
    }
    this.applier = new ChangeSetApplier(workspace)
    this.mutationGate =
      options.mutationGate ??
      (options.rootDir === undefined
        ? new NoopWorkspaceMutationGate()
        : new FileSystemWorkspaceMutationGate({
            rootDir: options.rootDir,
            ...(options.mutationGateTimeoutMs === undefined
              ? {}
              : { timeoutMs: options.mutationGateTimeoutMs })
          }))
  }

  async applyChangeSet(
    request: ApplyWorkspaceChangeSetRequest
  ): Promise<ApplyWorkspaceChangeSetResult> {
    return await this.mutationGate.runExclusive(async () => {
      const changeSet = await this.storage.putWorkspaceChangeSet({
        workspaceId: request.workspaceId ?? this.workspaceId,
        principalId: request.principalId ?? this.principalId,
        changeSet: request.changeSet
      })
      const receipt = await this.applier.apply(changeSet.changeSet)
      const operation = await this.storage.recordWorkspaceChangeOperation({
        changeSetId: changeSet.id,
        operation: "apply",
        receipt
      })
      const latest =
        (await this.storage.getWorkspaceChangeSet({
          changeSetId: changeSet.id
        })) ?? changeSet
      return { changeSet: latest, operation, receipt }
    })
  }

  async undoChangeSet(
    request: UndoWorkspaceChangeSetRequest
  ): Promise<UndoWorkspaceChangeSetResult> {
    return await this.mutationGate.runExclusive(async () => {
      const changeSet = await this.storage.getWorkspaceChangeSet({
        changeSetId: request.changeSetId
      })
      if (changeSet === null) {
        throw new Error(
          `workspace changeset does not exist: ${request.changeSetId}`
        )
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
      const receipt = await this.applier.undo(applyOperation.receipt)
      const operation = await this.storage.recordWorkspaceChangeOperation({
        changeSetId: request.changeSetId,
        operation: "undo",
        receipt
      })
      const latest =
        (await this.storage.getWorkspaceChangeSet({
          changeSetId: request.changeSetId
        })) ?? changeSet
      return { changeSet: latest, operation, receipt }
    })
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
