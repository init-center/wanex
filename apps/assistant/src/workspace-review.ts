import type { WorkspaceChangeOperationRecord } from "@wanex/protocol"

/**
 * Trusted Host port for file changes the assistant made in a conversation.
 * A change is either a direct edit (the default, already on disk) or an
 * isolated proposal that the user reviews before it is applied. Paths and
 * internal identities never cross this boundary; `changeRef` is an opaque
 * Host reference that the Host re-verifies on every use.
 */
export interface WorkspaceReviewPort {
  /** Summaries for Tool calls in one transcript page, keyed by the caller's reference. */
  listChanges(request: WorkspaceChangeListRequest): Promise<readonly WorkspaceChangeListEntry[]>
  readChange(request: WorkspaceChangeReference): Promise<WorkspaceChangeReadModel>
  decideChange(request: WorkspaceChangeDecisionRequest): Promise<WorkspaceChangeSummary>
  applyChange(request: WorkspaceChangeMutationRequest): Promise<WorkspaceChangeMutationResult>
  undoChange(request: WorkspaceChangeMutationRequest): Promise<WorkspaceChangeMutationResult>
  reapplyChange(request: WorkspaceChangeMutationRequest): Promise<WorkspaceChangeMutationResult>
}

/**
 * A Tool call observed in the transcript, identified by its durable call
 * coordinates. The Host decides which Tools produce changes.
 */
export interface WorkspaceChangeToolCall {
  readonly key: string
  readonly turnId: string
  readonly sourceMessageId: string
  readonly toolCallId: string
  readonly toolName: string
}

export interface WorkspaceChangeListRequest {
  readonly sessionId: string
  readonly toolCalls: readonly WorkspaceChangeToolCall[]
}

export interface WorkspaceChangeListEntry {
  readonly key: string
  readonly changes: readonly WorkspaceChangeSummary[]
}

export interface WorkspaceChangeReference {
  readonly sessionId: string
  readonly changeRef: string
}

export interface WorkspaceChangeDecisionRequest extends WorkspaceChangeReference {
  readonly decision: "approve" | "reject"
  readonly idempotencyKey: string
}

export interface WorkspaceChangeMutationRequest extends WorkspaceChangeReference {
  readonly idempotencyKey: string
}

export type WorkspaceChangeKind = "direct" | "proposal"

export type WorkspaceChangeStatus =
  | "applied"
  | "undone"
  | "conflicted"
  | "proposed"
  | "approved"
  | "rejected"
  | "failed"
  | "needs_attention"

export type WorkspaceChangeAction = "approve" | "reject" | "apply" | "undo" | "reapply"

export interface WorkspaceChangeFileSummary {
  readonly path: string
  readonly kind: "create" | "update" | "delete"
}

export interface WorkspaceChangeSummary {
  readonly kind: "assistant.workspace-change"
  readonly changeRef: string
  readonly changeKind: WorkspaceChangeKind
  /** Display name of the folder the change belongs to; never a path. */
  readonly folder: string
  readonly title?: string
  readonly status: WorkspaceChangeStatus
  /** False when the folder was removed or its authority is no longer valid. */
  readonly available: boolean
  readonly actions: readonly WorkspaceChangeAction[]
  readonly totalFileCount: number
  readonly files: readonly WorkspaceChangeFileSummary[]
}

export interface WorkspaceChangeTextPreview {
  readonly text?: string
  readonly truncated: boolean
}

export interface WorkspaceChangeFileDetail extends WorkspaceChangeFileSummary {
  readonly before?: WorkspaceChangeTextPreview
  readonly after?: WorkspaceChangeTextPreview
}

export interface WorkspaceChangeReadModel extends Omit<WorkspaceChangeSummary, "files"> {
  readonly files: readonly WorkspaceChangeFileDetail[]
}

export interface WorkspaceChangeConflict {
  readonly path: string
  readonly reason: string
}

export interface WorkspaceChangeMutationResult {
  readonly kind: "assistant.workspace-change-mutation"
  readonly outcome: "applied" | "already_applied" | "conflicted" | "busy" | "failed"
  readonly change: WorkspaceChangeSummary
  readonly conflicts: readonly WorkspaceChangeConflict[]
  readonly totalConflictCount: number
}

export const WORKSPACE_CHANGE_LIMITS = Object.freeze({
  summaryFiles: 16,
  changesPerCall: 8,
  toolCallsPerPage: 64,
  conflicts: 32
})

export function projectWorkspaceChangeConflicts(
  operation: WorkspaceChangeOperationRecord | undefined
): Pick<WorkspaceChangeMutationResult, "conflicts" | "totalConflictCount"> {
  const conflicts = operation?.receipt.conflicts ?? []
  return {
    conflicts: conflicts.slice(0, WORKSPACE_CHANGE_LIMITS.conflicts).map((conflict) => ({ path: conflict.path, reason: conflict.reason })),
    totalConflictCount: conflicts.length
  }
}
