import { createHash } from "node:crypto"

export interface CodingRepositoryIdentity {
  readonly repositoryId: string
  readonly workspaceId: string
  readonly directoryName: string
}

export function codingRepositoryIdentity(
  canonicalRoot: string,
  platform: NodeJS.Platform = process.platform
): CodingRepositoryIdentity {
  const normalized = normalizeIdentityPath(canonicalRoot, platform)
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 40)
  return {
    repositoryId: `repo_${digest}`,
    workspaceId: `workspace_${digest}`,
    directoryName: digest
  }
}

function normalizeIdentityPath(
  value: string,
  platform: NodeJS.Platform
): string {
  const normalized = value.replaceAll("\\", "/")
  return platform === "win32" ? normalized.toLowerCase() : normalized
}
