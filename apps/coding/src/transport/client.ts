import type {
  CodingApplicationEvent,
  CodingApplicationEventPage,
  CodingProjectReadModel,
  CodingProposalActionResult,
  CodingProposalApplyResult,
  CodingProposalReadModel,
  CodingProposalUndoResult,
  CodingSessionPage,
  CodingSessionReadModel,
  CodingTranscriptPage,
  CodingTurnPage,
  CodingTurnReadModel,
  CodingLiveTurnReadModel,
  ListCodingEventsRequest,
  ListCodingSessionsRequest,
  ListCodingTurnsRequest,
  ReadCodingProjectRequest,
  ReadCodingProposalRequest,
  ReadCodingSessionRequest,
  ReadCodingTranscriptRequest,
  ReadCodingTurnRequest,
  CancelCodingTurnRequest,
  ResolveCodingTurnApprovalRequest,
  ResolveCodingTurnRecoveryRequest,
  StartCodingTurnCommand,
  CodingProposalDecisionRequest,
  RequestCodingProposalApplyRequest,
  ApplyCodingProposalRequest,
  UndoCodingProposalRequest,
  CloseCodingProjectRequest,
} from "../application/model.js";
import type {
  CodingClientTransport,
  CodingCommand,
  CodingCommandInputMap,
  CodingCommandResultMap,
  CodingEventUnsubscribe,
  CodingTransportError,
} from "./model.js";
import { CODING_COMMANDS, CODING_TRANSPORT_PROTOCOL } from "./model.js";
import {
  isCodingCommandResponse,
  isCodingEventEnvelope,
} from "./validation/output.js";

export class CodingClientError extends Error {
  readonly detail: CodingTransportError;

  constructor(detail: CodingTransportError) {
    super(detail.message);
    this.name = "CodingClientError";
    this.detail = detail;
  }
}

export interface CodingClient {
  listProjects(): Promise<readonly CodingProjectReadModel[]>;
  readProject(
    request: ReadCodingProjectRequest,
  ): Promise<CodingProjectReadModel | null>;
  closeProject(request: CloseCodingProjectRequest): Promise<null>;
  listSessions(request: ListCodingSessionsRequest): Promise<CodingSessionPage>;
  readSession(
    request: ReadCodingSessionRequest,
  ): Promise<CodingSessionReadModel | null>;
  readTranscript(
    request: ReadCodingTranscriptRequest,
  ): Promise<CodingTranscriptPage | null>;
  listTurns(request: ListCodingTurnsRequest): Promise<CodingTurnPage>;
  startTurn(request: StartCodingTurnCommand): Promise<CodingTurnReadModel>;
  readTurn(request: ReadCodingTurnRequest): Promise<CodingTurnReadModel | null>;
  readLiveTurn(
    request: ReadCodingTurnRequest,
  ): Promise<CodingLiveTurnReadModel | null>;
  cancelTurn(request: CancelCodingTurnRequest): Promise<CodingTurnReadModel>;
  resolveTurnApproval(
    request: ResolveCodingTurnApprovalRequest,
  ): Promise<CodingTurnReadModel>;
  resolveTurnRecovery(
    request: ResolveCodingTurnRecoveryRequest,
  ): Promise<CodingTurnReadModel>;
  readProposal(
    request: ReadCodingProposalRequest,
  ): Promise<CodingProposalReadModel | null>;
  decideProposal(
    request: CodingProposalDecisionRequest,
  ): Promise<CodingProposalActionResult>;
  requestProposalApply(
    request: RequestCodingProposalApplyRequest,
  ): Promise<CodingProposalActionResult>;
  applyProposal(
    request: ApplyCodingProposalRequest,
  ): Promise<CodingProposalApplyResult>;
  undoProposal(
    request: UndoCodingProposalRequest,
  ): Promise<CodingProposalUndoResult>;
  readEvents(
    request?: ListCodingEventsRequest,
  ): Promise<CodingApplicationEventPage>;
  subscribe(
    listener: (event: CodingApplicationEvent) => void,
  ): CodingEventUnsubscribe;
}

export function createCodingClient(
  transport: CodingClientTransport,
  createRequestId: () => string = defaultRequestId,
): CodingClient {
  const send = async <C extends CodingCommand>(
    command: C,
    input: CodingCommandInputMap[C],
  ): Promise<CodingCommandResultMap[C]> => {
    const requestId = createRequestId();
    const request = {
      protocol: CODING_TRANSPORT_PROTOCOL,
      kind: "command" as const,
      requestId,
      command,
      ...(input === undefined ? {} : { input }),
    };
    let value: unknown;
    try {
      value = await transport.send(request);
    } catch {
      throw new CodingClientError({
        code: "transport_failed",
        category: "transport",
        message: "Coding transport failed",
      });
    }
    if (!isCodingCommandResponse(value, { requestId, command })) {
      throw new CodingClientError({
        code: "invalid_transport_response",
        category: "transport",
        message: "Coding transport response is invalid",
      });
    }
    if (!value.ok) throw new CodingClientError(value.error);
    return value.value;
  };
  const client: CodingClient = {
    listProjects: async () =>
      await send(CODING_COMMANDS.listProjects, undefined),
    readProject: async (input) =>
      await send(CODING_COMMANDS.readProject, input),
    closeProject: async (input) =>
      await send(CODING_COMMANDS.closeProject, input),
    listSessions: async (input) =>
      await send(CODING_COMMANDS.listSessions, input),
    readSession: async (input) =>
      await send(CODING_COMMANDS.readSession, input),
    readTranscript: async (input) =>
      await send(CODING_COMMANDS.readTranscript, input),
    listTurns: async (input) => await send(CODING_COMMANDS.listTurns, input),
    startTurn: async (input) => await send(CODING_COMMANDS.startTurn, input),
    readTurn: async (input) => await send(CODING_COMMANDS.readTurn, input),
    readLiveTurn: async (input) =>
      await send(CODING_COMMANDS.readLiveTurn, input),
    cancelTurn: async (input) => await send(CODING_COMMANDS.cancelTurn, input),
    resolveTurnApproval: async (input) =>
      await send(CODING_COMMANDS.resolveTurnApproval, input),
    resolveTurnRecovery: async (input) =>
      await send(CODING_COMMANDS.resolveTurnRecovery, input),
    readProposal: async (input) =>
      await send(CODING_COMMANDS.readProposal, input),
    decideProposal: async (input) =>
      await send(CODING_COMMANDS.decideProposal, input),
    requestProposalApply: async (input) =>
      await send(CODING_COMMANDS.requestProposalApply, input),
    applyProposal: async (input) =>
      await send(CODING_COMMANDS.applyProposal, input),
    undoProposal: async (input) =>
      await send(CODING_COMMANDS.undoProposal, input),
    readEvents: async (input) => await send(CODING_COMMANDS.readEvents, input),
    subscribe(listener: (event: CodingApplicationEvent) => void) {
      try {
        return transport.subscribe((value) => {
          if (!isCodingEventEnvelope(value)) return;
          try {
            listener(value.event);
          } catch {
            // One presentation subscriber cannot affect the shared transport.
          }
        });
      } catch {
        return () => {};
      }
    },
  };
  return Object.freeze(client);
}

let requestSequence = 0;

function defaultRequestId(): string {
  requestSequence = (requestSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `coding-client-${Date.now().toString(36)}-${requestSequence.toString(36)}`;
}
