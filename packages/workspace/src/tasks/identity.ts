import { createHash } from "node:crypto"
import type {
  WorkspaceTaskAccess,
  WorkspaceTaskIsolationIdentity,
  WorkspaceTaskRootIdentity,
  WorkspaceTaskRunRecord,
  WorkspaceTaskStrategy
} from "@wanex/protocol"
import type { WorkspaceTaskRuntimeOptions } from "./types.js"

export function freezeTaskRootIdentity(root: WorkspaceTaskRootIdentity): WorkspaceTaskRootIdentity {
  for (const key of ["hostId", "generationKey", "rootId"] as const) {
    if (!/^[A-Za-z0-9_.:-]{1,256}$/u.test(root[key])) {
      throw new Error(`workspace task root ${key} must be an opaque identifier`)
    }
  }
  for (const key of ["device", "inode"] as const) {
    if (!/^[0-9]{1,128}$/u.test(root[key])) throw new Error(`workspace task root ${key} must be a decimal identity`)
  }
  return Object.freeze({ ...root })
}

export function sameTaskRoot(left: WorkspaceTaskRootIdentity, right: WorkspaceTaskRootIdentity): boolean {
  return left.hostId === right.hostId && left.generationKey === right.generationKey &&
    left.rootId === right.rootId && left.device === right.device && left.inode === right.inode
}

export function taskIsolationIdentity(
  root: WorkspaceTaskRootIdentity,
  taskId: string,
  strategy: WorkspaceTaskStrategy,
  access: WorkspaceTaskAccess,
  git: WorkspaceTaskRuntimeOptions["gitWorktree"]
): WorkspaceTaskIsolationIdentity {
  if (strategy === "direct" && access !== "read_only") {
    throw new Error("direct writable tasks must use Workspace ChangeSet transactions")
  }
  if (strategy === "git_worktree" && (access !== "writable" || git === undefined)) {
    throw new Error("git_worktree tasks require writable access and a configured Git capability")
  }
  if (strategy !== "direct" && strategy !== "git_worktree") throw new Error("workspace task strategy is invalid")
  if (strategy === "git_worktree" && !/^[A-Za-z0-9_.:-]{1,256}$/u.test(git!.repositoryId)) {
    throw new Error("workspace task repositoryId must be an opaque identifier")
  }
  const digest = createHash("sha256").update(JSON.stringify([
    root.hostId, root.generationKey, root.rootId, root.device, root.inode, taskId, strategy
  ])).digest("hex").slice(0, 32)
  return {
    id: `wiso_${digest}`,
    kind: strategy === "direct" ? "fixed" : "git_worktree",
    ...(strategy === "git_worktree" ? { repositoryId: git!.repositoryId } : {})
  }
}

export function assertTaskRuntimeIdentity(
  run: WorkspaceTaskRunRecord,
  root: WorkspaceTaskRootIdentity,
  git: WorkspaceTaskRuntimeOptions["gitWorktree"]
): void {
  if (!sameTaskRoot(run.rootIdentity, root)) throw new Error("workspace task belongs to a different root identity")
  const expected = taskIsolationIdentity(root, run.id, run.strategy, run.access, git)
  if (run.isolationIdentity.kind !== expected.kind ||
      run.isolationIdentity.repositoryId !== expected.repositoryId) {
    throw new Error("workspace task belongs to a different isolation capability")
  }
}
