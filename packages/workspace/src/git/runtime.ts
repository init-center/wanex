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
  private readonly locator: WorkspaceGitRuntimeOptions["locator"]

  constructor(options: WorkspaceGitRuntimeOptions) {
    this.repositoryId = options.repositoryId
    this.locator = options.locator
  }

  async collectWorktree(
    request: CollectWorktreeRequest
  ): Promise<WorktreeCollection> {
    const repository = await this.locator.locate(this.repositoryId)
    const leaseAttention = validateLease(
      request.lease,
      this.repositoryId,
      repository.worktreeParent
    )
    if (leaseAttention !== undefined) {
      return { status: "attention", diff: [], attention: [leaseAttention] }
    }
    const baseRevision = requireBaseRevision(request.lease)
    const git = new GitCommandClient({
      repoDir: repository.repositoryRoot,
      ...(repository.gitBin === undefined ? {} : { gitBin: repository.gitBin }),
      ...(repository.executionHost === undefined
        ? {}
        : { executionHost: repository.executionHost }),
      timeoutMs: repository.gitTimeoutMs
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
