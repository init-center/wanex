import {
  AgentHostClientError,
  createAgentHostClient,
  type AgentHostClientTransport,
  type AgentHostEvent,
  type AgentHostEventPage,
  type AgentHostEventReplayResponse,
  type AgentHostHandshakeResponse,
  type AgentHostOperationResponse,
  type JsonValue,
} from "@wanex/protocol";
import type {
  CancelCodingTurnRequest,
  CodingApplicationEvent,
  CodingApplicationEventPage,
  CodingLiveTurnReadModel,
  CodingProjectReadModel,
  CodingProposalActionResult,
  CodingProposalApplyResult,
  CodingProposalDecisionRequest,
  CodingProposalReadModel,
  CodingProposalUndoResult,
  CodingSessionPage,
  CodingSessionReadModel,
  CodingTranscriptPage,
  CodingTurnPage,
  CodingTurnReadModel,
  ListCodingEventsRequest,
  ListCodingSessionsRequest,
  ListCodingTurnsRequest,
  ReadCodingProjectRequest,
  ReadCodingProposalRequest,
  ReadCodingSessionRequest,
  ReadCodingTranscriptRequest,
  ReadCodingTurnRequest,
  RequestCodingProposalApplyRequest,
  ApplyCodingProposalRequest,
  ResolveCodingTurnApprovalRequest,
  ResolveCodingTurnRecoveryRequest,
  StartCodingTurnCommand,
  UndoCodingProposalRequest,
} from "../../application/model.js";
import {
  CODING_COMMANDS,
  type CodingCommand,
  type CodingCommandInputMap,
  type CodingCommandResultMap,
} from "../../transport/model.js";
import { isCodingCommandValue } from "../../transport/validation/output.js";
import { isCodingEvent, isCodingEventPage } from "../../transport/validation/output-events.js";
import { isCodingProjectList, isCodingProject, isCodingSessionPage, isCodingSession } from "../../transport/validation/output-project.js";
import { isCodingTranscript } from "../../transport/validation/output-transcript.js";
import { isCodingTurn, isCodingTurnPage, isCodingLiveTurn } from "../../transport/validation/output-turn.js";
import {
  isCodingProposal,
  isCodingProposalAction,
  isCodingProposalApply,
  isCodingProposalUndo,
} from "../../transport/validation/output-proposal.js";
import {
  CODING_AGENT_HOST_OPERATIONS,
  type CodingAgentHostOperation,
} from "./model.js";

export interface CodingAgentHostClientOptions {
  readonly clientId: string;
  readonly accessToken: string;
  readonly createRequestId?: () => string;
}

export type CodingAgentHostEvent = Omit<
  AgentHostEvent,
  "domain" | "payload"
> & {
  readonly domain: "coding";
  readonly payload: CodingApplicationEvent;
};

export type CodingAgentHostEventListener = (
  event: CodingAgentHostEvent,
) => void;

export interface CodingAgentHostReplayRequest {
  readonly streamId: string;
  readonly afterSequence: number;
  readonly limit: number;
}

export type CodingAgentHostReplayResult =
  | {
      readonly outcome: "replayed";
      readonly page: Omit<AgentHostEventPage, "events"> & {
        readonly events: readonly CodingAgentHostEvent[];
      };
    }
  | {
      readonly outcome: "gap";
      readonly gap: NonNullable<AgentHostEventReplayResponse["gap"]>;
    };

export type CodingCancelTurnRequest = CancelCodingTurnRequest & {
  readonly idempotencyKey: string;
};

export type CodingStartTurnRequest = StartCodingTurnCommand;

export type CodingResolveTurnApprovalRequest = Omit<
  ResolveCodingTurnApprovalRequest,
  "requestId"
> & {
  readonly idempotencyKey: string;
};

export type CodingResolveTurnRecoveryRequest = Omit<
  ResolveCodingTurnRecoveryRequest,
  "requestId"
> & {
  readonly idempotencyKey: string;
};

export type CodingProposalDecisionInput = Omit<
  CodingProposalDecisionRequest,
  "requestId"
> & {
  readonly idempotencyKey: string;
};

export type CodingProposalApplyRequest = Omit<
  RequestCodingProposalApplyRequest,
  "requestId"
> & {
  readonly idempotencyKey: string;
};

export type CodingProposalApplyInput = ApplyCodingProposalRequest & {
  readonly idempotencyKey: string;
};

export type CodingProposalUndoInput = Omit<
  UndoCodingProposalRequest,
  "requestId"
> & {
  readonly idempotencyKey: string;
};

export interface CodingAgentHostClient {
  connect(): Promise<AgentHostHandshakeResponse>;
  listProjects(): Promise<readonly CodingProjectReadModel[]>;
  readProject(request: ReadCodingProjectRequest): Promise<CodingProjectReadModel | null>;
  listSessions(request: ListCodingSessionsRequest): Promise<CodingSessionPage>;
  readSession(request: ReadCodingSessionRequest): Promise<CodingSessionReadModel | null>;
  readTranscript(request: ReadCodingTranscriptRequest): Promise<CodingTranscriptPage | null>;
  listTurns(request: ListCodingTurnsRequest): Promise<CodingTurnPage>;
  readTurn(request: ReadCodingTurnRequest): Promise<CodingTurnReadModel | null>;
  readLiveTurn(request: ReadCodingTurnRequest): Promise<CodingLiveTurnReadModel | null>;
  readProposal(request: ReadCodingProposalRequest): Promise<CodingProposalReadModel | null>;
  readEvents(request?: ListCodingEventsRequest): Promise<CodingApplicationEventPage>;
  startTurn(request: CodingStartTurnRequest): Promise<CodingTurnReadModel>;
  cancelTurn(request: CodingCancelTurnRequest): Promise<CodingTurnReadModel>;
  resolveTurnApproval(request: CodingResolveTurnApprovalRequest): Promise<CodingTurnReadModel>;
  resolveTurnRecovery(request: CodingResolveTurnRecoveryRequest): Promise<CodingTurnReadModel>;
  decideProposal(request: CodingProposalDecisionInput): Promise<CodingProposalActionResult>;
  requestProposalApply(request: CodingProposalApplyRequest): Promise<CodingProposalActionResult>;
  applyProposal(request: CodingProposalApplyInput): Promise<CodingProposalApplyResult>;
  undoProposal(request: CodingProposalUndoInput): Promise<CodingProposalUndoResult>;
  subscribe(listener: CodingAgentHostEventListener): () => void;
  replay(request: CodingAgentHostReplayRequest): Promise<CodingAgentHostReplayResult>;
  close(): void;
}

export function createCodingAgentHostClient(
  transport: AgentHostClientTransport,
  options: CodingAgentHostClientOptions,
): CodingAgentHostClient {
  const protocolClient = createAgentHostClient(
    transport,
    options.createRequestId,
  );
  const subscriptions = new Set<() => void>();
  let connection: AgentHostHandshakeResponse | undefined;
  let closed = false;

  const client: CodingAgentHostClient = {
    async connect() {
      assertOpen();
      if (connection !== undefined) return connection;
      const response = await protocolClient.handshake({
        protocolVersion: 1,
        clientId: options.clientId,
        accessToken: options.accessToken,
        requestedDomains: ["coding"],
      });
      if (
        !response.capabilities.domains.includes("coding") ||
        !response.capabilities.features.includes("canonical_reads") ||
        !response.capabilities.features.includes("event_replay")
      ) {
        throw new AgentHostClientError(
          "unauthorized",
          "Coding Host does not advertise the required capabilities",
        );
      }
      connection = response;
      return response;
    },
    listProjects: async () =>
      await read(CODING_COMMANDS.listProjects, undefined, isCodingProjectList),
    readProject: async (request) =>
      await read(CODING_COMMANDS.readProject, request, (value) =>
        value === null || isCodingProject(value),
      ),
    listSessions: async (request) =>
      await read(CODING_COMMANDS.listSessions, request, isCodingSessionPage),
    readSession: async (request) =>
      await read(CODING_COMMANDS.readSession, request, (value) =>
        value === null || isCodingSession(value),
      ),
    readTranscript: async (request) =>
      await read(CODING_COMMANDS.readTranscript, request, (value) =>
        value === null || isCodingTranscript(value),
      ),
    listTurns: async (request) =>
      await read(CODING_COMMANDS.listTurns, request, isCodingTurnPage),
    readTurn: async (request) =>
      await read(CODING_COMMANDS.readTurn, request, (value) =>
        value === null || isCodingTurn(value),
      ),
    readLiveTurn: async (request) =>
      await read(CODING_COMMANDS.readLiveTurn, request, (value) =>
        value === null || isCodingLiveTurn(value),
      ),
    readProposal: async (request) =>
      await read(CODING_COMMANDS.readProposal, request, (value) =>
        value === null || isCodingProposal(value),
      ),
    readEvents: async (request) =>
      await read(CODING_COMMANDS.readEvents, request, isCodingEventPage),
    startTurn: async (request) =>
      await command(
        CODING_AGENT_HOST_OPERATIONS.turnStart,
        request.idempotencyKey,
        withoutKey(request),
        isCodingTurn,
      ),
    cancelTurn: async (request) =>
      await command(
        CODING_AGENT_HOST_OPERATIONS.turnCancel,
        request.idempotencyKey,
        withoutKey(request),
        isCodingTurn,
      ),
    resolveTurnApproval: async (request) =>
      await command(
        CODING_AGENT_HOST_OPERATIONS.turnApprovalResolve,
        request.idempotencyKey,
        withoutKey(request),
        isCodingTurn,
      ),
    resolveTurnRecovery: async (request) =>
      await command(
        CODING_AGENT_HOST_OPERATIONS.turnRecoveryResolve,
        request.idempotencyKey,
        withoutKey(request),
        isCodingTurn,
      ),
    decideProposal: async (request) =>
      await command(
        CODING_AGENT_HOST_OPERATIONS.proposalDecide,
        request.idempotencyKey,
        withoutKey(request),
        isCodingProposalAction,
      ),
    requestProposalApply: async (request) =>
      await command(
        CODING_AGENT_HOST_OPERATIONS.proposalApplyRequest,
        request.idempotencyKey,
        withoutKey(request),
        isCodingProposalAction,
      ),
    applyProposal: async (request) =>
      await command(
        CODING_AGENT_HOST_OPERATIONS.proposalApply,
        request.idempotencyKey,
        withoutKey(request),
        isCodingProposalApply,
      ),
    undoProposal: async (request) =>
      await command(
        CODING_AGENT_HOST_OPERATIONS.proposalUndo,
        request.idempotencyKey,
        withoutKey(request),
        isCodingProposalUndo,
      ),
    subscribe(listener) {
      assertOpen();
      const unsubscribe = protocolClient.subscribe((event) => {
        const projected = projectEvent(event);
        if (projected === undefined) return;
        try {
          listener(projected);
        } catch {
          // One domain subscriber cannot affect another subscriber.
        }
      });
      subscriptions.add(unsubscribe);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        subscriptions.delete(unsubscribe);
        unsubscribe();
      };
    },
    async replay(request) {
      assertOpen();
      const response = await protocolClient.replay(request);
      if (response.outcome === "gap") {
        if (response.gap === undefined) {
          throw invalidResponse("Coding replay gap has no detail");
        }
        return { outcome: "gap", gap: response.gap };
      }
      if (response.page === undefined) {
        throw invalidResponse("Coding replay response has no event page");
      }
      const events = response.page.events.map(projectEvent);
      if (events.some((event): event is undefined => event === undefined)) {
        throw invalidResponse("Coding event replay contains an invalid event");
      }
      return {
        outcome: "replayed",
        page: { ...response.page, events: events as CodingAgentHostEvent[] },
      };
    },
    close() {
      if (closed) return;
      closed = true;
      for (const unsubscribe of subscriptions) unsubscribe();
      subscriptions.clear();
    },
  };

  return Object.freeze(client);

  async function read<C extends CodingCommand>(
    commandName: C,
    input: CodingCommandInputMap[C],
    guard: (value: unknown) => boolean,
  ): Promise<CodingCommandResultMap[C]> {
    const response = await operationRead({
      command: commandName,
      ...(input === undefined ? {} : { input }),
    });
    if (
      response.outcome !== "completed" ||
      response.result === undefined ||
      !guard(response.result) ||
      !isCodingCommandValue(commandName, response.result)
    ) {
      throw invalidResponse(`Coding read ${commandName} returned an invalid result`);
    }
    return response.result as CodingCommandResultMap[C];
  }

  async function operationRead(payload: Record<string, unknown>): Promise<AgentHostOperationResponse> {
    assertConnected();
    return await protocolClient.read({
      domain: "coding",
      operation: CODING_AGENT_HOST_OPERATIONS.read,
      payload: payload as JsonValue,
    });
  }

  async function command<T>(
    operation: CodingAgentHostOperation,
    idempotencyKey: string,
    payload: Record<string, unknown>,
    guard: (value: unknown) => value is T,
  ): Promise<T> {
    assertConnected();
    const response = await protocolClient.command({
      domain: "coding",
      operation,
      idempotencyKey,
      payload: payload as JsonValue,
    });
    if (response.outcome === "failed") {
      if (response.error === undefined) {
        throw invalidResponse("Coding command failure has no error detail");
      }
      throw new AgentHostClientError(
        response.error.code,
        response.error.message,
        response.error,
      );
    }
    if (
      response.outcome !== "completed" ||
      response.result === undefined ||
      !guard(response.result)
    ) {
      throw invalidResponse("Coding command returned an invalid result");
    }
    return response.result;
  }

  function assertConnected(): void {
    assertOpen();
    if (connection === undefined) {
      throw new AgentHostClientError(
        "unauthenticated",
        "Coding Host client is not connected",
      );
    }
  }

  function assertOpen(): void {
    if (closed) {
      throw new AgentHostClientError(
        "transport_failure",
        "Coding Host client is closed",
      );
    }
  }
}

function projectEvent(event: AgentHostEvent): CodingAgentHostEvent | undefined {
  return event.domain === "coding" && isCodingEvent(event.payload)
    ? (event as unknown as CodingAgentHostEvent)
    : undefined;
}

function withoutKey<T extends { readonly idempotencyKey: string }>(
  value: T,
): Record<string, unknown> {
  const { idempotencyKey: _idempotencyKey, ...payload } = value;
  return payload;
}

function invalidResponse(message: string): AgentHostClientError {
  return new AgentHostClientError("invalid_response", message);
}
