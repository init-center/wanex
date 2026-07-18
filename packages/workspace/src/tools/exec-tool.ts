import type { JsonValue } from "@wanex/protocol"
import type { ExecutionHost, ExecutionOutput } from "@wanex/runtime/execution"
import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolInvocation
} from "@wanex/runtime/tools"
import { WorkspacePathResolver } from "../path-policy.js"
import {
  inputRecord,
  optionalPositiveInteger,
  optionalString,
  requiredString,
  stringArray
} from "./input.js"
import type { WorkspaceProgramPolicy } from "./program-policy.js"

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
  readonly drainsCancellation = true as const
  readonly annotations = {
    destructiveHint: true,
    openWorldHint: true
  } as const

  private readonly paths: WorkspacePathResolver
  private readonly executionHost: ExecutionHost
  private readonly programPolicy: WorkspaceProgramPolicy
  private readonly defaultTimeoutMs: number
  private readonly maxTimeoutMs: number
  private readonly outputBytes: number
  private readonly maxArgs: number
  private readonly maxArgBytes: number

  constructor(options: {
    readonly rootDir: string
    readonly executionHost: ExecutionHost
    readonly programPolicy: WorkspaceProgramPolicy
    readonly defaultTimeoutMs?: number
    readonly maxTimeoutMs?: number
    readonly outputBytes?: number
    readonly maxArgs?: number
    readonly maxArgBytes?: number
  }) {
    this.paths = new WorkspacePathResolver(options.rootDir)
    this.executionHost = options.executionHost
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
  }

  async invoke(invocation: ToolInvocation): Promise<ToolExecutionResult> {
    const input = inputRecord(invocation.input)
    const program = requiredString(input, "program")
    const args = stringArray(input, "args")
    validateArgs(args, this.maxArgs, this.maxArgBytes)
    const decision = this.programPolicy.authorize({ program, args })
    if (decision.status === "deny") {
      return {
        toolCallId: invocation.toolCallId,
        result: {
          error: "program_not_allowed",
          reason: decision.reason,
          program
        },
        isError: true
      }
    }
    const requestedTimeout = optionalPositiveInteger(input, "timeoutMs")
    const timeoutMs = requestedTimeout ?? this.defaultTimeoutMs
    if (timeoutMs > this.maxTimeoutMs) {
      throw new Error(`workspace exec timeout exceeds limit: ${this.maxTimeoutMs}`)
    }
    const cwdInput = optionalString(input, "cwd")
    const cwd = await this.paths.resolveDirectory(cwdInput)
    const result = await this.executionHost.execute({
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
      toolCallId: invocation.toolCallId,
      result: {
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
      } satisfies JsonValue,
      isError
    }
  }
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
