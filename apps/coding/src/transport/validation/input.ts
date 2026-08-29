import type { UserMessageInputPart } from "@wanex/protocol";
import type {
  CodingCommand,
  CodingCommandInputMap,
  CodingCommandRequest,
} from "../model.js";
import { CODING_COMMANDS, CODING_TRANSPORT_PROTOCOL } from "../model.js";
import {
  boundedString,
  exactObject,
  isRecord,
  literal,
  nonNegativeInteger,
  optional,
  positiveInteger,
} from "./common.js";

const COMMANDS = new Set<string>(Object.values(CODING_COMMANDS));
const MAX_ID_BYTES = 512;
const MAX_CURSOR_BYTES = 2_048;
const MAX_REASON_BYTES = 1_024;
const MAX_TITLE_BYTES = 1_024;
const MAX_USER_TEXT_BYTES = 1024 * 1024;

export class CodingTransportRequestError extends Error {
  readonly code: "unknown_command" | "invalid_request";

  constructor(code: "unknown_command" | "invalid_request", message: string) {
    super(message);
    this.name = "CodingTransportRequestError";
    this.code = code;
  }
}

export interface ParsedCodingCommandRequest<
  C extends CodingCommand = CodingCommand,
> {
  readonly requestId: string;
  readonly command: C;
  readonly input: CodingCommandInputMap[C];
}

export function parseCodingCommandRequest(
  value: unknown,
): ParsedCodingCommandRequest {
  if (
    !exactObject(value, ["protocol", "kind", "requestId", "command"], ["input"])
  ) {
    invalid("Coding command envelope is invalid");
  }
  if (
    value.protocol !== CODING_TRANSPORT_PROTOCOL ||
    value.kind !== "command"
  ) {
    invalid("Coding command protocol is invalid");
  }
  if (!boundedString(value.requestId, 256)) {
    invalid("Coding command requestId is invalid");
  }
  if (typeof value.command !== "string" || !COMMANDS.has(value.command)) {
    throw new CodingTransportRequestError(
      "unknown_command",
      "Coding command is unknown",
    );
  }
  const command = value.command as CodingCommand;
  return {
    requestId: value.requestId,
    command,
    input: parseInput(command, value.input) as never,
  };
}

export function isCodingCommandRequest(
  value: unknown,
): value is CodingCommandRequest {
  try {
    parseCodingCommandRequest(value);
    return true;
  } catch {
    return false;
  }
}

function parseInput<C extends CodingCommand>(
  command: C,
  value: unknown,
): CodingCommandInputMap[C] {
  switch (command) {
    case "project.list":
      noInput(value, command);
      return undefined as CodingCommandInputMap[C];
    case "project.read":
    case "project.close":
      project(value, command);
      break;
    case "session.list":
      pagedProject(value, command);
      break;
    case "session.read":
      session(value, command);
      break;
    case "transcript.read":
    case "turn.list":
      pagedSession(value, command);
      break;
    case "turn.start":
      startTurn(value);
      break;
    case "turn.read":
    case "turn.live.read":
      turn(value, command);
      break;
    case "turn.cancel":
      turnWithReason(value, command);
      break;
    case "turn.approval.resolve":
      approval(value);
      break;
    case "turn.recovery.resolve":
      recovery(value);
      break;
    case "proposal.read":
    case "proposal.apply":
      proposal(value, command);
      break;
    case "proposal.decide":
      proposalDecision(value);
      break;
    case "proposal.apply.request":
      proposalAction(value, command);
      break;
    case "proposal.undo":
      proposalUndo(value);
      break;
    case "event.read":
      events(value);
      break;
  }
  return value as CodingCommandInputMap[C];
}

function noInput(value: unknown, command: string): void {
  if (value !== undefined) invalid(`${command} does not accept input`);
}

function project(
  value: unknown,
  command: string,
): asserts value is { projectId: string } {
  if (!exactObject(value, ["projectId"]) || !id(value.projectId)) {
    invalid(`${command} input is invalid`);
  }
}

function pagedProject(value: unknown, command: string): void {
  if (
    !exactObject(value, ["projectId"], ["cursor", "limit"]) ||
    !id(value.projectId) ||
    !optional(value.cursor, cursor) ||
    !optional(value.limit, pageLimit)
  ) {
    invalid(`${command} input is invalid`);
  }
}

function session(value: unknown, command: string): void {
  if (
    !exactObject(value, ["projectId", "sessionId"]) ||
    !id(value.projectId) ||
    !id(value.sessionId)
  ) {
    invalid(`${command} input is invalid`);
  }
}

function pagedSession(value: unknown, command: string): void {
  if (
    !exactObject(value, ["projectId", "sessionId"], ["cursor", "limit"]) ||
    !id(value.projectId) ||
    !id(value.sessionId) ||
    !optional(value.cursor, cursor) ||
    !optional(value.limit, pageLimit)
  ) {
    invalid(`${command} input is invalid`);
  }
}

function startTurn(value: unknown): void {
  if (
    !exactObject(
      value,
      ["projectId", "idempotencyKey", "content"],
      [
        "sessionId",
        "title",
        "proposalTitle",
        "agentId",
        "modelEndpointId",
        "maxSteps",
        "maxOutputTokens",
      ],
    ) ||
    !id(value.projectId) ||
    !id(value.idempotencyKey) ||
    !userContent(value.content) ||
    !optional(value.sessionId, id) ||
    !optional(value.title, title) ||
    !optional(value.proposalTitle, title) ||
    !optional(value.agentId, id) ||
    !optional(value.modelEndpointId, id) ||
    !optional(value.maxSteps, positiveInteger) ||
    !optional(value.maxOutputTokens, positiveInteger)
  ) {
    invalid("turn.start input is invalid");
  }
}

function turn(value: unknown, command: string): void {
  if (
    !exactObject(value, ["projectId", "turnId"]) ||
    !id(value.projectId) ||
    !id(value.turnId)
  ) {
    invalid(`${command} input is invalid`);
  }
}

function turnWithReason(value: unknown, command: string): void {
  if (
    !exactObject(value, ["projectId", "turnId", "reason"]) ||
    !id(value.projectId) ||
    !id(value.turnId) ||
    !reason(value.reason)
  ) {
    invalid(`${command} input is invalid`);
  }
}

function approval(value: unknown): void {
  if (
    !exactObject(value, [
      "projectId",
      "turnId",
      "executionId",
      "expectedApprovalRevision",
      "decision",
      "reason",
      "requestId",
    ]) ||
    !id(value.projectId) ||
    !id(value.turnId) ||
    !id(value.executionId) ||
    !nonNegativeInteger(value.expectedApprovalRevision) ||
    !literal(value.decision, ["approve_once", "deny"] as const) ||
    !reason(value.reason) ||
    !id(value.requestId)
  ) {
    invalid("turn.approval.resolve input is invalid");
  }
}

function recovery(value: unknown): void {
  if (
    !exactObject(
      value,
      [
        "projectId",
        "turnId",
        "executionId",
        "expectedRecoveryRevision",
        "decision",
        "reason",
        "requestId",
      ],
      ["content", "contentDigest", "error"],
    ) ||
    !id(value.projectId) ||
    !id(value.turnId) ||
    !id(value.executionId) ||
    !positiveInteger(value.expectedRecoveryRevision) ||
    !literal(value.decision, [
      "confirm_succeeded",
      "confirm_failed",
      "retry",
      "abandon_turn",
    ] as const) ||
    !reason(value.reason) ||
    !id(value.requestId) ||
    !optional(value.content, toolResultContent) ||
    !optional(value.contentDigest, digest) ||
    !optional(value.error, jsonValue)
  ) {
    invalid("turn.recovery.resolve input is invalid");
  }
  const hasContent = value.content !== undefined;
  const hasDigest = value.contentDigest !== undefined;
  if (value.decision === "confirm_succeeded" || value.decision === "confirm_failed") {
    if (!hasContent || !hasDigest) {
      invalid("confirmed recovery decisions require content and contentDigest");
    }
  } else if (hasContent || hasDigest || value.error !== undefined) {
    invalid("retry and abandon recovery decisions cannot include result data");
  }
}

function proposal(value: unknown, command: string): void {
  if (
    !exactObject(value, ["projectId", "proposalId"]) ||
    !id(value.projectId) ||
    !id(value.proposalId)
  ) {
    invalid(`${command} input is invalid`);
  }
}

function proposalDecision(value: unknown): void {
  if (
    !exactObject(value, [
      "projectId",
      "proposalId",
      "decision",
      "reason",
      "requestId",
    ]) ||
    !id(value.projectId) ||
    !id(value.proposalId) ||
    !literal(value.decision, ["approve", "reject", "withdraw"] as const) ||
    !reason(value.reason) ||
    !id(value.requestId)
  ) {
    invalid("proposal.decide input is invalid");
  }
}

function proposalAction(value: unknown, command: string): void {
  if (
    !exactObject(value, ["projectId", "proposalId", "reason", "requestId"]) ||
    !id(value.projectId) ||
    !id(value.proposalId) ||
    !reason(value.reason) ||
    !id(value.requestId)
  ) {
    invalid(`${command} input is invalid`);
  }
}

function proposalUndo(value: unknown): void {
  if (
    !exactObject(value, ["projectId", "proposalId", "requestId"]) ||
    !id(value.projectId) ||
    !id(value.proposalId) ||
    !id(value.requestId)
  ) {
    invalid("proposal.undo input is invalid");
  }
}

function events(value: unknown): void {
  if (value === undefined) return;
  if (
    !exactObject(value, [], ["streamId", "afterSequence", "limit"]) ||
    !optional(value.streamId, id) ||
    !optional(value.afterSequence, nonNegativeInteger) ||
    !optional(value.limit, pageLimit)
  ) {
    invalid("event.read input is invalid");
  }
}

function userContent(value: unknown): value is readonly UserMessageInputPart[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64)
    return false;
  let totalTextBytes = 0;
  return value.every((part) => {
    if (!isRecord(part)) return false;
    if (part.type === "text") {
      if (
        !exactObject(part, ["type", "text"]) ||
        !boundedString(part.text, MAX_USER_TEXT_BYTES)
      )
        return false;
      totalTextBytes += new TextEncoder().encode(part.text).byteLength;
      return totalTextBytes <= MAX_USER_TEXT_BYTES;
    }
    return (
      part.type === "resource" &&
      exactObject(part, ["type", "resourceId"]) &&
      id(part.resourceId)
    );
  });
}

function id(value: unknown): value is string {
  return boundedString(value, MAX_ID_BYTES);
}

function cursor(value: unknown): value is string {
  return boundedString(value, MAX_CURSOR_BYTES);
}

function reason(value: unknown): value is string {
  return boundedString(value, MAX_REASON_BYTES);
}

function title(value: unknown): value is string {
  return boundedString(value, MAX_TITLE_BYTES);
}

function pageLimit(value: unknown): value is number {
  return positiveInteger(value, 100);
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function toolResultContent(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) return false;
  let inlineBytes = 0;
  return value.every((part) => {
    if (!isRecord(part)) return false;
    if (part.type === "text") {
      if (!exactObject(part, ["type", "text"]) || !boundedString(part.text, 262_144)) {
        return false;
      }
      inlineBytes += new TextEncoder().encode(part.text).byteLength;
      return inlineBytes <= 1_048_576;
    }
    if (part.type === "json") {
      if (!exactObject(part, ["type", "value"]) || !jsonValue(part.value)) return false;
      inlineBytes += new TextEncoder().encode(JSON.stringify(part.value)).byteLength;
      return inlineBytes <= 1_048_576;
    }
    return (
      part.type === "resource" &&
      exactObject(part, ["type", "resourceId", "sha256", "sizeBytes"], ["mediaType"]) &&
      id(part.resourceId) &&
      digest(part.sha256) &&
      positiveInteger(part.sizeBytes) &&
      optional(part.mediaType, (candidate) => boundedString(candidate, 512))
    );
  });
}

function jsonValue(value: unknown): value is import("@wanex/protocol").JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(jsonValue);
}

function invalid(message: string): never {
  throw new CodingTransportRequestError("invalid_request", message);
}
