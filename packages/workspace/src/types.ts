import type {
  ChangeSet,
  ChangeSetReceipt,
  Workspace
} from "./changesets/index.js"
import type {
  ListWorkspaceChangeSetsRequest,
  PrincipalId,
  WorkspaceChangeOperationRecord,
  WorkspaceChangeSetRecord
} from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"

export interface WorkspaceRuntimeOptions {
  readonly storage: WorkspaceStore
  readonly workspace?: Workspace
  readonly rootDir?: string
  readonly workspaceId?: string
  readonly principalId?: PrincipalId
  readonly mutationGate?: WorkspaceMutationGate
  readonly mutationGateTimeoutMs?: number
}

export interface ApplyWorkspaceChangeSetRequest {
  readonly changeSet: ChangeSet
  readonly workspaceId?: string
  readonly principalId?: PrincipalId
}

export interface ApplyWorkspaceChangeSetResult {
  readonly changeSet: WorkspaceChangeSetRecord
  readonly operation: WorkspaceChangeOperationRecord
  readonly receipt: ChangeSetReceipt
}

export interface UndoWorkspaceChangeSetRequest {
  readonly changeSetId: string
}

export interface UndoWorkspaceChangeSetResult {
  readonly changeSet: WorkspaceChangeSetRecord
  readonly operation: WorkspaceChangeOperationRecord
  readonly receipt: ChangeSetReceipt
}

export interface WorkspaceChangeSetHistory {
  readonly changeSet: WorkspaceChangeSetRecord
  readonly operations: readonly WorkspaceChangeOperationRecord[]
}

export interface WorkspaceMutationGate {
  runExclusive<T>(operation: () => Promise<T>): Promise<T>
}

export interface FileSystemWorkspaceMutationGateOptions {
  readonly rootDir: string
  readonly lockName?: string
  readonly timeoutMs?: number
  readonly retryDelayMs?: number
  readonly staleMs?: number
}

export interface WorkspaceLockMetadata {
  readonly ownerToken: string
  readonly createdAt: number
  readonly pid?: number
  readonly hostname?: string
  readonly lockName: string
}

export type ListWorkspaceRuntimeChangeSetsRequest = Omit<
  ListWorkspaceChangeSetsRequest,
  "workspaceId"
> & {
  readonly workspaceId?: string
}
