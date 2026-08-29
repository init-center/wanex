import type {
  CodingApplicationEvent,
  CodingApplicationEventPage,
} from "../../application/model.js";
import {
  exactObject,
  id,
  isRecord,
  literal,
  nonNegativeInteger,
  positiveInteger,
  timestamp,
} from "./output-utils.js";

export function isCodingEvent(value: unknown): value is CodingApplicationEvent {
  if (
    !isRecord(value) ||
    !id(value.streamId) ||
    !positiveInteger(value.sequence) ||
    !timestamp(value.occurredAt) ||
    !id(value.projectId)
  )
    return false;
  if (value.kind === "project_invalidated") {
    return (
      exactObject(value, [
        "streamId",
        "sequence",
        "occurredAt",
        "projectId",
        "reason",
        "kind",
      ]) &&
      literal(value.reason, [
        "project_opened",
        "project_closed",
        "recovery_attention",
      ] as const)
    );
  }
  if (value.kind === "turn_invalidated") {
    return (
      exactObject(value, [
        "streamId",
        "sequence",
        "occurredAt",
        "projectId",
        "reason",
        "kind",
        "turnId",
      ]) &&
      id(value.turnId) &&
      literal(value.reason, [
        "turn_started",
        "turn_admitted",
        "turn_progress",
        "turn_waiting",
        "turn_execution_settled",
        "turn_settled",
        "turn_cancel_requested",
        "approval_resolved",
        "turn_recovery_resolved",
      ] as const)
    );
  }
  if (value.kind === "turn_live_invalidated") {
    return (
      exactObject(value, [
        "streamId",
        "sequence",
        "occurredAt",
        "projectId",
        "reason",
        "kind",
        "turnId",
        "revision",
      ]) &&
      id(value.turnId) &&
      positiveInteger(value.revision) &&
      value.reason === "turn_live_updated"
    );
  }
  return (
    value.kind === "proposal_invalidated" &&
    exactObject(value, [
      "streamId",
      "sequence",
      "occurredAt",
      "projectId",
      "reason",
      "kind",
      "proposalId",
    ]) &&
    id(value.proposalId) &&
    literal(value.reason, [
      "proposal_reviewed",
      "proposal_apply_requested",
      "proposal_applied",
      "proposal_undone",
    ] as const)
  );
}

export function isCodingEventPage(
  value: unknown,
): value is CodingApplicationEventPage {
  return (
    exactObject(value, [
      "streamId",
      "events",
      "firstRetainedSequence",
      "lastSequence",
      "gap",
      "hasMore",
    ]) &&
    id(value.streamId) &&
    Array.isArray(value.events) &&
    value.events.length <= 100 &&
    value.events.every(isCodingEvent) &&
    value.events.every((event) => event.streamId === value.streamId) &&
    value.events.every(
      (event, index, events) =>
        index === 0 || event.sequence > events[index - 1]!.sequence,
    ) &&
    positiveInteger(value.firstRetainedSequence) &&
    nonNegativeInteger(value.lastSequence) &&
    typeof value.gap === "boolean" &&
    typeof value.hasMore === "boolean"
  );
}
