import type { JsonValue } from "@wanex/protocol"
import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolInvocation
} from "@wanex/runtime/tools"
import type { ChangeSet, FileChange } from "../changesets/index.js"
import type { WorkspaceRuntime } from "../runtime.js"
import { inputRecord, optionalString, requiredString } from "./input.js"

const DEFAULT_MAX_CHANGE_FILES = 32
const DEFAULT_MAX_CHANGE_BYTES = 1024 * 1024

export class WorkspaceApplyChangeSetTool implements ToolDefinition {
  readonly name = "workspace_apply_changeset"
  readonly description =
    "Apply a bounded, conflict-checked workspace changeset with durable undo history."
  readonly inputSchema = {
    type: "object",
    properties: {
      id: { type: "string", minLength: 1, maxLength: 256 },
      title: { type: "string", maxLength: 512 },
      changes: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            path: { type: "string", minLength: 1, maxLength: 4_096 },
            kind: { type: "string", enum: ["create", "update", "delete"] },
            baseText: { type: "string" },
            baseSha256: { type: "string", minLength: 64, maxLength: 64 },
            targetText: { type: "string" }
          },
          required: ["path", "kind"],
          additionalProperties: false
        }
      }
    },
    required: ["id", "changes"],
    additionalProperties: false
  } as const
  readonly risk = "mutating" as const
  readonly idempotent = false
  readonly annotations = {
    destructiveHint: true,
    openWorldHint: false
  } as const

  private readonly runtime: WorkspaceRuntime
  private readonly maxFiles: number
  private readonly maxBytes: number

  constructor(options: {
    readonly runtime: WorkspaceRuntime
    readonly maxFiles?: number
    readonly maxBytes?: number
  }) {
    this.runtime = options.runtime
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_CHANGE_FILES
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_CHANGE_BYTES
    if (!Number.isInteger(this.maxFiles) || this.maxFiles <= 0) {
      throw new Error("workspace changeset maxFiles must be a positive integer")
    }
    if (!Number.isInteger(this.maxBytes) || this.maxBytes <= 0) {
      throw new Error("workspace changeset maxBytes must be a positive integer")
    }
  }

  async invoke(invocation: ToolInvocation): Promise<ToolExecutionResult> {
    const changeSet = parseChangeSet(
      invocation.input,
      this.maxFiles,
      this.maxBytes
    )
    const applied = await this.runtime.applyChangeSet({
      changeSet,
      principalId: invocation.principalId
    })
    return {
      toolCallId: invocation.toolCallId,
      result: {
        changeSetId: applied.changeSet.id,
        state: applied.changeSet.currentState,
        operationId: applied.operation.id,
        status: applied.receipt.status,
        files: applied.receipt.files.map((file) => ({
          path: file.path,
          kind: file.kind,
          merged: file.merged,
          beforeSha256: file.beforeSha256 ?? null,
          afterSha256: file.afterSha256 ?? null
        })),
        conflicts: applied.receipt.conflicts.map((conflict) => ({
          path: conflict.path,
          reason: conflict.reason,
          currentSha256: conflict.currentSha256 ?? null,
          expectedSha256: conflict.expectedSha256 ?? null
        }))
      } satisfies JsonValue,
      isError: false
    }
  }
}

function parseChangeSet(
  input: JsonValue,
  maxFiles: number,
  maxBytes: number
): ChangeSet {
  const record = inputRecord(input)
  const rawChanges = record.changes
  if (!Array.isArray(rawChanges) || rawChanges.length === 0) {
    throw new Error("workspace tool changes must be a non-empty array")
  }
  if (rawChanges.length > maxFiles) {
    throw new Error(`workspace changeset exceeds file limit: ${maxFiles}`)
  }
  let bytes = 0
  const changes = rawChanges.map((value): FileChange => {
    const change = inputRecord(value)
    const path = requiredString(change, "path")
    const kind = requiredString(change, "kind")
    if (kind !== "create" && kind !== "update" && kind !== "delete") {
      throw new Error(`invalid workspace file change kind: ${kind}`)
    }
    const baseText = optionalString(change, "baseText")
    const baseSha256 = optionalString(change, "baseSha256")
    const targetText = optionalString(change, "targetText")
    bytes += Buffer.byteLength(path, "utf8")
    bytes += Buffer.byteLength(baseText ?? "", "utf8")
    bytes += Buffer.byteLength(targetText ?? "", "utf8")
    return {
      path,
      kind,
      ...(baseText === undefined ? {} : { baseText }),
      ...(baseSha256 === undefined ? {} : { baseSha256 }),
      ...(targetText === undefined ? {} : { targetText })
    }
  })
  if (bytes > maxBytes) {
    throw new Error(`workspace changeset exceeds byte limit: ${bytes} > ${maxBytes}`)
  }
  const title = optionalString(record, "title")
  return {
    id: requiredString(record, "id"),
    ...(title === undefined ? {} : { title }),
    changes
  }
}
