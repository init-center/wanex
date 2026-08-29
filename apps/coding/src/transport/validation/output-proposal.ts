import type {
  CodingProposalActionResult,
  CodingProposalApplyResult,
  CodingProposalReadModel,
  CodingProposalUndoResult,
} from "../../application/model.js";
import {
  boundedString,
  exactObject,
  id,
  isRecord,
  literal,
  nonNegativeInteger,
  timestamp,
} from "./output-utils.js";

export function isCodingProposal(
  value: unknown,
): value is CodingProposalReadModel {
  return (
    exactObject(
      value,
      [
        "projectId",
        "proposalId",
        "state",
        "changeState",
        "incomplete",
        "totalFileCount",
        "returnedFileCount",
        "omittedFileCount",
        "files",
        "totalOperationCount",
        "returnedOperationCount",
        "omittedOperationCount",
        "operations",
      ],
      ["title", "summary", "executionOutcome"],
    ) &&
    id(value.projectId) &&
    id(value.proposalId) &&
    proposalState(value.state) &&
    changeState(value.changeState) &&
    (value.title === undefined || boundedString(value.title, 4096, true)) &&
    (value.summary === undefined ||
      boundedString(value.summary, 16_384, true)) &&
    typeof value.incomplete === "boolean" &&
    (value.executionOutcome === undefined ||
      value.executionOutcome === "failed") &&
    validWindow(
      value.totalFileCount,
      value.returnedFileCount,
      value.omittedFileCount,
      value.files,
      200,
      isFile,
    ) &&
    previewBytes(value.files) <= 256 * 1024 &&
    validWindow(
      value.totalOperationCount,
      value.returnedOperationCount,
      value.omittedOperationCount,
      value.operations,
      200,
      isOperation,
    )
  );
}

export function isCodingProposalAction(
  value: unknown,
): value is CodingProposalActionResult {
  return (
    exactObject(value, ["action", "proposal"]) &&
    literal(value.action, [
      "approve",
      "reject",
      "withdraw",
      "request_apply",
    ] as const) &&
    isCodingProposal(value.proposal)
  );
}

export function isCodingProposalApply(
  value: unknown,
): value is CodingProposalApplyResult {
  return (
    exactObject(value, ["status", "proposal"], ["mutation"]) &&
    literal(value.status, [
      "applied",
      "apply_failed",
      "busy",
      "recovery_required",
      "not_ready",
      "already_terminal",
    ] as const) &&
    isCodingProposal(value.proposal) &&
    (value.mutation === undefined || isMutation(value.mutation))
  );
}

export function isCodingProposalUndo(
  value: unknown,
): value is CodingProposalUndoResult {
  return (
    exactObject(value, ["status", "replayed", "proposal", "mutation"]) &&
    literal(value.status, [
      "applied",
      "already_applied",
      "conflicted",
    ] as const) &&
    typeof value.replayed === "boolean" &&
    isCodingProposal(value.proposal) &&
    isMutation(value.mutation)
  );
}

function isFile(value: unknown): boolean {
  return (
    exactObject(value, ["path", "kind"], ["before", "after"]) &&
    portablePath(value.path) &&
    literal(value.kind, ["create", "update", "delete"] as const) &&
    (value.before === undefined || isPreview(value.before)) &&
    (value.after === undefined || isPreview(value.after))
  );
}

function isPreview(value: unknown): boolean {
  return (
    exactObject(value, ["sha256", "truncated"], ["text"]) &&
    boundedString(value.sha256, 128) &&
    (value.text === undefined || boundedString(value.text, 256 * 1024, true)) &&
    typeof value.truncated === "boolean"
  );
}

function isOperation(value: unknown): boolean {
  return (
    exactObject(
      value,
      ["action", "fromState", "toState", "createdAt"],
      ["reason"],
    ) &&
    literal(value.action, [
      "approve",
      "reject",
      "withdraw",
      "request_apply",
    ] as const) &&
    proposalState(value.fromState) &&
    proposalState(value.toState) &&
    (value.reason === undefined || boundedString(value.reason, 4096, true)) &&
    timestamp(value.createdAt)
  );
}

function isMutation(value: unknown): boolean {
  return (
    exactObject(value, [
      "kind",
      "status",
      "totalFileCount",
      "returnedFileCount",
      "omittedFileCount",
      "files",
      "totalConflictCount",
      "returnedConflictCount",
      "omittedConflictCount",
      "conflicts",
    ]) &&
    literal(value.kind, ["apply", "undo"] as const) &&
    literal(value.status, [
      "applied",
      "already_applied",
      "conflicted",
    ] as const) &&
    validWindow(
      value.totalFileCount,
      value.returnedFileCount,
      value.omittedFileCount,
      value.files,
      200,
      isMutationFile,
    ) &&
    validWindow(
      value.totalConflictCount,
      value.returnedConflictCount,
      value.omittedConflictCount,
      value.conflicts,
      200,
      isConflict,
    )
  );
}

function isMutationFile(value: unknown): boolean {
  return (
    exactObject(value, ["path", "kind"], ["beforeSha256", "afterSha256"]) &&
    portablePath(value.path) &&
    literal(value.kind, ["create", "update", "delete"] as const) &&
    (value.beforeSha256 === undefined ||
      boundedString(value.beforeSha256, 128)) &&
    (value.afterSha256 === undefined || boundedString(value.afterSha256, 128))
  );
}

function isConflict(value: unknown): boolean {
  return (
    exactObject(
      value,
      ["path", "reason"],
      ["currentSha256", "expectedSha256"],
    ) &&
    portablePath(value.path) &&
    literal(value.reason, [
      "missing_base",
      "base_hash_mismatch",
      "already_exists",
      "missing_file",
      "undo_target_changed",
    ] as const) &&
    (value.currentSha256 === undefined ||
      boundedString(value.currentSha256, 128)) &&
    (value.expectedSha256 === undefined ||
      boundedString(value.expectedSha256, 128))
  );
}

function validWindow(
  total: unknown,
  returned: unknown,
  omitted: unknown,
  items: unknown,
  maximum: number,
  predicate: (item: unknown) => boolean,
): boolean {
  return (
    nonNegativeInteger(total) &&
    nonNegativeInteger(returned) &&
    nonNegativeInteger(omitted) &&
    Array.isArray(items) &&
    items.length <= maximum &&
    items.every(predicate) &&
    returned === items.length &&
    total === returned + omitted
  );
}

function proposalState(value: unknown): boolean {
  return literal(value, [
    "open",
    "approved",
    "rejected",
    "withdrawn",
    "apply_requested",
    "applying",
    "applied",
    "apply_failed",
    "recovery_required",
  ] as const);
}

function changeState(value: unknown): boolean {
  return literal(value, [
    "submitted",
    "applied",
    "already_applied",
    "conflicted",
    "undone",
    "undo_conflicted",
  ] as const);
}

function previewBytes(files: unknown): number {
  if (!Array.isArray(files)) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (const file of files) {
    if (!isRecord(file)) continue;
    for (const side of [file.before, file.after]) {
      if (isRecord(side) && typeof side.text === "string") {
        total += new TextEncoder().encode(side.text).byteLength;
      }
    }
  }
  return total;
}

function portablePath(value: unknown): value is string {
  if (
    !boundedString(value, 4096) ||
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(value)
  )
    return false;
  return value
    .replaceAll("\\", "/")
    .split("/")
    .every((part) => part.length > 0 && part !== "." && part !== "..");
}
