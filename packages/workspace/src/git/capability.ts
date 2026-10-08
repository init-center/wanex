import type {
  ExecutionFileSystem,
  ExecutionProcess
} from "@wanex/runtime/execution"
import { resolve } from "node:path"

export type WorkspaceGitCapabilityStatus =
  | "available"
  | "git_unavailable"
  | "root_unavailable"
  | "not_repository"
  | "root_not_repository_root"
  | "unsupported_repository"

export interface WorkspaceGitCapability {
  readonly status: WorkspaceGitCapabilityStatus
  readonly rootDir: string
  readonly gitBin: string
  readonly repositoryRoot?: string
  readonly reason?: string
}

export interface ProbeWorkspaceGitCapabilityOptions {
  readonly rootDir: string
  readonly fileSystem: ExecutionFileSystem
  readonly executionProcess: ExecutionProcess
  readonly gitBin?: string
  readonly timeoutMs?: number
}

export type WorkspaceExecutionStrategy = "direct" | "git_worktree"

export interface ResolveWorkspaceStrategyOptions {
  readonly requested?: WorkspaceExecutionStrategy
  readonly gitCapability?: WorkspaceGitCapability
}

export type WorkspaceStrategyResolution =
  | {
      readonly status: "accepted"
      readonly strategy: WorkspaceExecutionStrategy
    }
  | {
      readonly status: "rejected"
      readonly strategy: WorkspaceExecutionStrategy
      readonly code:
        | "git_capability_required"
        | "git_unavailable"
        | "root_unavailable"
        | "not_repository"
        | "root_not_repository_root"
        | "unsupported_repository"
      readonly reason: string
    }

const DEFAULT_TIMEOUT_MS = 5_000

/**
 * Probe only read-only Git metadata. This never initializes a repository,
 * creates a worktree, changes refs, or invokes an installer.
 */
export async function probeWorkspaceGitCapability(
  options: ProbeWorkspaceGitCapabilityOptions
): Promise<WorkspaceGitCapability> {
  const gitBin = options.gitBin ?? "git"
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let rootDir
  try {
    rootDir = await options.fileSystem.canonicalize(options.rootDir)
    if ((await options.fileSystem.metadata(rootDir))?.kind !== "directory") {
      throw new Error("not a directory")
    }
  } catch {
    return {
      rootDir: options.rootDir,
      gitBin,
      status: "root_unavailable",
      reason: "Workspace root could not be inspected"
    }
  }
  const base = { rootDir, gitBin }

  let version
  try {
    version = await options.executionProcess.execute({
      program: gitBin,
      args: ["--version"],
      cwd: rootDir,
      timeoutMs,
      output: { stdoutBytes: 4_096, stderrBytes: 4_096 }
    })
  } catch {
    return {
      ...base,
      status: "git_unavailable",
      reason: "Git executable could not be started"
    }
  }
  if (!successful(version)) {
    return {
      ...base,
      status: "git_unavailable",
      reason: "Git executable did not respond successfully"
    }
  }

  let repository
  try {
    repository = await options.executionProcess.execute({
      program: gitBin,
      args: [
        "-C",
        rootDir,
        "rev-parse",
        "--show-toplevel",
        "--is-inside-work-tree",
        "--is-bare-repository"
      ],
      cwd: rootDir,
      timeoutMs,
      output: { stdoutBytes: 8_192, stderrBytes: 8_192 }
    })
  } catch {
    return {
      ...base,
      status: "git_unavailable",
      reason: "Git repository probe could not be started"
    }
  }
  if (!successful(repository)) {
    return {
      ...base,
      status: "not_repository",
      reason: "Workspace root is not a Git worktree"
    }
  }

  const lines = repository.stdout.text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const reportedRoot = lines[0]
  const insideWorkTree = lines[1]
  const bareRepository = lines[2]
  if (
    reportedRoot === undefined ||
    insideWorkTree !== "true" ||
    bareRepository !== "false"
  ) {
    return {
      ...base,
      status: "unsupported_repository",
      reason: "Workspace root is not a non-bare Git worktree"
    }
  }
  if (resolve(reportedRoot) !== resolve(rootDir)) {
    return {
      ...base,
      status: "root_not_repository_root",
      reason: "Workspace root is inside a Git repository but is not its root"
    }
  }
  let repositoryRoot
  try {
    repositoryRoot = await options.fileSystem.canonicalize(reportedRoot)
  } catch {
    return {
      ...base,
      status: "unsupported_repository",
      reason: "Git repository root could not be resolved"
    }
  }
  if (repositoryRoot !== rootDir) {
    return {
      ...base,
      status: "root_not_repository_root",
      reason: "Workspace root is inside a Git repository but is not its root"
    }
  }
  return {
    ...base,
    status: "available",
    repositoryRoot
  }
}

export function resolveWorkspaceStrategy(
  options: ResolveWorkspaceStrategyOptions = {}
): WorkspaceStrategyResolution {
  const requested = options.requested ?? "direct"
  if (requested === "direct") {
    return { status: "accepted", strategy: "direct" }
  }
  const capability = options.gitCapability
  if (capability === undefined) {
    return {
      status: "rejected",
      strategy: "git_worktree",
      code: "git_capability_required",
      reason: "Git capability must be probed before requesting a worktree"
    }
  }
  if (capability.status !== "available") {
    return {
      status: "rejected",
      strategy: "git_worktree",
      code: capability.status,
      reason: capability.reason ?? "Git worktree strategy is unavailable"
    }
  }
  return { status: "accepted", strategy: "git_worktree" }
}

function successful(result: {
  readonly termination: string
  readonly exitCode: number | null
  readonly cleanup: string
}): boolean {
  return (
    result.termination === "exited" &&
    result.exitCode === 0 &&
    result.cleanup !== "failed"
  )
}
