import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { createLeaseId, optionalLeaseFields, withOptionalLeaseFields } from "./lease.js"
import type {
  FixedWorkspaceIsolationAdapterOptions,
  WorkspaceIsolationAdapter,
  WorkspaceIsolationDurableIdentity,
  WorkspaceIsolationLease,
  WorkspaceIsolationRequest
} from "./types.js"

export class FixedWorkspaceIsolationAdapter implements WorkspaceIsolationAdapter {
  private readonly rootDir: string
  private readonly workspaceId: string | undefined

  constructor(options: FixedWorkspaceIsolationAdapterOptions) {
    this.rootDir = resolve(options.rootDir)
    this.workspaceId = options.workspaceId
  }

  async prepare(
    request: WorkspaceIsolationRequest = {}
  ): Promise<WorkspaceIsolationLease> {
    await mkdir(this.rootDir, { recursive: true })
    const id = request.isolationId ?? createLeaseId()
    const optional = optionalLeaseFields({
      workspaceId: request.workspaceId ?? this.workspaceId,
      jobId: request.jobId,
      agentId: request.agentId
    })
    return withOptionalLeaseFields(
      {
        id,
        kind: "fixed",
        rootDir: this.rootDir,
        createdAt: Date.now()
      },
      optional
    )
  }

  async release(_lease: WorkspaceIsolationLease): Promise<void> {
    // Fixed workspaces are owned by the caller. Releasing the lease is a no-op.
  }

  async releaseDurable(identity: WorkspaceIsolationDurableIdentity): Promise<void> {
    if (identity.kind !== "fixed") {
      throw new Error("fixed workspace isolation cannot release a different kind")
    }
  }
}
