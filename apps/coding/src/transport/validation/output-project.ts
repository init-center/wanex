import type {
  CodingProjectReadModel,
  CodingSessionPage,
  CodingSessionReadModel,
} from "../../application/model.js";
import {
  boundedString,
  exactObject,
  id,
  literal,
  nonNegativeInteger,
  timestamp,
} from "./output-utils.js";

export function isCodingProjectList(
  value: unknown,
): value is readonly CodingProjectReadModel[] {
  return (
    Array.isArray(value) && value.length <= 100 && value.every(isCodingProject)
  );
}

export function isCodingProject(
  value: unknown,
): value is CodingProjectReadModel {
  return (
    exactObject(value, [
      "projectId",
      "name",
      "state",
      "openedAt",
      "recovery",
    ]) &&
    id(value.projectId) &&
    boundedString(value.name, 1024, true) &&
    literal(value.state, ["ready", "attention"] as const) &&
    timestamp(value.openedAt) &&
    isRecovery(value.recovery)
  );
}

export function isCodingSession(
  value: unknown,
): value is CodingSessionReadModel {
  return (
    exactObject(
      value,
      ["projectId", "sessionId", "status", "createdAt", "updatedAt"],
      ["title"],
    ) &&
    id(value.projectId) &&
    id(value.sessionId) &&
    (value.title === undefined || boundedString(value.title, 4096, true)) &&
    literal(value.status, ["active", "archived"] as const) &&
    timestamp(value.createdAt) &&
    timestamp(value.updatedAt)
  );
}

export function isCodingSessionPage(
  value: unknown,
): value is CodingSessionPage {
  return (
    exactObject(
      value,
      ["sessions", "returnedCount", "hasMore"],
      ["nextCursor"],
    ) &&
    Array.isArray(value.sessions) &&
    value.sessions.length <= 100 &&
    value.sessions.every(isCodingSession) &&
    nonNegativeInteger(value.returnedCount) &&
    value.returnedCount === value.sessions.length &&
    typeof value.hasMore === "boolean" &&
    (value.nextCursor === undefined || boundedString(value.nextCursor, 2048))
  );
}

function isRecovery(value: unknown): boolean {
  return (
    exactObject(value, [
      "transactionAttention",
      "taskAttentionCount",
      "taskFailureCount",
      "moreTasksPending",
    ]) &&
    typeof value.transactionAttention === "boolean" &&
    nonNegativeInteger(value.taskAttentionCount) &&
    nonNegativeInteger(value.taskFailureCount) &&
    typeof value.moreTasksPending === "boolean"
  );
}
