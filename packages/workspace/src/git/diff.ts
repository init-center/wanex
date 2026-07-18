import type { WorkspaceIsolationLease } from "../isolation/index.js"
import type { GitCommandClient } from "./git-client.js"
import { validateRelativePath } from "./path.js"
import type { GitWorktreeDiffEntry } from "./types.js"

export async function diffNameStatus(input: {
  readonly git: GitCommandClient
  readonly lease: WorkspaceIsolationLease
  readonly baseRevision: string
}): Promise<GitWorktreeDiffEntry[]> {
  const raw = await input.git.worktree(input.lease.rootDir, [
    "diff",
    "--name-status",
    "-z",
    "--diff-filter=ACDMRTUXB",
    input.baseRevision,
    "--"
  ])
  const entries = parseDiffNameStatus(raw)
  const trackedPaths = new Set(entries.map((entry) => entry.path))
  for (const path of await untrackedFiles(input.git, input.lease.rootDir)) {
    if (!trackedPaths.has(path)) {
      entries.push({ status: "A", path })
    }
  }
  return entries
}

export function parseDiffNameStatus(raw: string): GitWorktreeDiffEntry[] {
  if (raw.length === 0) {
    return []
  }
  const tokens = raw.split("\0").filter((token) => token.length > 0)
  const entries: GitWorktreeDiffEntry[] = []
  for (let index = 0; index < tokens.length;) {
    const statusToken = tokens[index]
    if (statusToken === undefined) {
      throw new Error("git diff name-status output was incomplete")
    }
    const status = statusToken[0]
    if (status === "R" || status === "C") {
      const oldPath = tokens[index + 1]
      const newPath = tokens[index + 2]
      if (oldPath === undefined || newPath === undefined) {
        throw new Error("git diff rename/copy output was incomplete")
      }
      throw new Error(`unsupported git diff status: ${status}`)
    }
    const path = tokens[index + 1]
    if (path === undefined) {
      throw new Error("git diff name-status output was incomplete")
    }
    if (status !== "A" && status !== "M" && status !== "D") {
      throw new Error(`unsupported git diff status: ${statusToken}`)
    }
    validateRelativePath(path)
    entries.push({ status, path })
    index += 2
  }
  return entries
}

async function untrackedFiles(
  git: GitCommandClient,
  rootDir: string
): Promise<string[]> {
  const raw = await git.worktree(rootDir, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z"
  ])
  return raw
    .split("\0")
    .filter((path) => path.length > 0)
    .map((path) => {
      validateRelativePath(path)
      return path
    })
}
