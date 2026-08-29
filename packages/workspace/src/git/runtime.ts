import type { ChangeSet, FileChange } from "../changesets/index.js"
import { diffNameStatus } from "./diff.js"
import { fileChangeForEntry } from "./file-change.js"
import { GitCommandClient } from "./git-client.js"
import { requireBaseRevision, validateLease } from "./lease.js"
import { GitProjectionError } from "./projection.js"
import type {
  CollectWorktreeRequest,
  WorktreeCollection,
  WorkspaceGitRuntimeOptions
} from "./types.js"

export const WANEX_WORKSPACE_GIT = "wanex-workspace-git" as const

export class WorkspaceGitRuntime {
  private readonly repositoryId: string
  private readonly worktreeParent: string

  constructor(options: WorkspaceGitRuntimeOptions) {
    this.repositoryId = options.repositoryId
    this.worktreeParent = options.worktreeParent
  }

  async collectWorktree(
    request: CollectWorktreeRequest
  ): Promise<WorktreeCollection> {
    const leaseAttention = validateLease(
      request.lease,
      this.repositoryId,
      this.worktreeParent
    )
    if (leaseAttention !== undefined) {
      return { status: "attention", diff: [], attention: [leaseAttention] }
    }
    const baseRevision = requireBaseRevision(request.lease)
    const git = new GitCommandClient({
      repoDir: request.lease.rootDir,
      executionProcess: request.executionScope.process
    })
    let diff
    try {
      diff = await diffNameStatus({
        git,
        lease: request.lease,
        baseRevision
      })
    } catch (error) {
      if (error instanceof GitProjectionError) {
        return { status: "attention", diff: [], attention: [error.attention] }
      }
      throw error
    }
    if (diff.length === 0) {
      return { status: "no_changes", diff: [] }
    }
    const changes: FileChange[] = []
    const attention = []

    for (const entry of diff) {
      try {
        changes.push(
          await fileChangeForEntry({
            git,
            fileSystem: request.executionScope.fileSystem,
            lease: request.lease,
            baseRevision,
            entry
          })
        )
      } catch (error) {
        if (error instanceof GitProjectionError) {
          attention.push(error.attention)
          continue
        }
        attention.push({
          code: "read_failed" as const,
          path: entry.path,
          status: entry.status
        })
      }
    }
    if (attention.length > 0) {
      return { status: "attention", diff, attention }
    }

    const changeSetInput: ChangeSet = {
      id: request.changeSetId,
      ...(request.title === undefined ? {} : { title: request.title }),
      baseRevision,
      changes
    }
    return {
      status: "changes",
      changeSet: changeSetInput,
      diff
    }
  }
}
