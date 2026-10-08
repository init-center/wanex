import {
  type ExecutionProcess,
  type ExecutionResult
} from "@wanex/runtime/execution"
import { resolve } from "node:path"

const DEFAULT_GIT_TIMEOUT_MS = 30_000
const DEFAULT_GIT_OUTPUT_LIMIT_BYTES = 50 * 1024 * 1024
const DEFAULT_GIT_STDERR_LIMIT_BYTES = 64 * 1024

export class GitCommandClient {
  readonly repoDir: string

  private readonly gitBin: string
  private readonly executionProcess: ExecutionProcess
  private readonly timeoutMs: number
  private readonly outputLimitBytes: number
  private readonly inspectedRoots = new Map<string, Promise<void>>()

  constructor(options: {
    readonly repoDir: string
    readonly gitBin?: string
    readonly executionProcess: ExecutionProcess
    readonly timeoutMs?: number
    readonly outputLimitBytes?: number
  }) {
    this.repoDir = resolve(options.repoDir)
    this.gitBin = options.gitBin ?? "git"
    this.executionProcess = options.executionProcess
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

  async worktreeBuffer(rootDir: string, args: readonly string[]): Promise<Buffer> {
    return Buffer.from((await this.execute(resolve(rootDir), args)).stdout.bytes)
  }

  private async execute(
    cwd: string,
    args: readonly string[]
  ): Promise<ExecutionResult> {
    let inspected = this.inspectedRoots.get(cwd)
    if (inspected === undefined) {
      inspected = this.inspectFilters(cwd)
      this.inspectedRoots.set(cwd, inspected)
    }
    await inspected
    const commandArgs = args[0] === "diff" ? ["diff", "--no-ext-diff", "--no-textconv", ...args.slice(1)] : args
    const result = await this.command(cwd, commandArgs)
    this.assertSuccess(result, args)
    return result
  }

  private async inspectFilters(cwd: string): Promise<void> {
    const configuration = await this.command(cwd, ["config", "--null", "--get-regexp", "^filter\\..*\\.(clean|smudge|process)$"])
    if (configuration.termination !== "exited" || configuration.cleanup === "failed" || configuration.stdout.truncated ||
        (configuration.exitCode !== 0 && configuration.exitCode !== 1)) {
      throw new Error("cannot inspect workspace Git filter configuration")
    }
    const drivers = new Set<string>()
    if (configuration.exitCode === 0) {
      for (const entry of configuration.stdout.text.split("\0").filter(Boolean)) {
        const separator = entry.indexOf("\n")
        if (separator < 0) throw new Error("invalid workspace Git filter configuration")
        if (entry.slice(separator + 1).trim() !== "") {
          const key = entry.slice(0, separator)
          drivers.add(key.slice("filter.".length, key.lastIndexOf(".")))
        }
      }
    }
    if (drivers.size === 0) return
    const paths = await this.command(cwd, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    this.assertSuccess(paths, ["ls-files"])
    const attributes = await this.command(cwd, ["check-attr", "-z", "--stdin", "filter"], paths.stdout.bytes)
    this.assertSuccess(attributes, ["check-attr"])
    if (attributes.stdout.text === "") return
    const fields = attributes.stdout.text.split("\0")
    if (fields.pop() !== "" || fields.length % 3 !== 0) throw new Error("invalid workspace Git attributes")
    for (let index = 0; index < fields.length; index += 3) {
      if (fields[index + 1] !== "filter") throw new Error("invalid workspace Git attribute name")
      if (drivers.has(fields[index + 2]!)) throw new Error("executable Git filters are not supported by controlled workspace collection")
    }
  }

  private assertSuccess(result: ExecutionResult, args: readonly string[]): void {
    if (result.stdout.truncated) {
      throw new Error(
        `git stdout exceeded ${this.outputLimitBytes} bytes: ${commandLabel(this.gitBin, args)}`
      )
    }
    if (
      result.termination !== "exited" ||
      result.exitCode !== 0 ||
      result.cleanup === "failed"
    ) {
      throw new Error(gitFailure(result, this.gitBin, args))
    }
  }

  private async command(cwd: string, args: readonly string[], stdin?: Uint8Array): Promise<ExecutionResult> {
    const result = await this.executionProcess.execute({
      program: this.gitBin,
      args: [
        "-c", `core.hooksPath=${process.platform === "win32" ? "NUL" : "/dev/null"}`,
        "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false",
        "-c", "gc.auto=0", "-c", "maintenance.auto=false", "-c", "protocol.allow=never",
        "-C", cwd, ...args
      ],
      cwd,
      ...(stdin === undefined ? {} : { stdin }),
      timeoutMs: this.timeoutMs,
      output: {
        stdoutBytes: this.outputLimitBytes,
        stderrBytes: DEFAULT_GIT_STDERR_LIMIT_BYTES
      }
    })
    return result
  }
}

function gitFailure(
  result: ExecutionResult,
  gitBin: string,
  args: readonly string[]
): string {
  return `git command failed (${result.termination}, code ${String(result.exitCode)}): ${commandLabel(gitBin, args)}`
}

function commandLabel(
  gitBin: string,
  args: readonly string[]
): string {
  return `${gitBin} ${args.join(" ")}`
}
