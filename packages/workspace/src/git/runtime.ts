import type { ChangeSet, FileChange } from "../changesets/index.js"
import type { PrincipalId } from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import { diffNameStatus } from "./diff.js"
import { fileChangeForEntry } from "./file-change.js"
import { GitCommandClient } from "./git-client.js"
import { createChangeSetId } from "./ids.js"
import { requireBaseRevision, validateLease } from "./lease.js"
import { createProposalFromWorktree } from "./proposal.js"
import type {
  CreateChangeSetFromWorktreeRequest,
  CreateChangeSetFromWorktreeResult,
  WorkspaceGitRuntimeOptions
} from "./types.js"

export const WANEX_WORKSPACE_GIT = "wanex-workspace-git" as const

const DEFAULT_WORKSPACE_ID = "local"
const DEFAULT_PRINCIPAL_ID = "workspace-git"

export class WorkspaceGitRuntime {
  private readonly storage: WorkspaceStore
  private readonly git: GitCommandClient
  private readonly workspaceId: string
  private readonly principalId: PrincipalId

  constructor(options: WorkspaceGitRuntimeOptions) {
    this.storage = options.storage
    this.git = new GitCommandClient({
      repoDir: options.repoDir,
      ...(options.gitBin === undefined ? {} : { gitBin: options.gitBin }),
      ...(options.executionHost === undefined
        ? {}
        : { executionHost: options.executionHost })
    })
    this.workspaceId = options.workspaceId ?? DEFAULT_WORKSPACE_ID
    this.principalId = options.principalId ?? DEFAULT_PRINCIPAL_ID
  }

  async createChangeSetFromWorktree(
    request: CreateChangeSetFromWorktreeRequest
  ): Promise<CreateChangeSetFromWorktreeResult> {
    validateLease(request.lease)
    const workspaceId = request.workspaceId ?? request.lease.workspaceId ?? this.workspaceId
    const principalId = request.principalId ?? this.principalId
    const baseRevision = requireBaseRevision(request.lease)
    const diff = await diffNameStatus({
      git: this.git,
      lease: request.lease,
      baseRevision
    })
    const changes: FileChange[] = []

    for (const entry of diff) {
      changes.push(
        await fileChangeForEntry({
          git: this.git,
          lease: request.lease,
          baseRevision,
          entry
        })
      )
    }

    const changeSetInput: ChangeSet = {
      id: request.id ?? createChangeSetId(),
      ...(request.title === undefined ? {} : { title: request.title }),
      baseRevision,
      changes
    }
    const changeSet = await this.storage.putWorkspaceChangeSet({
      workspaceId,
      principalId,
      changeSet: changeSetInput
    })
    const proposal =
      request.createProposal === undefined || request.createProposal === false
        ? undefined
        : await createProposalFromWorktree({
            storage: this.storage,
            request,
            changeSet
          })
    return {
      changeSet,
      ...(proposal === undefined ? {} : { proposal }),
      diff
    }
  }
}
