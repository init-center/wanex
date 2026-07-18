import { mkdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import { GitCommandClient } from "../git/git-client.js"
import { pathExists } from "./fs.js"
import { createLeaseId, optionalLeaseFields, withOptionalLeaseFields } from "./lease.js"
import { branchNameParts, generatedBranchName, safePathSegment } from "./naming.js"
import type {
  GitWorktreeIsolationAdapterOptions,
  WorkspaceIsolationAdapter,
  WorkspaceIsolationLease,
  WorkspaceIsolationReleasePolicy,
  WorkspaceIsolationRequest
} from "./types.js"

const DEFAULT_GIT_TIMEOUT_MS = 10_000

export class GitWorktreeIsolationAdapter implements WorkspaceIsolationAdapter {
  private readonly repoDir: string
  private readonly worktreeParentDir: string
  private readonly gitClient: GitCommandClient
  private readonly branchPrefix: string
  private readonly releasePolicy: WorkspaceIsolationReleasePolicy

  constructor(options: GitWorktreeIsolationAdapterOptions) {
    this.repoDir = resolve(options.repoDir)
    this.worktreeParentDir = resolve(options.worktreeParentDir)
    this.gitClient = new GitCommandClient({
      repoDir: this.repoDir,
      ...(options.gitBin === undefined ? {} : { gitBin: options.gitBin }),
      ...(options.executionHost === undefined
        ? {}
        : { executionHost: options.executionHost }),
      timeoutMs: options.gitTimeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
      outputLimitBytes: 10 * 1024 * 1024
    })
    this.branchPrefix = options.branchPrefix ?? "wanex"
    this.releasePolicy = options.releasePolicy ?? "remove"
  }

  async prepare(
    request: WorkspaceIsolationRequest = {}
  ): Promise<WorkspaceIsolationLease> {
    const repoRoot = await this.git(["rev-parse", "--show-toplevel"])
    const baseRef = request.baseRef ?? "HEAD"
    const baseRevision = await this.git(["rev-parse", baseRef])
    const id = createLeaseId()
    const branchName =
      request.branchName ??
      generatedBranchName(
        this.branchPrefix,
        branchNameParts({
          workspaceId: request.workspaceId,
          jobId: request.jobId,
          agentId: request.agentId,
          leaseId: id
        })
      )
    await this.git(["check-ref-format", "--branch", branchName])
    await mkdir(this.worktreeParentDir, { recursive: true })
    const rootDir = resolve(
      request.rootDir ??
        join(
          this.worktreeParentDir,
          safePathSegment(
            [request.workspaceId, request.jobId, request.agentId, id]
              .filter((part) => part !== undefined && part.length > 0)
              .join("-")
          )
        )
    )
    if (await pathExists(rootDir)) {
      throw new Error(`workspace isolation root already exists: ${rootDir}`)
    }

    await this.git(["worktree", "add", "-b", branchName, rootDir, baseRevision])

    const optional = optionalLeaseFields({
      workspaceId: request.workspaceId,
      jobId: request.jobId,
      agentId: request.agentId,
      baseRef,
      metadata: {
        repoRoot,
        ...(request.metadata ?? {})
      }
    })
    return withOptionalLeaseFields(
      {
        id,
        kind: "git_worktree",
        rootDir,
        baseRevision,
        branchName,
        createdAt: Date.now(),
        releasePolicy: request.releasePolicy ?? this.releasePolicy
      },
      optional
    )
  }

  async release(lease: WorkspaceIsolationLease): Promise<void> {
    if (lease.kind !== "git_worktree") {
      return
    }
    if (lease.releasePolicy === "keep") {
      return
    }
    if (!(await pathExists(lease.rootDir))) {
      return
    }
    await this.git(["worktree", "remove", "--force", lease.rootDir])
    await this.git(["worktree", "prune"])
  }

  private async git(args: readonly string[]): Promise<string> {
    try {
      return (await this.gitClient.repo(args)).trim()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(
        `git command failed in workspace isolation: ${args.join(" ")}: ${message}`
      )
    }
  }
}
