import { randomUUID } from "node:crypto"

export function generatedBranchName(
  prefix: string,
  parts: {
    readonly workspaceId?: string
    readonly jobId?: string
    readonly agentId?: string
    readonly leaseId: string
  }
): string {
  const readableTask = parts.jobId ?? parts.agentId ?? "task"
  const shortLeaseId = parts.leaseId.replace(/^wlease_/, "").slice(0, 8)
  return [
    safeBranchSegment(prefix),
    safeBranchSegment(parts.workspaceId ?? "workspace"),
    safeBranchSegment(`${readableTask}-${shortLeaseId}`)
  ].join("/")
}

export function safePathSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized.length === 0 ? `workspace-${randomUUID()}` : normalized
}

export function branchNameParts(parts: {
  readonly workspaceId?: string | undefined
  readonly jobId?: string | undefined
  readonly agentId?: string | undefined
  readonly leaseId: string
}): Parameters<typeof generatedBranchName>[1] {
  return {
    leaseId: parts.leaseId,
    ...(parts.workspaceId === undefined
      ? {}
      : { workspaceId: parts.workspaceId }),
    ...(parts.jobId === undefined ? {} : { jobId: parts.jobId }),
    ...(parts.agentId === undefined ? {} : { agentId: parts.agentId })
  }
}

function safeBranchSegment(value: string): string {
  const segment = safePathSegment(value)
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "")
  return segment.length === 0 ? `branch-${randomUUID()}` : segment
}
