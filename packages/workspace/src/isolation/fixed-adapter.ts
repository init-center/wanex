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
  private readonly fileSystem: FixedWorkspaceIsolationAdapterOptions["fileSystem"]

  constructor(options: FixedWorkspaceIsolationAdapterOptions) {
    this.rootDir = resolve(options.rootDir)
    this.workspaceId = options.workspaceId
    this.fileSystem = options.fileSystem
  }

  async prepare(
    request: WorkspaceIsolationRequest = {}
  ): Promise<WorkspaceIsolationLease> {
    const metadata = await this.fileSystem.metadata(this.rootDir)
    if (metadata?.kind !== "directory") {
      throw new Error("fixed workspace root is unavailable")
    }
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
