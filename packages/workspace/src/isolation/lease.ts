import { randomUUID } from "node:crypto"
import type { WorkspaceIsolationLease } from "./types.js"

export function createLeaseId(): string {
  return `wlease_${randomUUID().replaceAll("-", "")}`
}

export function withOptionalLeaseFields(
  lease: Omit<
    WorkspaceIsolationLease,
    | "workspaceId"
    | "jobId"
    | "agentId"
    | "baseRef"
    | "baseRevision"
    | "branchName"
    | "metadata"
  > &
    Partial<Pick<WorkspaceIsolationLease, "baseRevision" | "branchName">>,
  optional: Partial<
    Pick<
      WorkspaceIsolationLease,
      "workspaceId" | "jobId" | "agentId" | "baseRef" | "metadata"
    >
  >
): WorkspaceIsolationLease {
  return {
    ...lease,
    ...(optional.workspaceId === undefined
      ? {}
      : { workspaceId: optional.workspaceId }),
    ...(optional.jobId === undefined ? {} : { jobId: optional.jobId }),
    ...(optional.agentId === undefined ? {} : { agentId: optional.agentId }),
    ...(optional.baseRef === undefined ? {} : { baseRef: optional.baseRef }),
    ...(optional.metadata === undefined ? {} : { metadata: optional.metadata })
  }
}

export function optionalLeaseFields(fields: {
  readonly workspaceId?: string | undefined
  readonly jobId?: string | undefined
  readonly agentId?: string | undefined
  readonly baseRef?: string | undefined
  readonly metadata?: Record<string, unknown> | undefined
}): Partial<
  Pick<
    WorkspaceIsolationLease,
    "workspaceId" | "jobId" | "agentId" | "baseRef" | "metadata"
  >
> {
  return {
    ...(fields.workspaceId === undefined
      ? {}
      : { workspaceId: fields.workspaceId }),
    ...(fields.jobId === undefined ? {} : { jobId: fields.jobId }),
    ...(fields.agentId === undefined ? {} : { agentId: fields.agentId }),
    ...(fields.baseRef === undefined ? {} : { baseRef: fields.baseRef }),
    ...(fields.metadata === undefined ? {} : { metadata: fields.metadata })
  }
}
