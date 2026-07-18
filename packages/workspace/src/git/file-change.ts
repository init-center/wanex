import { readFile } from "node:fs/promises"
import type { FileChange } from "../changesets/index.js"
import type { WorkspaceIsolationLease } from "../isolation/index.js"
import type { GitCommandClient } from "./git-client.js"
import { resolveWorktreePath } from "./path.js"
import type { GitWorktreeDiffEntry } from "./types.js"

export async function fileChangeForEntry(input: {
  readonly git: GitCommandClient
  readonly lease: WorkspaceIsolationLease
  readonly baseRevision: string
  readonly entry: GitWorktreeDiffEntry
}): Promise<FileChange> {
  if (
    await isBinaryChange({
      git: input.git,
      rootDir: input.lease.rootDir,
      baseRevision: input.baseRevision,
      entry: input.entry
    })
  ) {
    throw new Error(
      `binary git worktree change is not supported: ${input.entry.path}`
    )
  }

  if (input.entry.status === "A") {
    return {
      path: input.entry.path,
      kind: "create",
      targetText: await readWorktreeText(input.lease.rootDir, input.entry.path)
    }
  }

  const baseText = await readBaseText(input.git, input.baseRevision, input.entry.path)
  if (input.entry.status === "D") {
    return {
      path: input.entry.path,
      kind: "delete",
      baseText
    }
  }

  return {
    path: input.entry.path,
    kind: "update",
    baseText,
    targetText: await readWorktreeText(input.lease.rootDir, input.entry.path)
  }
}

async function readBaseText(
  git: GitCommandClient,
  baseRevision: string,
  path: string
): Promise<string> {
  try {
    return await git.repo(["show", `${baseRevision}:${path}`])
  } catch (error) {
    throw new Error(`failed to read base text for ${path}: ${errorMessage(error)}`)
  }
}

async function readWorktreeText(rootDir: string, path: string): Promise<string> {
  return await readFile(await resolveWorktreePath(rootDir, path), "utf8")
}

async function isBinaryChange(input: {
  readonly git: GitCommandClient
  readonly rootDir: string
  readonly baseRevision: string
  readonly entry: GitWorktreeDiffEntry
}): Promise<boolean> {
  if (input.entry.status === "D") {
    const bytes = await input.git.repoBuffer([
      "show",
      `${input.baseRevision}:${input.entry.path}`
    ])
    return bytes.includes(0)
  }
  return await isBinaryAtWorktree(input.git, input.rootDir, input.entry.path)
}

async function isBinaryAtWorktree(
  git: GitCommandClient,
  rootDir: string,
  path: string
): Promise<boolean> {
  const bytes = await readFile(await resolveWorktreePath(rootDir, path))
  if (bytes.includes(0)) {
    return true
  }
  const output = await git.worktree(rootDir, [
    "diff",
    "--numstat",
    "-z",
    "--",
    path
  ])
  const tokens = output.split("\0").filter((token) => token.length > 0)
  const line = tokens[0]
  if (line === undefined) {
    return false
  }
  const [added, deleted] = line.split("\t")
  return added === "-" || deleted === "-"
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
