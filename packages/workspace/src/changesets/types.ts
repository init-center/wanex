export type FileChangeKind = "create" | "update" | "delete"
export type ChangeApplyStatus = "applied" | "already_applied" | "conflicted"

export interface FileChange {
  readonly path: string
  readonly kind: FileChangeKind
  readonly baseText?: string
  readonly baseSha256?: string
  readonly targetText?: string
}

export interface ChangeSet {
  readonly id: string
  readonly title?: string
  readonly baseRevision?: string
  readonly changes: readonly FileChange[]
}

export interface FileConflict {
  readonly path: string
  readonly reason:
    | "missing_base"
    | "base_hash_mismatch"
    | "already_exists"
    | "missing_file"
    | "merge_conflict"
    | "undo_target_changed"
  readonly currentSha256?: string
  readonly expectedSha256?: string
}

export interface AppliedFileChange {
  readonly path: string
  readonly kind: FileChangeKind
  readonly beforeText?: string
  readonly afterText?: string
  readonly beforeSha256?: string
  readonly afterSha256?: string
  readonly merged: boolean
}

export interface ChangeSetReceipt {
  readonly changeSetId: string
  readonly status: ChangeApplyStatus
  readonly files: readonly AppliedFileChange[]
  readonly conflicts: readonly FileConflict[]
}

export interface WorkspaceReader {
  readText(path: string): Promise<string | null>
}

export type PlannedFileChange =
  | { readonly file: AppliedFileChange }
  | { readonly conflict: FileConflict }
