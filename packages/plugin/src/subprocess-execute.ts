import { randomUUID } from "node:crypto"
import { type ExecutionResult } from "@wanex/runtime/execution"
import { compilePluginExecution } from "./execution-policy.js"
import { parsePluginHostResponseMessage } from "./subprocess-response.js"
import type {
  PluginHostExecuteMessage,
  PluginHostResponseMessage,
  SubprocessPluginActionDescriptor,
  SubprocessPluginActionHostOptions
} from "./types.js"

const DEFAULT_PLUGIN_SUBPROCESS_TIMEOUT_MS = 30_000
const DEFAULT_PLUGIN_SUBPROCESS_STDOUT_LIMIT_BYTES = 1024 * 1024
const DEFAULT_PLUGIN_SUBPROCESS_STDERR_LIMIT_BYTES = 8_192

export async function executeSubprocessPluginAction(
  options: SubprocessPluginActionHostOptions,
  descriptor: SubprocessPluginActionDescriptor,
  message: PluginHostExecuteMessage,
  signal: AbortSignal
): Promise<PluginHostResponseMessage> {
  const compiled = compilePluginExecution({
    descriptor,
    environment: options.executionEnvironment,
    cwd: options.cwd,
    scopeId: `plugin_${randomUUID().replaceAll("-", "")}`,
    timeoutMs: options.timeoutMs ?? DEFAULT_PLUGIN_SUBPROCESS_TIMEOUT_MS
  })
  const timeoutMs = compiled.timeoutMs
  const stdoutLimitBytes =
    options.stdoutLimitBytes ?? DEFAULT_PLUGIN_SUBPROCESS_STDOUT_LIMIT_BYTES
  const stderrLimitBytes =
    options.stderrLimitBytes ?? DEFAULT_PLUGIN_SUBPROCESS_STDERR_LIMIT_BYTES
  const executionScope = await options.executionEnvironment.bind(compiled.bind)
  let result: ExecutionResult
  try {
    result = await executionScope.process.execute({
      program: options.command,
      ...(options.args === undefined ? {} : { args: options.args }),
      cwd: options.cwd,
      stdin: `${JSON.stringify(message)}\n`,
      signal,
      timeoutMs,
      output: {
        stdoutBytes: stdoutLimitBytes,
        stderrBytes: stderrLimitBytes
      }
    })
  } finally {
    await executionScope.close()
  }

  assertPluginExecutionCompleted(result, timeoutMs)
  if (result.stdout.truncated) {
    throw new Error(
      `plugin subprocess stdout exceeded ${stdoutLimitBytes} bytes`
    )
  }
  try {
    return parsePluginHostResponseMessage(result.stdout.text)
  } catch (error) {
    throw normalizePluginHostError(error)
  }
}

function assertPluginExecutionCompleted(
  result: ExecutionResult,
  timeoutMs: number
): void {
  if (result.cleanup === "failed") {
    throw new Error(
      `plugin subprocess cleanup failed: ${result.cleanupError ?? "unknown cleanup failure"}`
    )
  }
  if (result.termination === "timed_out") {
    throw new Error(`plugin subprocess timed out after ${timeoutMs}ms`)
  }
  if (result.termination === "cancelled") {
    throw new Error("plugin subprocess aborted")
  }
  if (result.termination !== "exited" || result.exitCode !== 0) {
    throw new Error(
      `plugin subprocess exited with ${exitSummary(result)}${stderrSummary(result.stderr.text)}`
    )
  }
}

function exitSummary(result: ExecutionResult): string {
  if (result.exitCode !== null) {
    return `code ${result.exitCode}`
  }
  return `signal ${result.signal ?? "unknown"}`
}

function stderrSummary(stderr: string): string {
  const summary = stderr.trim().split(/\r?\n/u).at(-1)?.trim()
  return summary === undefined || summary.length === 0 ? "" : `: ${summary}`
}

function normalizePluginHostError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }
  return new Error(String(error))
}
