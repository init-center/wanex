import { lstat, realpath } from "node:fs/promises"
import { isAbsolute, relative } from "node:path"
import type { ExecutionProcess } from "@wanex/runtime/execution"
import { CodingHostError } from "../errors.js"

const MAX_GIT_ROOT_BYTES = 16 * 1024
const DEFAULT_GIT_TIMEOUT_MS = 10_000

export async function resolveTrustedRepositoryRoot(options: {
  readonly repositoryPath: string
  readonly gitBin?: string
  readonly gitTimeoutMs?: number
  readonly executionProcess: ExecutionProcess
}): Promise<string> {
  assertAbsoluteRepositoryPath(options.repositoryPath)

  let selectedRoot: string
  try {
    selectedRoot = await realpath(options.repositoryPath)
    const selectedStat = await lstat(selectedRoot)
    if (!selectedStat.isDirectory()) throw new Error("not a directory")
  } catch (error) {
    throw new CodingHostError(
      "repository_unavailable",
      "repository is unavailable",
      error
    )
  }

  const execution = await options.executionProcess.execute({
    program: options.gitBin ?? "git",
    args: ["-C", selectedRoot, "rev-parse", "--show-toplevel"],
    cwd: selectedRoot,
    timeoutMs: options.gitTimeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
    output: {
      stdoutBytes: MAX_GIT_ROOT_BYTES,
      stderrBytes: MAX_GIT_ROOT_BYTES
    }
  }).catch((error: unknown) => {
    throw new CodingHostError(
      "repository_invalid",
      "selected directory is not a supported Git repository",
      error
    )
  })

  if (
    execution.termination !== "exited" ||
    execution.exitCode !== 0 ||
    execution.cleanup === "failed" ||
    execution.stdout.truncated
  ) {
    throw new CodingHostError(
      "repository_invalid",
      "selected directory is not a supported Git repository"
    )
  }

  const lines = execution.stdout.text.trim().split(/\r?\n/)
  if (lines.length !== 1 || lines[0] === undefined || lines[0].length === 0) {
    throw new CodingHostError(
      "repository_invalid",
      "Git repository root could not be resolved"
    )
  }

  try {
    const canonicalRoot = await realpath(lines[0])
    const rootStat = await lstat(canonicalRoot)
    if (!rootStat.isDirectory() || !isContainedPath(canonicalRoot, selectedRoot)) {
      throw new Error("invalid repository root")
    }
    return canonicalRoot
  } catch (error) {
    throw new CodingHostError(
      "repository_invalid",
      "Git repository root could not be verified",
      error
    )
  }
}

export function assertAbsoluteRepositoryPath(repositoryPath: string): void {
  if (!isAbsolute(repositoryPath) || repositoryPath.includes("\0")) {
    throw new CodingHostError(
      "repository_unavailable",
      "repository path must be absolute"
    )
  }
}

export function isContainedPath(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === "" || (!path.startsWith("..") && !isAbsolute(path))
}

export function areOverlappingPaths(first: string, second: string): boolean {
  return isContainedPath(first, second) || isContainedPath(second, first)
}
