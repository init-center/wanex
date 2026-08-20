import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { NativeWorkspaceSnapshotClient } from "../snapshot/index.js"
import type { RepositoryLocator } from "../locator/index.js"
import { optionalLeaseFields, withOptionalLeaseFields } from "./lease.js"
import type {
  GitWorktreeIsolationAdapterOptions,
  WorkspaceIsolationAdapter,
  WorkspaceIsolationDurableIdentity,
  WorkspaceIsolationLease,
  WorkspaceIsolationRequest
} from "./types.js"

export class GitWorktreeIsolationAdapter implements WorkspaceIsolationAdapter {
  private readonly repositoryId: string
  private readonly locator: RepositoryLocator
  private readonly snapshot: NonNullable<GitWorktreeIsolationAdapterOptions["snapshot"]>

  constructor(options: GitWorktreeIsolationAdapterOptions) {
    this.repositoryId = requireRepositoryId(options.repositoryId)
    this.locator = options.locator
    this.snapshot = options.snapshot ?? new NativeWorkspaceSnapshotClient()
  }

  async prepare(
    request: WorkspaceIsolationRequest = {}
  ): Promise<WorkspaceIsolationLease> {
    const isolationId = request.isolationId
    if (isolationId === undefined || isolationId.length === 0) {
      throw new Error("git worktree isolation requires a durable isolation id")
    }
    const repository = await this.locator.locate(this.repositoryId)
    const snapshot = await this.snapshot.create({
      repositoryRoot: repository.repositoryRoot,
      worktreeParent: repository.worktreeParent,
      isolationId,
      serviceBin: repository.serviceBin,
      ...(repository.gitBin === undefined ? {} : { gitBin: repository.gitBin }),
      timeoutMs: repository.gitTimeoutMs
    })
    if (snapshot.isolationId !== isolationId) {
      throw new Error("workspace snapshot helper changed the durable isolation identity")
    }
    return withOptionalLeaseFields(
      {
        id: isolationId,
        kind: "git_worktree",
        rootDir: snapshot.rootDir,
        baseRevision: snapshot.baseRevision,
        branchName: snapshot.runtimeRef,
        createdAt: Date.now()
      },
      optionalLeaseFields({
        repositoryId: this.repositoryId,
        workspaceId: request.workspaceId,
        jobId: request.jobId,
        agentId: request.agentId
      })
    )
  }

  async release(lease: WorkspaceIsolationLease): Promise<void> {
    if (lease.kind !== "git_worktree") {
      return
    }
    if (lease.repositoryId !== this.repositoryId) {
      throw new Error("git worktree lease belongs to a different repository")
    }
    if (lease.baseRevision === undefined || lease.branchName === undefined) {
      throw new Error("git worktree lease is missing its durable runtime identity")
    }
    const repository = await this.locator.locate(this.repositoryId)
    const expected = deterministicIdentity(repository.worktreeParent, lease.id)
    if (
      resolve(lease.rootDir) !== expected.rootDir ||
      lease.branchName !== expected.runtimeRef
    ) {
      throw new Error("git worktree lease is not owned by this runtime")
    }
    await this.snapshot.release(
      {
        isolationId: lease.id,
        baseRevision: lease.baseRevision
      },
      {
        repositoryRoot: repository.repositoryRoot,
        worktreeParent: repository.worktreeParent,
        isolationId: lease.id,
        serviceBin: repository.serviceBin,
        ...(repository.gitBin === undefined ? {} : { gitBin: repository.gitBin }),
        timeoutMs: repository.gitTimeoutMs
      }
    )
  }

  async releaseDurable(
    identity: WorkspaceIsolationDurableIdentity
  ): Promise<void> {
    if (identity.kind !== "git_worktree") {
      throw new Error("git worktree isolation cannot release a different kind")
    }
    if (identity.repositoryId !== this.repositoryId) {
      throw new Error("git worktree durable identity belongs to a different repository")
    }
    if (identity.baseRevision === undefined || identity.branchName === undefined) {
      throw new Error("git worktree durable identity is incomplete")
    }
    const repository = await this.locator.locate(this.repositoryId)
    const expected = deterministicIdentity(repository.worktreeParent, identity.id)
    if (identity.branchName !== expected.runtimeRef) {
      throw new Error("git worktree durable identity is not owned by this runtime")
    }
    await this.snapshot.release(
      {
        isolationId: identity.id,
        baseRevision: identity.baseRevision
      },
      {
        repositoryRoot: repository.repositoryRoot,
        worktreeParent: repository.worktreeParent,
        isolationId: identity.id,
        serviceBin: repository.serviceBin,
        ...(repository.gitBin === undefined ? {} : { gitBin: repository.gitBin }),
        timeoutMs: repository.gitTimeoutMs
      }
    )
  }
}

function deterministicIdentity(
  worktreeParent: string,
  isolationId: string
): { readonly rootDir: string; readonly runtimeRef: string } {
  const hash = createHash("sha256").update(isolationId).digest("hex").slice(0, 32)
  return {
    rootDir: resolve(worktreeParent, `wanex-${hash}`),
    runtimeRef: `wanex/runtime/${hash}`
  }
}

function requireRepositoryId(repositoryId: string): string {
  if (!/^[A-Za-z0-9_.:-]{1,256}$/.test(repositoryId)) {
    throw new Error("repositoryId must be an opaque identifier")
  }
  return repositoryId
}
