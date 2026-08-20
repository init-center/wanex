import {
  deterministicGitWorktreeIdentity,
  type WorkspaceIsolationLease
} from "../isolation/index.js"
import { isAbsolute, relative, resolve, sep } from "node:path"
import type { GitProjectionAttention } from "./projection.js"

export function validateLease(
  lease: WorkspaceIsolationLease,
  repositoryId: string,
  worktreeParent: string
): GitProjectionAttention | undefined {
  if (lease.kind !== "git_worktree") {
    return { code: "identity_drift", detail: `unexpected isolation kind: ${lease.kind}` }
  }
  if (
    lease.repositoryId !== repositoryId ||
    lease.baseRevision === undefined ||
    lease.branchName === undefined
  ) {
    return { code: "identity_drift", detail: "incomplete worktree identity" }
  }
  const root = relative(resolve(worktreeParent), resolve(lease.rootDir))
  if (
    root.length === 0 ||
    root === ".." ||
    root.startsWith(`..${sep}`) ||
    isAbsolute(root)
  ) {
    return { code: "identity_drift" }
  }
  const expected = deterministicGitWorktreeIdentity(worktreeParent, lease.id)
  if (
    resolve(lease.rootDir) !== expected.rootDir ||
    lease.branchName !== expected.runtimeRef
  ) {
    return { code: "identity_drift", detail: "worktree identity does not match isolation id" }
  }
}

export function requireBaseRevision(lease: WorkspaceIsolationLease): string {
  if (lease.baseRevision === undefined || lease.baseRevision.length === 0) {
    throw new Error("workspace git runtime requires lease.baseRevision")
  }
  return lease.baseRevision
}
