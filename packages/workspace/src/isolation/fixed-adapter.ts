import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { createLeaseId, optionalLeaseFields, withOptionalLeaseFields } from "./lease.js"
import type {
  FixedWorkspaceIsolationAdapterOptions,
  WorkspaceIsolationAdapter,
  WorkspaceIsolationLease,
  WorkspaceIsolationReleasePolicy,
  WorkspaceIsolationRequest
} from "./types.js"

export class FixedWorkspaceIsolationAdapter implements WorkspaceIsolationAdapter {
  private readonly rootDir: string
  private readonly workspaceId: string | undefined
  private readonly releasePolicy: WorkspaceIsolationReleasePolicy

  constructor(options: FixedWorkspaceIsolationAdapterOptions) {
    this.rootDir = resolve(options.rootDir)
    this.workspaceId = options.workspaceId
    this.releasePolicy = options.releasePolicy ?? "keep"
  }

  async prepare(
    request: WorkspaceIsolationRequest = {}
  ): Promise<WorkspaceIsolationLease> {
    const rootDir = resolve(request.rootDir ?? this.rootDir)
    await mkdir(rootDir, { recursive: true })
    const id = createLeaseId()
    const optional = optionalLeaseFields({
      workspaceId: request.workspaceId ?? this.workspaceId,
      jobId: request.jobId,
      agentId: request.agentId,
      metadata: request.metadata
    })
    return withOptionalLeaseFields(
      {
        id,
        kind: "fixed",
        rootDir,
        createdAt: Date.now(),
        releasePolicy: request.releasePolicy ?? this.releasePolicy
      },
      optional
    )
  }

  async release(_lease: WorkspaceIsolationLease): Promise<void> {
    // Fixed workspaces are owned by the caller. Releasing the lease is a no-op.
  }
}
