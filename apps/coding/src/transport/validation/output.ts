import type {
  CodingCommand,
  CodingCommandResponse,
  CodingCommandResultMap,
  CodingEventEnvelope,
  CodingTransportError,
} from "../model.js";
import { CODING_TRANSPORT_PROTOCOL } from "../model.js";
import { boundedString, exactObject, isRecord, literal } from "./common.js";
import { isCodingEvent, isCodingEventPage } from "./output-events.js";
import {
  isCodingProject,
  isCodingProjectList,
  isCodingSession,
  isCodingSessionPage,
} from "./output-project.js";
import {
  isCodingProposal,
  isCodingProposalAction,
  isCodingProposalApply,
  isCodingProposalUndo,
} from "./output-proposal.js";
import { isCodingTranscript } from "./output-transcript.js";
import { isCodingTurn, isCodingTurnPage, isCodingLiveTurn } from "./output-turn.js";

export function isCodingCommandResponse<C extends CodingCommand>(
  value: unknown,
  request: { readonly requestId: string; readonly command: C },
): value is CodingCommandResponse<C> {
  if (
    !isRecord(value) ||
    value.protocol !== CODING_TRANSPORT_PROTOCOL ||
    value.kind !== "response" ||
    value.requestId !== request.requestId ||
    value.command !== request.command ||
    typeof value.ok !== "boolean"
  )
    return false;
  if (value.ok) {
    return (
      exactObject(value, [
        "protocol",
        "kind",
        "requestId",
        "command",
        "ok",
        "value",
      ]) && isCodingCommandValue(request.command, value.value)
    );
  }
  return (
    exactObject(value, [
      "protocol",
      "kind",
      "requestId",
      "command",
      "ok",
      "error",
    ]) && isTransportError(value.error)
  );
}

export function isCodingEventEnvelope(
  value: unknown,
): value is CodingEventEnvelope {
  return (
    exactObject(value, ["protocol", "kind", "event"]) &&
    value.protocol === CODING_TRANSPORT_PROTOCOL &&
    value.kind === "event" &&
    isCodingEvent(value.event)
  );
}

export function isCodingCommandValue<C extends CodingCommand>(
  command: C,
  value: unknown,
): value is CodingCommandResultMap[C] {
  switch (command) {
    case "project.list":
      return isCodingProjectList(value);
    case "project.read":
      return value === null || isCodingProject(value);
    case "project.close":
      return value === null;
    case "session.list":
      return isCodingSessionPage(value);
    case "session.read":
      return value === null || isCodingSession(value);
    case "transcript.read":
      return value === null || isCodingTranscript(value);
    case "turn.list":
      return isCodingTurnPage(value);
    case "turn.start":
    case "turn.cancel":
    case "turn.approval.resolve":
    case "turn.recovery.resolve":
      return isCodingTurn(value);
    case "turn.read":
      return value === null || isCodingTurn(value);
    case "turn.live.read":
      return value === null || isCodingLiveTurn(value);
    case "proposal.read":
      return value === null || isCodingProposal(value);
    case "proposal.decide":
    case "proposal.apply.request":
      return isCodingProposalAction(value);
    case "proposal.apply":
      return isCodingProposalApply(value);
    case "proposal.undo":
      return isCodingProposalUndo(value);
    case "event.read":
      return isCodingEventPage(value);
  }
  return false;
}

function isTransportError(value: unknown): value is CodingTransportError {
  return (
    exactObject(value, ["code", "category", "message"]) &&
    literal(value.code, [
      "unknown_command",
      "invalid_request",
      "application_closed",
      "project_unavailable",
      "turn_unavailable",
      "command_failed",
      "transport_failed",
      "invalid_transport_response",
    ] as const) &&
    literal(value.category, [
      "validation",
      "lifecycle",
      "availability",
      "runtime",
      "transport",
    ] as const) &&
    boundedString(value.message, 2048, true)
  );
}
