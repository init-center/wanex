import type { WorkspaceIsolationLease } from "../isolation/index.js"

export function validateLease(lease: WorkspaceIsolationLease): void {
  if (lease.kind !== "git_worktree") {
    throw new Error(`workspace git runtime requires git_worktree lease: ${lease.kind}`)
  }
}

export function requireBaseRevision(lease: WorkspaceIsolationLease): string {
  if (lease.baseRevision === undefined || lease.baseRevision.length === 0) {
    throw new Error("workspace git runtime requires lease.baseRevision")
  }
  return lease.baseRevision
}
