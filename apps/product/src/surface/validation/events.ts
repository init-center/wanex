import type {
  SurfaceCommand,
  SurfaceDescriptor,
  SurfaceEnvelope,
  SurfaceEvent,
  SurfaceEventPage,
} from "../model.js";
import {
  isNonNegativeSafeInteger,
  isPositiveSafeInteger,
  isRecord,
  isSurfaceError,
  optionalRecord,
  optionalString,
  optionalSurfaceError,
} from "./common.js";
import { isSurfaceCommandValue } from "./results.js";
import { isTeamInvalidatedEvent } from "./team.js";
import { isProductPluginManagementInvalidatedEvent } from "./plugin-management.js";
import { isScheduleInvalidatedEvent } from "./schedule.js";

export function isSurfaceDescriptor(
  value: unknown,
): value is SurfaceDescriptor {
  if (!isRecord(value)) return false;
  return (
    value.kind === "product.surface-descriptor" &&
    value.transport === "app-owned-ipc-or-api" &&
    typeof value.commandCount === "number" &&
    isRecord(value.rendererBoundary) &&
    Array.isArray(value.commands)
  );
}

export function isSurfaceEnvelope(
  value: unknown,
  command: SurfaceCommand,
): value is SurfaceEnvelope {
  if (!isRecord(value) || value.command !== command) return false;
  if (value.ok === true) {
    return isSurfaceEvent(value.event) && isSurfaceCommandValue(value.value, command);
  }
  if (value.ok === false) {
    return isSurfaceError(value.error) && isSurfaceEvent(value.event);
  }
  return false;
}

export function isSurfaceEvent(value: unknown): value is SurfaceEvent {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.sequence === "number" &&
    isSurfaceEventType(value.type) &&
    typeof value.command === "string" &&
    typeof value.at === "number" &&
    optionalString(value.requestId) &&
    optionalRecord(value.state) &&
    matchesCommandCatalogEvent(value.type, value.commandCatalog) &&
    matchesCommandExecutionEvent(value.type, value.commandExecution) &&
    optionalConversationEvent(value.conversation) &&
    matchesSideQueryEvent(value.type, value.sideQuery) &&
    matchesPlanEvent(value.type, value.plan) &&
    matchesGoalEvent(value.type, value.goal) &&
    matchesTeamEvent(value.type, value.team) &&
    matchesPluginManagementEvent(value.type, value.pluginManagement) &&
    matchesScheduleEvent(value.type, value.schedule) &&
    optionalSurfaceError(value.error)
  );
}

export function isSurfaceEventPage(value: unknown): value is SurfaceEventPage {
  if (
    !isRecord(value) ||
    typeof value.streamId !== "string" ||
    value.streamId.length === 0 ||
    !isPositiveSafeInteger(value.earliestSequence) ||
    !isNonNegativeSafeInteger(value.latestSequence) ||
    value.earliestSequence > value.latestSequence + 1 ||
    typeof value.gap !== "boolean" ||
    typeof value.hasMore !== "boolean" ||
    !Array.isArray(value.events) ||
    value.events.some((event) => !isSurfaceEvent(event))
  ) {
    return false;
  }
  if (value.gap && value.events.length > 0) return false;
  let previousSequence: number | undefined;
  for (const event of value.events) {
    if (
      event.sequence < value.earliestSequence ||
      event.sequence > value.latestSequence ||
      (previousSequence !== undefined && event.sequence !== previousSequence + 1)
    ) {
      return false;
    }
    previousSequence = event.sequence;
  }
  return true;
}

function isSurfaceEventType(value: unknown): boolean {
  return (
    value === "product.surface.command_completed" ||
    value === "product.surface.command_rejected" ||
    value === "product.surface.state_changed" ||
    value === "product.surface.command-catalog.invalidated" ||
    value === "product.surface.command-execution.invalidated" ||
    value === "product.surface.conversation.assistant-text-delta" ||
    value === "product.surface.conversation.operation-invalidated" ||
    value === "product.surface.side-query.invalidated" ||
    value === "product.surface.plan.invalidated" ||
    value === "product.surface.goal.invalidated"
    || value === "product.surface.team.invalidated"
    || value === "product.surface.plugin-management.invalidated"
    || value === "product.surface.schedule.invalidated"
  );
}

function matchesScheduleEvent(type: unknown, value: unknown): boolean {
  return type === "product.surface.schedule.invalidated"
    ? isScheduleInvalidatedEvent(value)
    : value === undefined;
}

function matchesCommandExecutionEvent(type: unknown, value: unknown): boolean {
  if (type !== "product.surface.command-execution.invalidated") {
    return value === undefined;
  }
  if (!isRecord(value) || !isRecord(value.reference)) return false;
  return value.kind === "product.command-execution.invalidated" &&
    isPositiveSafeInteger(value.sequence) &&
    typeof value.at === "number" &&
    value.reference.kind === "job" &&
    typeof value.reference.id === "string" &&
    value.reference.id.length > 0 &&
    value.reference.id.length <= 512 &&
    value.reference.id === value.reference.id.trim() &&
    !/[\u0000-\u001f\u007f]/u.test(value.reference.id)
}

function matchesCommandCatalogEvent(type: unknown, value: unknown): boolean {
  if (type !== "product.surface.command-catalog.invalidated") {
    return value === undefined;
  }
  if (!isRecord(value)) return false;
  return (
    value.kind === "product.command-catalog.invalidated" &&
    isPositiveSafeInteger(value.sequence) &&
    typeof value.at === "number" &&
    typeof value.revision === "string" &&
    value.revision.length > 0 &&
    value.revision.length <= 256 &&
    value.revision === value.revision.trim() &&
    !/[\u0000-\u001f\u007f]/u.test(value.revision)
  );
}

function optionalConversationEvent(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (value.kind === "product.conversation.operation-invalidated") {
    return (
      typeof value.sequence === "number" &&
      typeof value.at === "number" &&
      typeof value.operationId === "string" &&
      typeof value.sessionId === "string" &&
      (value.cause === "execution_completed" ||
        value.cause === "execution_failed" ||
        value.cause === "execution_suspended")
    );
  }
  return (
    value.kind === "product.conversation.assistant-text-delta" &&
    typeof value.sequence === "number" &&
    typeof value.at === "number" &&
    typeof value.operationId === "string" &&
    typeof value.sessionId === "string" &&
    typeof value.partId === "string" &&
    typeof value.text === "string" &&
    typeof value.truncated === "boolean"
  );
}

function matchesSideQueryEvent(type: unknown, value: unknown): boolean {
  return type === "product.surface.side-query.invalidated"
    ? value !== undefined && optionalSideQueryEvent(value)
    : value === undefined;
}

function optionalSideQueryEvent(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return (
    value.kind === "product.side-query.invalidated" &&
    isPositiveSafeInteger(value.sequence) &&
    typeof value.at === "number" &&
    typeof value.queryId === "string" &&
    (value.cause === "started" ||
      value.cause === "succeeded" ||
      value.cause === "failed" ||
      value.cause === "cancelled" ||
      value.cause === "dismissed")
  );
}

function matchesPlanEvent(type: unknown, value: unknown): boolean {
  if (type !== "product.surface.plan.invalidated") return value === undefined;
  if (!isRecord(value)) return false;
  return (
    value.kind === "product.plan.invalidated" &&
    isPositiveSafeInteger(value.sequence) &&
    typeof value.at === "number" &&
    optionalString(value.sessionId) &&
    optionalString(value.operationId) &&
    optionalString(value.proposalId) &&
    (value.cause === "generation_started" ||
      value.cause === "generation_succeeded" ||
      value.cause === "generation_failed" ||
      value.cause === "generation_cancelled" ||
      value.cause === "generation_dismissed" ||
      value.cause === "selection_changed" ||
      value.cause === "proposal_changed" ||
      value.cause === "execution_submitted")
  );
}

function matchesGoalEvent(type: unknown, value: unknown): boolean {
  if (type !== "product.surface.goal.invalidated") return value === undefined;
  if (!isRecord(value)) return false;
  return (
    value.kind === "product.goal.invalidated" &&
    isPositiveSafeInteger(value.sequence) &&
    typeof value.at === "number" &&
    typeof value.goalId === "string" &&
    typeof value.sessionId === "string" &&
    (value.cause === "created" ||
      value.cause === "paused" ||
      value.cause === "resumed" ||
      value.cause === "attempt_admitted" ||
      value.cause === "attempt_reviewed" ||
      value.cause === "cancel_requested" ||
      value.cause === "cancelled" ||
      value.cause === "recovery_parked" ||
      value.cause === "limit_reached")
  );
}

function matchesTeamEvent(type: unknown, value: unknown): boolean {
  return type === "product.surface.team.invalidated"
    ? isTeamInvalidatedEvent(value)
    : value === undefined;
}

function matchesPluginManagementEvent(type: unknown, value: unknown): boolean {
  return type === "product.surface.plugin-management.invalidated"
    ? isProductPluginManagementInvalidatedEvent(value)
    : value === undefined;
}
