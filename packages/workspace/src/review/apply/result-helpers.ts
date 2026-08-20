import type { JsonValue } from "@wanex/protocol"
import type { ApplyWorkspaceChangeSetResult } from "../../index.js"
import type {
  ApplyProposalBatchItemResult,
  ApplyProposalBatchStatus,
  ApplyProposalRequest
} from "./types.js"

export function summarizeBatchStatus(
  results: readonly ApplyProposalBatchItemResult[]
): ApplyProposalBatchStatus {
  const appliedCount = results.filter((result) => result.status === "applied")
    .length
  if (appliedCount === results.length) {
    return "applied"
  }
  return appliedCount > 0 ? "partial" : "failed"
}

export function validateApplyProposalRequest(request: ApplyProposalRequest): void {
  if (request.proposalId.length === 0) {
    throw new Error("proposal apply proposalId must not be empty")
  }
  if (request.actorId === "") {
    throw new Error("proposal apply actorId must not be empty")
  }
}

export function mergeMetadata(
  left: JsonValue | undefined,
  right: Record<string, JsonValue | undefined>
): JsonValue {
  const base: Record<string, JsonValue> =
    typeof left === "object" && left !== null && !Array.isArray(left)
      ? { ...(left as Record<string, JsonValue>) }
      : left === undefined
        ? {}
        : { request: left }
  for (const [key, value] of Object.entries(right)) {
    if (value !== undefined) {
      base[key] = value
    }
  }
  return base
}

export function normalizeApplyError(error: unknown): JsonValue {
  if (error instanceof Error) {
    return {
      type: "workspace.apply_error",
      name: error.name,
      message: error.message
    }
  }
  return {
    type: "workspace.apply_error",
    message: String(error)
  }
}

export function toReceiptMetadata(
  receipt: ApplyWorkspaceChangeSetResult["receipt"]
): JsonValue {
  return {
    changeSetId: receipt.changeSetId,
    status: receipt.status,
    files: receipt.files.map((file) => ({
      path: file.path,
      kind: file.kind,
      ...(file.beforeText === undefined ? {} : { beforeText: file.beforeText }),
      ...(file.afterText === undefined ? {} : { afterText: file.afterText }),
      ...(file.beforeSha256 === undefined
        ? {}
        : { beforeSha256: file.beforeSha256 }),
      ...(file.afterSha256 === undefined
        ? {}
        : { afterSha256: file.afterSha256 })
    })),
    conflicts: receipt.conflicts.map((conflict) => ({
      path: conflict.path,
      reason: conflict.reason,
      ...(conflict.currentSha256 === undefined
        ? {}
        : { currentSha256: conflict.currentSha256 }),
      ...(conflict.expectedSha256 === undefined
        ? {}
        : { expectedSha256: conflict.expectedSha256 })
    }))
  }
}

export function extractErrorReason(error: JsonValue): string {
  if (typeof error === "object" && error !== null && !Array.isArray(error)) {
    const message = (error as Record<string, JsonValue>).message
    if (typeof message === "string" && message.length > 0) {
      return message
    }
    const type = (error as Record<string, JsonValue>).type
    if (typeof type === "string" && type.length > 0) {
      return type
    }
  }
  return "workspace apply failed"
}
