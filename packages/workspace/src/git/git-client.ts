import {
  NodeExecutionHost,
  type ExecutionHost,
  type ExecutionResult
} from "@wanex/runtime/execution"
import { resolve } from "node:path"

const DEFAULT_GIT_TIMEOUT_MS = 30_000
const DEFAULT_GIT_OUTPUT_LIMIT_BYTES = 50 * 1024 * 1024
const DEFAULT_GIT_STDERR_LIMIT_BYTES = 64 * 1024

export class GitCommandClient {
  readonly repoDir: string

  private readonly gitBin: string
  private readonly executionHost: ExecutionHost
  private readonly timeoutMs: number
  private readonly outputLimitBytes: number

  constructor(options: {
    readonly repoDir: string
    readonly gitBin?: string
    readonly executionHost?: ExecutionHost
    readonly timeoutMs?: number
    readonly outputLimitBytes?: number
  }) {
    this.repoDir = resolve(options.repoDir)
    this.gitBin = options.gitBin ?? "git"
    this.executionHost = options.executionHost ?? new NodeExecutionHost()
    this.timeoutMs = options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS
    this.outputLimitBytes =
      options.outputLimitBytes ?? DEFAULT_GIT_OUTPUT_LIMIT_BYTES
  }

  async repo(args: readonly string[]): Promise<string> {
    return (await this.execute(this.repoDir, args)).stdout.text
  }

  async repoBuffer(args: readonly string[]): Promise<Buffer> {
    return Buffer.from((await this.execute(this.repoDir, args)).stdout.bytes)
  }

  async worktree(rootDir: string, args: readonly string[]): Promise<string> {
    return (await this.execute(resolve(rootDir), args)).stdout.text
  }

  private async execute(
    cwd: string,
    args: readonly string[]
  ): Promise<ExecutionResult> {
    const result = await this.executionHost.execute({
      program: this.gitBin,
      args: ["-C", cwd, ...args],
      cwd,
      timeoutMs: this.timeoutMs,
      output: {
        stdoutBytes: this.outputLimitBytes,
        stderrBytes: DEFAULT_GIT_STDERR_LIMIT_BYTES
      }
    })
    if (result.stdout.truncated) {
      throw new Error(
        `git stdout exceeded ${this.outputLimitBytes} bytes: ${commandLabel(this.gitBin, cwd, args)}`
      )
    }
    if (
      result.termination !== "exited" ||
      result.exitCode !== 0 ||
      result.cleanup === "failed"
    ) {
      throw new Error(gitFailure(result, this.gitBin, cwd, args))
    }
    return result
  }
}

function gitFailure(
  result: ExecutionResult,
  gitBin: string,
  cwd: string,
  args: readonly string[]
): string {
  const stderr = result.stderr.text.trim()
  const detail = stderr.length === 0 ? "" : `: ${stderr}`
  return `git command failed (${result.termination}, code ${String(result.exitCode)}): ${commandLabel(gitBin, cwd, args)}${detail}`
}

function commandLabel(
  gitBin: string,
  cwd: string,
  args: readonly string[]
): string {
  return `${gitBin} -C ${cwd} ${args.join(" ")}`
}
