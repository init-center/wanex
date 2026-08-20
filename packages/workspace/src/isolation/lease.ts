import { randomUUID } from "node:crypto"
import type { WorkspaceIsolationLease } from "./types.js"

export function createLeaseId(): string {
  return `wlease_${randomUUID().replaceAll("-", "")}`
}

export function withOptionalLeaseFields(
  lease: Omit<
    WorkspaceIsolationLease,
    | "repositoryId"
    | "workspaceId"
    | "jobId"
    | "agentId"
    | "baseRevision"
    | "branchName"
  > &
    Partial<Pick<WorkspaceIsolationLease, "baseRevision" | "branchName">>,
  optional: Partial<
    Pick<
      WorkspaceIsolationLease,
      "repositoryId" | "workspaceId" | "jobId" | "agentId"
    >
  >
): WorkspaceIsolationLease {
  return {
    ...lease,
    ...(optional.repositoryId === undefined ? {} : { repositoryId: optional.repositoryId }),
    ...(optional.workspaceId === undefined
      ? {}
      : { workspaceId: optional.workspaceId }),
    ...(optional.jobId === undefined ? {} : { jobId: optional.jobId }),
    ...(optional.agentId === undefined ? {} : { agentId: optional.agentId })
  }
}

export function optionalLeaseFields(fields: {
  readonly repositoryId?: string | undefined
  readonly workspaceId?: string | undefined
  readonly jobId?: string | undefined
  readonly agentId?: string | undefined
}): Partial<
  Pick<
    WorkspaceIsolationLease,
    "repositoryId" | "workspaceId" | "jobId" | "agentId"
  >
> {
  return {
    ...(fields.repositoryId === undefined ? {} : { repositoryId: fields.repositoryId }),
    ...(fields.workspaceId === undefined
      ? {}
      : { workspaceId: fields.workspaceId }),
    ...(fields.jobId === undefined ? {} : { jobId: fields.jobId }),
    ...(fields.agentId === undefined ? {} : { agentId: fields.agentId })
  }
}
