import { lstat, readFile } from "node:fs/promises"
import type { FileChange } from "../changesets/index.js"
import type { WorkspaceIsolationLease } from "../isolation/index.js"
import type { GitCommandClient } from "./git-client.js"
import { resolveWorktreePath } from "./path.js"
import { projectionAttention, GitProjectionError } from "./projection.js"
import type { GitProjectionAttention } from "./projection.js"
import type { GitWorktreeDiffEntry } from "./types.js"

const MAX_PROJECTED_FILE_BYTES = 16 * 1024 * 1024
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true })

export async function fileChangeForEntry(input: {
  readonly git: GitCommandClient
  readonly lease: WorkspaceIsolationLease
  readonly baseRevision: string
  readonly entry: GitWorktreeDiffEntry
}): Promise<FileChange> {
  if (input.entry.status === "R" || input.entry.status === "C") {
    throw projectionAttention({
      code: input.entry.status === "R" ? "rename" : "copy",
      path: input.entry.path,
      ...(input.entry.previousPath === undefined
        ? {}
        : { previousPath: input.entry.previousPath }),
      status: input.entry.status
    })
  }

  const baseMode = await readBaseMode(input)
  const indexMode = await readIndexMode(input)
  if (baseMode === "120000" || indexMode === "120000") {
    throw projectionAttention({ code: "link_or_reparse", path: input.entry.path })
  }
  if (baseMode === "160000" || indexMode === "160000") {
    throw projectionAttention({ code: "gitlink", path: input.entry.path })
  }

  const fileType = await inspectWorktreeFile(input)
  if (fileType !== undefined) {
    throw projectionAttention(fileType)
  }
  if (await isModeOnlyChange(input)) {
    throw projectionAttention({ code: "mode_only", path: input.entry.path })
  }
  if (await isBinaryChange(input)) {
    throw projectionAttention({ code: "binary", path: input.entry.path })
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
    return { path: input.entry.path, kind: "delete", baseText }
  }

  return {
    path: input.entry.path,
    kind: "update",
    baseText,
    targetText: await readWorktreeText(input.lease.rootDir, input.entry.path)
  }
}

async function inspectWorktreeFile(input: {
  readonly lease: WorkspaceIsolationLease
  readonly entry: GitWorktreeDiffEntry
}): Promise<GitProjectionAttention | undefined> {
  if (input.entry.status === "D") {
    return undefined
  }
  try {
    const stats = await lstat(
      await resolveWorktreePath(input.lease.rootDir, input.entry.path)
    )
    if (stats.isSymbolicLink()) {
      return { code: "link_or_reparse", path: input.entry.path }
    }
    if (!stats.isFile()) {
      return {
        code: "read_failed",
        path: input.entry.path,
        detail: "projected path is not a regular file"
      }
    }
    if (stats.size > MAX_PROJECTED_FILE_BYTES) {
      return {
        code: "limit_exceeded",
        path: input.entry.path,
        detail: `file exceeds ${MAX_PROJECTED_FILE_BYTES} bytes`
      }
    }
  } catch (error) {
    if (error instanceof GitProjectionError) throw error
    return { code: "read_failed", path: input.entry.path }
  }
  return undefined
}

async function readBaseText(
  git: GitCommandClient,
  baseRevision: string,
  path: string
): Promise<string> {
  try {
    const bytes = await git.repoBuffer(["show", `${baseRevision}:${path}`])
    if (bytes.byteLength > MAX_PROJECTED_FILE_BYTES) {
      throw projectionAttention({ code: "limit_exceeded", path })
    }
    return decodeUtf8(bytes, path)
  } catch (error) {
    if (error instanceof GitProjectionError) throw error
    throw new Error(`failed to read base text for ${path}: ${errorMessage(error)}`)
  }
}

async function readWorktreeText(rootDir: string, path: string): Promise<string> {
  const bytes = await readFile(await resolveWorktreePath(rootDir, path))
  if (bytes.byteLength > MAX_PROJECTED_FILE_BYTES) {
    throw projectionAttention({ code: "limit_exceeded", path })
  }
  return decodeUtf8(bytes, path)
}

async function readBaseMode(input: {
  readonly git: GitCommandClient
  readonly baseRevision: string
  readonly entry: GitWorktreeDiffEntry
}): Promise<string | undefined> {
  if (input.entry.status === "A") {
    return undefined
  }
  const output = await input.git.repo([
    "ls-tree",
    "-z",
    input.baseRevision,
    "--",
    input.entry.path
  ])
  const token = output.split("\0")[0]
  return token?.split(/[ \t]/u)[0]
}

async function readIndexMode(input: {
  readonly git: GitCommandClient
  readonly lease: WorkspaceIsolationLease
  readonly entry: GitWorktreeDiffEntry
}): Promise<string | undefined> {
  if (input.entry.status === "D") {
    return undefined
  }
  const output = await input.git.worktree(input.lease.rootDir, [
    "ls-files",
    "--stage",
    "-z",
    "--",
    input.entry.path
  ])
  const token = output.split("\0")[0]
  return token?.split(/[ \t]/u)[0]
}

async function isModeOnlyChange(input: {
  readonly git: GitCommandClient
  readonly lease: WorkspaceIsolationLease
  readonly baseRevision: string
  readonly entry: GitWorktreeDiffEntry
}): Promise<boolean> {
  if (input.entry.status !== "M") {
    return false
  }
  const summary = await input.git.worktree(input.lease.rootDir, [
    "diff",
    "--summary",
    input.baseRevision,
    "--",
    input.entry.path
  ])
  if (!summary.includes("mode change")) {
    return false
  }
  const numstat = await input.git.worktree(input.lease.rootDir, [
    "diff",
    "--numstat",
    "-z",
    input.baseRevision,
    "--",
    input.entry.path
  ])
  const line = numstat.split("\0")[0]
  if (line === undefined || line.length === 0) {
    return true
  }
  const [added, deleted] = line.split("\t")
  return added === "0" && deleted === "0"
}

async function isBinaryChange(input: {
  readonly git: GitCommandClient
  readonly lease: WorkspaceIsolationLease
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
  return await isBinaryAtWorktree(input.git, input.lease.rootDir, input.entry.path)
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

function decodeUtf8(bytes: Uint8Array, path: string): string {
  try {
    return UTF8_DECODER.decode(bytes)
  } catch {
    throw projectionAttention({
      code: "binary",
      path,
      detail: "file is not valid UTF-8 text"
    })
  }
}
