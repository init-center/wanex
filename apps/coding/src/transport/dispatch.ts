import { CodingApplicationError } from "../application/errors.js";
import type { CodingApplication } from "../application/model.js";
import type {
  CodingCommand,
  CodingCommandResponse,
  CodingEventEnvelope,
  CodingTransportError,
} from "./model.js";
import { CODING_TRANSPORT_PROTOCOL } from "./model.js";
import {
  CodingTransportRequestError,
  parseCodingCommandRequest,
} from "./validation/input.js";

export async function dispatchCodingCommand(
  application: CodingApplication,
  value: unknown,
): Promise<CodingCommandResponse> {
  let requestId = safeEnvelopeString(value, "requestId") ?? "invalid";
  let command = safeEnvelopeString(value, "command");
  try {
    const request = parseCodingCommandRequest(value);
    requestId = request.requestId;
    command = request.command;
    return {
      protocol: CODING_TRANSPORT_PROTOCOL,
      kind: "response",
      requestId,
      command: command as CodingCommand,
      ok: true,
      value: await run(application, request.command, request.input),
    } as CodingCommandResponse;
  } catch (error) {
    return {
      protocol: CODING_TRANSPORT_PROTOCOL,
      kind: "response",
      requestId,
      command: command ?? "unknown",
      ok: false,
      error: normalizeError(error),
    };
  }
}

export function codingEventEnvelope(
  event: Parameters<CodingApplication["subscribe"]>[0] extends (
    event: infer E,
  ) => void
    ? E
    : never,
): CodingEventEnvelope {
  return {
    protocol: CODING_TRANSPORT_PROTOCOL,
    kind: "event",
    event,
  };
}

async function run(
  application: CodingApplication,
  command: CodingCommand,
  input: unknown,
): Promise<unknown> {
  switch (command) {
    case "project.list":
      return await application.listProjects();
    case "project.read":
      return await application.readProject(input as never);
    case "project.close":
      await application.closeProject(input as never);
      return null;
    case "session.list":
      return await application.listSessions(input as never);
    case "session.read":
      return await application.readSession(input as never);
    case "transcript.read":
      return await application.readTranscript(input as never);
    case "turn.list":
      return await application.listTurns(input as never);
    case "turn.start":
      return await application.startTurn(input as never);
    case "turn.read":
      return await application.readTurn(input as never);
    case "turn.live.read":
      return await application.readLiveTurn(input as never);
    case "turn.cancel":
      return await application.cancelTurn(input as never);
    case "turn.approval.resolve":
      return await application.resolveTurnApproval(input as never);
    case "turn.recovery.resolve":
      return await application.resolveTurnRecovery(input as never);
    case "proposal.read":
      return await application.readProposal(input as never);
    case "proposal.decide":
      return await application.decideProposal(input as never);
    case "proposal.apply.request":
      return await application.requestProposalApply(input as never);
    case "proposal.apply":
      return await application.applyProposal(input as never);
    case "proposal.undo":
      return await application.undoProposal(input as never);
    case "event.read":
      return await application.readEvents(input as never);
  }
}

function normalizeError(error: unknown): CodingTransportError {
  if (error instanceof CodingTransportRequestError) {
    return { code: error.code, category: "validation", message: error.message };
  }
  if (error instanceof CodingApplicationError) {
    return {
      code: error.code,
      category:
        error.code === "application_closed"
          ? "lifecycle"
          : error.code === "invalid_request"
            ? "validation"
            : "availability",
      message: error.message,
    };
  }
  return {
    code: "command_failed",
    category: "runtime",
    message: "Coding command failed",
  };
}

function safeEnvelopeString(value: unknown, key: string): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const selected = (value as Record<string, unknown>)[key];
  return typeof selected === "string" && selected.length <= 512
    ? selected
    : undefined;
}
