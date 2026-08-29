import type {
  ApplyCodingProposalRequest,
  CancelCodingTurnRequest,
  ResolveCodingTurnRecoveryRequest,
  CloseCodingProjectRequest,
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
  ResolveCodingTurnApprovalRequest,
  StartCodingTurnCommand,
  UndoCodingProposalRequest,
} from "../application/model.js";

export const CODING_TRANSPORT_PROTOCOL = "wanex.coding/1" as const;

export const CODING_COMMANDS = {
  listProjects: "project.list",
  readProject: "project.read",
  closeProject: "project.close",
  listSessions: "session.list",
  readSession: "session.read",
  readTranscript: "transcript.read",
  listTurns: "turn.list",
  startTurn: "turn.start",
  readTurn: "turn.read",
  readLiveTurn: "turn.live.read",
  cancelTurn: "turn.cancel",
  resolveTurnApproval: "turn.approval.resolve",
  resolveTurnRecovery: "turn.recovery.resolve",
  readProposal: "proposal.read",
  decideProposal: "proposal.decide",
  requestProposalApply: "proposal.apply.request",
  applyProposal: "proposal.apply",
  undoProposal: "proposal.undo",
  readEvents: "event.read",
} as const;

export type CodingCommand =
  (typeof CODING_COMMANDS)[keyof typeof CODING_COMMANDS];

export interface CodingCommandInputMap {
  readonly "project.list": undefined;
  readonly "project.read": ReadCodingProjectRequest;
  readonly "project.close": CloseCodingProjectRequest;
  readonly "session.list": ListCodingSessionsRequest;
  readonly "session.read": ReadCodingSessionRequest;
  readonly "transcript.read": ReadCodingTranscriptRequest;
  readonly "turn.list": ListCodingTurnsRequest;
  readonly "turn.start": StartCodingTurnCommand;
  readonly "turn.read": ReadCodingTurnRequest;
  readonly "turn.live.read": ReadCodingTurnRequest;
  readonly "turn.cancel": CancelCodingTurnRequest;
  readonly "turn.approval.resolve": ResolveCodingTurnApprovalRequest;
  readonly "turn.recovery.resolve": ResolveCodingTurnRecoveryRequest;
  readonly "proposal.read": ReadCodingProposalRequest;
  readonly "proposal.decide": CodingProposalDecisionRequest;
  readonly "proposal.apply.request": RequestCodingProposalApplyRequest;
  readonly "proposal.apply": ApplyCodingProposalRequest;
  readonly "proposal.undo": UndoCodingProposalRequest;
  readonly "event.read": ListCodingEventsRequest | undefined;
}

export interface CodingCommandResultMap {
  readonly "project.list": readonly CodingProjectReadModel[];
  readonly "project.read": CodingProjectReadModel | null;
  readonly "project.close": null;
  readonly "session.list": CodingSessionPage;
  readonly "session.read": CodingSessionReadModel | null;
  readonly "transcript.read": CodingTranscriptPage | null;
  readonly "turn.list": CodingTurnPage;
  readonly "turn.start": CodingTurnReadModel;
  readonly "turn.read": CodingTurnReadModel | null;
  readonly "turn.live.read": CodingLiveTurnReadModel | null;
  readonly "turn.cancel": CodingTurnReadModel;
  readonly "turn.approval.resolve": CodingTurnReadModel;
  readonly "turn.recovery.resolve": CodingTurnReadModel;
  readonly "proposal.read": CodingProposalReadModel | null;
  readonly "proposal.decide": CodingProposalActionResult;
  readonly "proposal.apply.request": CodingProposalActionResult;
  readonly "proposal.apply": CodingProposalApplyResult;
  readonly "proposal.undo": CodingProposalUndoResult;
  readonly "event.read": CodingApplicationEventPage;
}

export interface CodingCommandRequest<C extends CodingCommand = CodingCommand> {
  readonly protocol: typeof CODING_TRANSPORT_PROTOCOL;
  readonly kind: "command";
  readonly requestId: string;
  readonly command: C;
  readonly input?: CodingCommandInputMap[C];
}

export type CodingTransportErrorCode =
  | "unknown_command"
  | "invalid_request"
  | "application_closed"
  | "project_unavailable"
  | "turn_unavailable"
  | "command_failed"
  | "transport_failed"
  | "invalid_transport_response";

export interface CodingTransportError {
  readonly code: CodingTransportErrorCode;
  readonly category:
    | "validation"
    | "lifecycle"
    | "availability"
    | "runtime"
    | "transport";
  readonly message: string;
}

export type CodingCommandResponse<C extends CodingCommand = CodingCommand> =
  | {
      readonly protocol: typeof CODING_TRANSPORT_PROTOCOL;
      readonly kind: "response";
      readonly requestId: string;
      readonly command: C;
      readonly ok: true;
      readonly value: CodingCommandResultMap[C];
    }
  | {
      readonly protocol: typeof CODING_TRANSPORT_PROTOCOL;
      readonly kind: "response";
      readonly requestId: string;
      readonly command: string;
      readonly ok: false;
      readonly error: CodingTransportError;
    };

export interface CodingEventEnvelope {
  readonly protocol: typeof CODING_TRANSPORT_PROTOCOL;
  readonly kind: "event";
  readonly event: CodingApplicationEvent;
}

export type CodingEventUnsubscribe = () => void;

export interface CodingClientTransport {
  send(request: CodingCommandRequest): Promise<unknown>;
  subscribe(listener: (event: unknown) => void): CodingEventUnsubscribe;
}

export interface CodingMessageTransportOptions {
  readonly send: (request: CodingCommandRequest) => Promise<unknown>;
  readonly subscribe: (
    listener: (event: unknown) => void,
  ) => CodingEventUnsubscribe;
}

export interface CodingTransportEndpoint extends CodingMessageTransportOptions {}
