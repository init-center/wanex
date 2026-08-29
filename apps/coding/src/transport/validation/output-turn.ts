import type {
  CodingLiveTurnReadModel,
  CodingTurnPage,
  CodingTurnReadModel,
} from "../../application/model.js";
import {
  boundedString,
  exactObject,
  id,
  literal,
  nonNegativeInteger,
  positiveInteger,
  timestamp,
} from "./output-utils.js";

export function isCodingTurnPage(value: unknown): value is CodingTurnPage {
  return (
    exactObject(value, ["turns", "returnedCount", "hasMore"], ["nextCursor"]) &&
    Array.isArray(value.turns) &&
    value.turns.length <= 100 &&
    value.turns.every(isCodingTurn) &&
    nonNegativeInteger(value.returnedCount) &&
    value.returnedCount === value.turns.length &&
    typeof value.hasMore === "boolean" &&
    (value.nextCursor === undefined || boundedString(value.nextCursor, 2048))
  );
}

export function isCodingTurn(value: unknown): value is CodingTurnReadModel {
  return (
    exactObject(
      value,
      [
        "projectId",
        "sessionId",
        "turnId",
        "state",
        "createdAt",
        "updatedAt",
        "canCancel",
        "approvals",
        "recovery",
      ],
      ["finishedAt", "result", "proposalId", "error"],
    ) &&
    id(value.projectId) &&
    id(value.sessionId) &&
    id(value.turnId) &&
    literal(value.state, [
      "starting",
      "queued",
      "running",
      "waiting",
      "cancel_requested",
      "succeeded",
      "failed",
      "cancelled",
      "interrupted",
      "recovery_required",
    ] as const) &&
    timestamp(value.createdAt) &&
    timestamp(value.updatedAt) &&
    (value.finishedAt === undefined || timestamp(value.finishedAt)) &&
    typeof value.canCancel === "boolean" &&
    isApprovals(value.approvals) &&
    isRecovery(value.recovery) &&
    (value.result === undefined ||
      literal(value.result, [
        "proposal_available",
        "no_changes",
        "failed",
        "cancelled",
        "attention",
      ] as const)) &&
    (value.proposalId === undefined || id(value.proposalId)) &&
    (value.error === undefined || isError(value.error))
  );
}

export function isCodingLiveTurn(
  value: unknown,
): value is CodingLiveTurnReadModel {
  return (
    exactObject(
      value,
      [
        "projectId",
        "sessionId",
        "turnId",
        "revision",
        "updatedAt",
        "phase",
        "assistantText",
        "assistantTextTruncated",
        "activities",
        "activitiesTruncated",
      ],
    ) &&
    id(value.projectId) &&
    id(value.sessionId) &&
    id(value.turnId) &&
    positiveInteger(value.revision) &&
    timestamp(value.updatedAt) &&
    literal(value.phase, [
      "starting",
      "thinking",
      "responding",
      "tool_calling",
      "waiting",
      "cancelling",
      "settling",
      "failed",
    ] as const) &&
    boundedString(value.assistantText, 65_536, true) &&
    typeof value.assistantTextTruncated === "boolean" &&
    Array.isArray(value.activities) &&
    value.activities.length <= 32 &&
    value.activities.every(isLiveActivity) &&
    typeof value.activitiesTruncated === "boolean"
  );
}

function isLiveActivity(value: unknown): boolean {
  return (
    exactObject(value, ["ordinal", "nameTruncated", "state"], ["name"]) &&
    positiveInteger(value.ordinal) &&
    (value.name === undefined || boundedString(value.name, 256)) &&
    typeof value.nameTruncated === "boolean" &&
    literal(value.state, ["streaming", "ready"] as const)
  );
}

function isApprovals(value: unknown): boolean {
  return (
    exactObject(value, [
      "totalCount",
      "returnedCount",
      "omittedCount",
      "items",
    ]) &&
    nonNegativeInteger(value.totalCount) &&
    nonNegativeInteger(value.returnedCount) &&
    nonNegativeInteger(value.omittedCount) &&
    Array.isArray(value.items) &&
    value.items.length <= 16 &&
    value.returnedCount === value.items.length &&
    value.totalCount === value.returnedCount + value.omittedCount &&
    value.items.every(isApproval)
  );
}

function isRecovery(value: unknown): boolean {
  return (
    exactObject(value, [
      "totalCount",
      "returnedCount",
      "omittedCount",
      "items",
    ]) &&
    nonNegativeInteger(value.totalCount) &&
    nonNegativeInteger(value.returnedCount) &&
    nonNegativeInteger(value.omittedCount) &&
    Array.isArray(value.items) &&
    value.items.length <= 16 &&
    value.returnedCount === value.items.length &&
    value.totalCount === value.returnedCount + value.omittedCount &&
    value.items.every(isRecoveryItem)
  );
}

function isRecoveryItem(value: unknown): boolean {
  return (
    exactObject(value, [
      "executionId",
      "recoveryRevision",
      "tool",
      "evidence",
      "attemptCount",
      "attempts",
      "attemptsTruncated",
      "createdAt",
      "updatedAt",
      "availableDecisions",
    ]) &&
    id(value.executionId) &&
    positiveInteger(value.recoveryRevision) &&
    exactObject(value.tool, ["name", "title", "risk", "idempotent", "resultMode"]) &&
    boundedString(value.tool.name, 512) &&
    boundedString(value.tool.title, 1024, true) &&
    literal(value.tool.risk, ["read_only", "mutating", "external"] as const) &&
    typeof value.tool.idempotent === "boolean" &&
    literal(value.tool.resultMode, ["immediate", "deferred"] as const) &&
    isRecoveryEvidence(value.evidence) &&
    nonNegativeInteger(value.attemptCount) &&
    Array.isArray(value.attempts) &&
    value.attempts.length <= 16 &&
    value.attempts.every(isRecoveryAttempt) &&
    typeof value.attemptsTruncated === "boolean" &&
    timestamp(value.createdAt) &&
    timestamp(value.updatedAt) &&
    isRecoveryDecisions(value.availableDecisions)
  );
}

function isRecoveryEvidence(value: unknown): boolean {
  return (
    exactObject(value, ["message", "messageTruncated"], ["reconciliationRef"]) &&
    boundedString(value.message, 8192, true) &&
    typeof value.messageTruncated === "boolean" &&
    (value.reconciliationRef === undefined || boundedString(value.reconciliationRef, 1024))
  );
}

function isRecoveryAttempt(value: unknown): boolean {
  return (
    exactObject(value, ["attemptNumber", "state", "startedAt", "updatedAt"], ["finishedAt"]) &&
    positiveInteger(value.attemptNumber) &&
    literal(value.state, [
      "running",
      "suspended",
      "succeeded",
      "failed",
      "cancelled",
      "interrupted",
      "recovery_required",
    ] as const) &&
    timestamp(value.startedAt) &&
    timestamp(value.updatedAt) &&
    (value.finishedAt === undefined || timestamp(value.finishedAt))
  );
}

function isRecoveryDecisions(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.length <= 4 &&
    value.every((decision) =>
      literal(decision, [
        "confirm_succeeded",
        "confirm_failed",
        "retry",
        "abandon_turn",
      ] as const),
    ) &&
    value.includes("confirm_succeeded") &&
    value.includes("confirm_failed") &&
    value.includes("abandon_turn") &&
    (value.length === 3 || value.includes("retry"))
  );
}

function isApproval(value: unknown): boolean {
  return (
    exactObject(value, [
      "executionId",
      "approvalRevision",
      "tool",
      "presentation",
      "attemptCount",
      "createdAt",
      "updatedAt",
      "availableDecisions",
    ]) &&
    id(value.executionId) &&
    nonNegativeInteger(value.approvalRevision) &&
    exactObject(value.tool, ["name", "title", "risk", "idempotent"]) &&
    boundedString(value.tool.name, 512) &&
    boundedString(value.tool.title, 1024, true) &&
    literal(value.tool.risk, ["read_only", "mutating", "external"] as const) &&
    typeof value.tool.idempotent === "boolean" &&
    isPresentation(value.presentation) &&
    nonNegativeInteger(value.attemptCount) &&
    timestamp(value.createdAt) &&
    timestamp(value.updatedAt) &&
    Array.isArray(value.availableDecisions) &&
    value.availableDecisions.length === 2 &&
    value.availableDecisions[0] === "approve_once" &&
    value.availableDecisions[1] === "deny"
  );
}

function isPresentation(value: unknown): boolean {
  return (
    exactObject(value, [
      "summary",
      "summaryTruncated",
      "details",
      "detailsTruncated",
    ]) &&
    boundedString(value.summary, 4096, true) &&
    typeof value.summaryTruncated === "boolean" &&
    Array.isArray(value.details) &&
    value.details.length <= 16 &&
    value.details.every(
      (detail) =>
        exactObject(detail, [
          "label",
          "labelTruncated",
          "value",
          "valueTruncated",
        ]) &&
        boundedString(detail.label, 1024, true) &&
        typeof detail.labelTruncated === "boolean" &&
        boundedString(detail.value, 8192, true) &&
        typeof detail.valueTruncated === "boolean",
    ) &&
    typeof value.detailsTruncated === "boolean"
  );
}

function isError(value: unknown): boolean {
  return (
    exactObject(value, ["code", "message"]) &&
    literal(value.code, [
      "application_closed",
      "project_unavailable",
      "turn_unavailable",
      "invalid_request",
      "turn_execution_failed",
    ] as const) &&
    boundedString(value.message, 2048, true)
  );
}
