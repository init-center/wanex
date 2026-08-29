import { createHash } from "node:crypto"
import type { ExecutionFileSystem } from "@wanex/runtime/execution"
import type { JsonValue } from "@wanex/protocol"
import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolInvocation
} from "@wanex/runtime/tools"
import { createToolRuntimeBinding, jsonToolResultContent } from "@wanex/runtime/tools"
import { WorkspacePathResolver } from "../path-policy.js"
import { inputRecord, requiredString } from "./input.js"
import { requireWorkspaceToolScopeId } from "./scope.js"

const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024

export class WorkspaceReadTextTool implements ToolDefinition {
  readonly name = "workspace_read_text"
  readonly description = "Read bounded UTF-8 text from the active workspace."
  readonly inputSchema = {
    type: "object",
    properties: {
      path: { type: "string", minLength: 1, maxLength: 4_096 }
    },
    required: ["path"],
    additionalProperties: false
  } as const
  readonly risk = "read_only" as const
  readonly idempotent = true
  readonly concurrency = "parallel_safe" as const
  readonly resultMode = "immediate" as const
  readonly annotations = {
    readOnlyHint: true,
    idempotentHint: true
  } as const
  readonly runtimeBinding

  private readonly paths: WorkspacePathResolver
  private readonly fileSystem: ExecutionFileSystem
  private readonly maxFileBytes: number
  private readonly maxOutputBytes: number

  constructor(options: {
    readonly scopeId: string
    readonly rootDir: string
    readonly fileSystem: ExecutionFileSystem
    readonly maxFileBytes?: number
    readonly maxOutputBytes?: number
  }) {
    this.fileSystem = options.fileSystem
    this.paths = new WorkspacePathResolver(options.rootDir, options.fileSystem)
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
    validateReadLimits(this.maxFileBytes, this.maxOutputBytes)
    this.runtimeBinding = createToolRuntimeBinding({
      implementationId: "wanex.workspace.tool.read-text",
      implementationRevision: "1",
      configuration: {
        scopeId: requireWorkspaceToolScopeId(options.scopeId),
        maxFileBytes: this.maxFileBytes,
        maxOutputBytes: this.maxOutputBytes
      }
    })
  }

  presentCall(input: JsonValue) {
    const path = requiredString(inputRecord(input), "path")
    return {
      summary: "Read workspace file",
      details: [{ label: "Path", value: path }]
    }
  }

  presentResult(request: {
    readonly input: JsonValue
    readonly result: ToolExecutionResult
  }) {
    const path = requiredString(inputRecord(request.input), "path")
    return {
      summary: request.result.outcome === "succeeded"
        ? "Workspace file read"
        : "Workspace file read failed",
      details: [{ label: "Path", value: path }]
    }
  }

  presentFailure(request: {
    readonly input: JsonValue
    readonly reason: "exception" | "cancelled" | "timed_out"
  }) {
    const path = requiredString(inputRecord(request.input), "path")
    return {
      summary: request.reason === "timed_out"
        ? "Workspace read timed out"
        : request.reason === "cancelled"
          ? "Workspace read stopped"
          : "Workspace file read failed",
      details: [{ label: "Path", value: path }]
    }
  }

  async invoke(invocation: ToolInvocation): Promise<ToolExecutionResult> {
    const path = requiredString(inputRecord(invocation.input), "path")
    const result = await readBoundedText(
      this.fileSystem,
      await this.paths.resolveRead(path),
      this.maxFileBytes,
      this.maxOutputBytes
    )
    return {
      outcome: "succeeded",
      toolCallId: invocation.toolCallId,
      content: jsonToolResultContent({
        path,
        ...result
      } satisfies JsonValue)
    }
  }
}

async function readBoundedText(
  fileSystem: ExecutionFileSystem,
  path: string,
  maxFileBytes: number,
  maxOutputBytes: number
): Promise<{
  readonly text: string
  readonly totalBytes: number
  readonly retainedBytes: number
  readonly truncated: boolean
  readonly sha256: string
}> {
  const file = await fileSystem.metadata(path)
  if (file === null || file.kind !== "file") {
      throw new Error("workspace read target is not a file")
  }
  if (file.size > maxFileBytes) {
    throw new Error(
      `workspace read file exceeds limit: ${file.size} > ${maxFileBytes}`
    )
  }
  const hash = createHash("sha256")
  const retained: Buffer[] = []
  let retainedBytes = 0
  let position = 0
  const chunkBytes = Math.min(64 * 1024, Math.max(1, maxFileBytes))

  while (position < file.size) {
      const chunk = await fileSystem.readRange(path, {
        offset: position,
        length: Math.min(chunkBytes, file.size - position)
      })
      if (chunk.byteLength === 0) break
      if (chunk.includes(0)) {
        throw new Error("workspace read target is not UTF-8 text")
      }
      hash.update(chunk)
      if (retainedBytes < maxOutputBytes) {
        const take = Math.min(maxOutputBytes - retainedBytes, chunk.byteLength)
        retained.push(Buffer.from(chunk.subarray(0, take)))
        retainedBytes += take
      }
      position += chunk.byteLength
  }

  return {
    text: Buffer.concat(retained).toString("utf8"),
    totalBytes: position,
    retainedBytes,
    truncated: position > retainedBytes,
    sha256: hash.digest("hex")
  }
}

function validateReadLimits(maxFileBytes: number, maxOutputBytes: number): void {
  if (!Number.isInteger(maxFileBytes) || maxFileBytes <= 0) {
    throw new Error("workspace read maxFileBytes must be a positive integer")
  }
  if (
    !Number.isInteger(maxOutputBytes) ||
    maxOutputBytes <= 0 ||
    maxOutputBytes > maxFileBytes
  ) {
    throw new Error(
      "workspace read maxOutputBytes must be positive and no greater than maxFileBytes"
    )
  }
}
