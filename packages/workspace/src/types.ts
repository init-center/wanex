import type {
  ChangeSet,
  ChangeSetReceipt
} from "./changesets/index.js"
import type {
  ListWorkspaceChangeSetsRequest,
  PrincipalId,
  RuntimeAbortSignal,
  WorkspaceChangeOperationRecord,
  WorkspaceChangeSetRecord,
  WorkspaceChangeTransactionFinalization
} from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import type { BorrowedExecutionScope } from "@wanex/runtime/execution"
import type {
  WorkspaceMutationIdentity,
  WorkspaceProposalMutationIdentity
} from "./transaction/runtime.js"

interface WorkspaceRuntimeCommonOptions {
  readonly storage: WorkspaceStore
  readonly workspaceId?: string
  readonly principalId?: PrincipalId
}

export interface WorkspaceRuntimeOptions extends WorkspaceRuntimeCommonOptions {
  readonly rootDir: string
  readonly serviceBin: string
  readonly executionScope: BorrowedExecutionScope
  readonly transactionLeaseMs?: number
}

export interface ApplyWorkspaceChangeSetRequest {
  readonly changeSet: ChangeSet
  readonly workspaceId?: string
  readonly principalId?: PrincipalId
  readonly mutation: WorkspaceMutationIdentity | WorkspaceProposalMutationIdentity
  readonly signal?: RuntimeAbortSignal
}

export interface ApplyWorkspaceChangeSetResult {
  readonly changeSet: WorkspaceChangeSetRecord
  readonly operation: WorkspaceChangeOperationRecord
  readonly receipt: ChangeSetReceipt
  readonly transaction: WorkspaceChangeTransactionFinalization
}

export interface UndoWorkspaceChangeSetRequest {
  readonly changeSetId: string
  readonly mutation: WorkspaceMutationIdentity
  readonly signal?: RuntimeAbortSignal
}

export interface UndoWorkspaceChangeSetResult {
  readonly changeSet: WorkspaceChangeSetRecord
  readonly operation: WorkspaceChangeOperationRecord
  readonly receipt: ChangeSetReceipt
  readonly transaction: WorkspaceChangeTransactionFinalization
}

export interface WorkspaceChangeSetHistory {
  readonly changeSet: WorkspaceChangeSetRecord
  readonly operations: readonly WorkspaceChangeOperationRecord[]
}

export type ListWorkspaceRuntimeChangeSetsRequest = Omit<
  ListWorkspaceChangeSetsRequest,
  "workspaceId"
> & {
  readonly workspaceId?: string
}
