import type { ChangeSet, FileChange } from "../changesets/index.js"
import { diffNameStatus } from "./diff.js"
import { fileChangeForEntry } from "./file-change.js"
import { GitCommandClient } from "./git-client.js"
import { requireBaseRevision, validateLease } from "./lease.js"
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
    validateLease(request.lease)
    const baseRevision = requireBaseRevision(request.lease)
    const repository = await this.locator.locate(this.repositoryId)
    const git = new GitCommandClient({
      repoDir: repository.repositoryRoot,
      ...(repository.gitBin === undefined ? {} : { gitBin: repository.gitBin }),
      ...(repository.executionHost === undefined
        ? {}
        : { executionHost: repository.executionHost }),
      timeoutMs: repository.gitTimeoutMs
    })
    const diff = await diffNameStatus({
      git,
      lease: request.lease,
      baseRevision
    })
    if (diff.length === 0) {
      return { status: "no_changes", diff: [] }
    }
    const changes: FileChange[] = []

    for (const entry of diff) {
      changes.push(
        await fileChangeForEntry({
          git,
          lease: request.lease,
          baseRevision,
          entry
        })
      )
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
