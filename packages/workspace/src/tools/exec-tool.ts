import type { JsonValue } from "@wanex/protocol"
import type {
  ExecutionFileSystem,
  ExecutionProcess,
  ExecutionOutput
} from "@wanex/runtime/execution"
import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolInvocation
} from "@wanex/runtime/tools"
import { createToolRuntimeBinding, jsonToolResultContent } from "@wanex/runtime/tools"
import { WorkspacePathResolver } from "../path-policy.js"
import {
  inputRecord,
  optionalPositiveInteger,
  optionalString,
  requiredString,
  stringArray
} from "./input.js"
import type { WorkspaceProgramPolicy } from "./program-policy.js"
import { requireWorkspaceToolScopeId } from "./scope.js"

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_TIMEOUT_MS = 5 * 60_000
const DEFAULT_OUTPUT_BYTES = 64 * 1024
const DEFAULT_MAX_ARGS = 256
const DEFAULT_MAX_ARG_BYTES = 64 * 1024

export class WorkspaceExecTool implements ToolDefinition {
  readonly name = "workspace_exec"
  readonly description =
    "Run one approved executable with structured arguments inside the active workspace."
  readonly inputSchema = {
    type: "object",
    properties: {
      program: { type: "string", minLength: 1, maxLength: 64 },
      args: {
        type: "array",
        items: { type: "string", maxLength: 16_384 },
        maxItems: DEFAULT_MAX_ARGS
      },
      cwd: { type: "string", minLength: 1, maxLength: 4_096 },
      timeoutMs: { type: "integer", minimum: 1, maximum: DEFAULT_MAX_TIMEOUT_MS }
    },
    required: ["program", "args"],
    additionalProperties: false
  } as const
  readonly risk = "external" as const
  readonly idempotent = false
  readonly concurrency = "exclusive" as const
  readonly resultMode = "immediate" as const
  readonly annotations = {
    destructiveHint: true,
    openWorldHint: true
  } as const
  readonly runtimeBinding

  private readonly paths: WorkspacePathResolver
  private readonly executionProcess: ExecutionProcess
  private readonly programPolicy: WorkspaceProgramPolicy
  private readonly defaultTimeoutMs: number
  private readonly maxTimeoutMs: number
  private readonly outputBytes: number
  private readonly maxArgs: number
  private readonly maxArgBytes: number

  constructor(options: {
    readonly scopeId: string
    readonly rootDir: string
    readonly fileSystem: ExecutionFileSystem
    readonly executionProcess: ExecutionProcess
    readonly programPolicy: WorkspaceProgramPolicy
    readonly defaultTimeoutMs?: number
    readonly maxTimeoutMs?: number
    readonly outputBytes?: number
    readonly maxArgs?: number
    readonly maxArgBytes?: number
  }) {
    this.paths = new WorkspacePathResolver(options.rootDir, options.fileSystem)
    this.executionProcess = options.executionProcess
    this.programPolicy = options.programPolicy
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxTimeoutMs = options.maxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS
    this.outputBytes = options.outputBytes ?? DEFAULT_OUTPUT_BYTES
    this.maxArgs = options.maxArgs ?? DEFAULT_MAX_ARGS
    this.maxArgBytes = options.maxArgBytes ?? DEFAULT_MAX_ARG_BYTES
    validateExecLimits({
      defaultTimeoutMs: this.defaultTimeoutMs,
      maxTimeoutMs: this.maxTimeoutMs,
      outputBytes: this.outputBytes,
      maxArgs: this.maxArgs,
      maxArgBytes: this.maxArgBytes
    })
    this.runtimeBinding = createToolRuntimeBinding({
      implementationId: "wanex.workspace.tool.exec",
      implementationRevision: "1",
      configuration: {
        scopeId: requireWorkspaceToolScopeId(options.scopeId),
        programPolicy: options.programPolicy.snapshot(),
        defaultTimeoutMs: this.defaultTimeoutMs,
        maxTimeoutMs: this.maxTimeoutMs,
        outputBytes: this.outputBytes,
        maxArgs: this.maxArgs,
        maxArgBytes: this.maxArgBytes
      }
    })
  }

  presentCall(input: JsonValue) {
    const record = inputRecord(input)
    const program = requiredString(record, "program")
    const cwd = optionalString(record, "cwd") ?? "."
    return {
      summary: `Run ${program}`,
      details: [
        { label: "Program", value: program },
        { label: "Directory", value: cwd }
      ]
    }
  }

  presentResult(request: {
    readonly input: JsonValue
    readonly result: ToolExecutionResult
  }) {
    const input = inputRecord(request.input)
    const program = requiredString(input, "program")
    const output = immediateResultRecord(request.result)
    const exitCode = typeof output?.exitCode === "number"
      ? String(output.exitCode)
      : "Unavailable"
    const durationMs = typeof output?.durationMs === "number"
      ? `${output.durationMs} ms`
      : "Unavailable"
    return {
      summary: request.result.outcome === "succeeded"
        ? `${program} completed`
        : `${program} failed`,
      details: [
        { label: "Exit code", value: exitCode },
        { label: "Duration", value: durationMs }
      ]
    }
  }

  presentFailure(request: {
    readonly input: JsonValue
    readonly reason: "exception" | "cancelled" | "timed_out"
  }) {
    const input = inputRecord(request.input)
    const program = requiredString(input, "program")
    const cwd = optionalString(input, "cwd") ?? "."
    return {
      summary: request.reason === "timed_out"
        ? `${program} timed out`
        : request.reason === "cancelled"
          ? `${program} stopped`
          : `${program} failed`,
      details: [
        { label: "Program", value: program },
        { label: "Directory", value: cwd }
      ]
    }
  }

  async invoke(invocation: ToolInvocation): Promise<ToolExecutionResult> {
    const input = inputRecord(invocation.input)
    const program = requiredString(input, "program")
    const args = stringArray(input, "args")
    validateArgs(args, this.maxArgs, this.maxArgBytes)
    const decision = this.programPolicy.authorize({ program, args })
    if (decision.status === "deny") {
      return {
        outcome: "failed",
        toolCallId: invocation.toolCallId,
        content: jsonToolResultContent({
          error: "program_not_allowed",
          reason: decision.reason,
          program
        })
      }
    }
    const requestedTimeout = optionalPositiveInteger(input, "timeoutMs")
    const timeoutMs = requestedTimeout ?? this.defaultTimeoutMs
    if (timeoutMs > this.maxTimeoutMs) {
      throw new Error(`workspace exec timeout exceeds limit: ${this.maxTimeoutMs}`)
    }
    const cwdInput = optionalString(input, "cwd")
    const cwd = await this.paths.resolveDirectory(cwdInput)
    const result = await this.executionProcess.execute({
      program: decision.executable,
      args,
      cwd,
      ...(invocation.signal === undefined ? {} : { signal: invocation.signal }),
      timeoutMs,
      output: {
        stdoutBytes: this.outputBytes,
        stderrBytes: this.outputBytes
      }
    })
    const isError =
      result.termination !== "exited" ||
      result.exitCode !== 0 ||
      result.cleanup === "failed"
    return {
      outcome: isError ? "failed" : "succeeded",
      toolCallId: invocation.toolCallId,
      content: jsonToolResultContent({
        program,
        args,
        cwd: cwdInput ?? ".",
        exitCode: result.exitCode,
        signal: result.signal,
        termination: result.termination,
        cleanup: result.cleanup,
        ...(result.cleanupError === undefined
          ? {}
          : { cleanupError: result.cleanupError }),
        durationMs: result.durationMs,
        stdout: outputJson(result.stdout),
        stderr: outputJson(result.stderr)
      } satisfies JsonValue)
    }
  }
}

function immediateResultRecord(
  result: ToolExecutionResult
): Readonly<Record<string, JsonValue>> | undefined {
  if (
    (result.outcome !== "succeeded" && result.outcome !== "failed") ||
    result.content.length !== 1 ||
    result.content[0]?.type !== "json"
  ) {
    return undefined
  }
  const value = result.content[0].value
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, JsonValue>>
    : undefined
}

function outputJson(output: ExecutionOutput): JsonValue {
  return {
    text: output.text,
    observedBytes: output.observedBytes,
    retainedBytes: output.retainedBytes,
    truncated: output.truncated
  }
}

function validateArgs(
  args: readonly string[],
  maxArgs: number,
  maxArgBytes: number
): void {
  if (args.length > maxArgs) {
    throw new Error(`workspace exec exceeds argument count: ${maxArgs}`)
  }
  const bytes = args.reduce(
    (total, arg) => total + Buffer.byteLength(arg, "utf8"),
    0
  )
  if (bytes > maxArgBytes) {
    throw new Error(`workspace exec exceeds argument bytes: ${bytes} > ${maxArgBytes}`)
  }
}

function validateExecLimits(options: {
  readonly defaultTimeoutMs: number
  readonly maxTimeoutMs: number
  readonly outputBytes: number
  readonly maxArgs: number
  readonly maxArgBytes: number
}): void {
  for (const [name, value] of Object.entries(options)) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`workspace exec ${name} must be a positive integer`)
    }
  }
  if (options.defaultTimeoutMs > options.maxTimeoutMs) {
    throw new Error("workspace exec default timeout exceeds maximum")
  }
}
