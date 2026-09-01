import type { CodingApplication } from "../../application/model.js";
import {
  CODING_COMMANDS,
  CODING_TRANSPORT_PROTOCOL,
  type CodingCommand,
  type CodingCommandRequest,
} from "../../transport/model.js";
import { dispatchCodingCommand } from "../../transport/dispatch.js";
import {
  createInProcessAgentHostEndpoint,
  type InProcessAgentHostEndpoint,
} from "@wanex/runtime/host";
import type {
  AgentHostCapabilitySnapshot,
  AgentHostError,
  AgentHostOperationRequest,
  AgentHostOperationResult,
  JsonValue,
} from "@wanex/protocol";
import {
  CODING_AGENT_HOST_OPERATIONS,
  type CodingAgentHostEndpointOptions,
} from "./model.js";
import {
  createCodingAgentHostReplayResult,
  subscribeCodingAgentHostEvents,
} from "./events.js";

const READ_COMMANDS = new Set<string>([
  CODING_COMMANDS.listProjects,
  CODING_COMMANDS.readProject,
  CODING_COMMANDS.listSessions,
  CODING_COMMANDS.readSession,
  CODING_COMMANDS.readTranscript,
  CODING_COMMANDS.listTurns,
  CODING_COMMANDS.readTurn,
  CODING_COMMANDS.readLiveTurn,
  CODING_COMMANDS.readProposal,
  CODING_COMMANDS.readEvents,
]);

const COMMANDS = new Map<string, CodingCommand>([
  [CODING_AGENT_HOST_OPERATIONS.turnStart, CODING_COMMANDS.startTurn],
  [CODING_AGENT_HOST_OPERATIONS.turnCancel, CODING_COMMANDS.cancelTurn],
  [
    CODING_AGENT_HOST_OPERATIONS.turnApprovalResolve,
    CODING_COMMANDS.resolveTurnApproval,
  ],
  [
    CODING_AGENT_HOST_OPERATIONS.turnRecoveryResolve,
    CODING_COMMANDS.resolveTurnRecovery,
  ],
  [CODING_AGENT_HOST_OPERATIONS.proposalDecide, CODING_COMMANDS.decideProposal],
  [
    CODING_AGENT_HOST_OPERATIONS.proposalApplyRequest,
    CODING_COMMANDS.requestProposalApply,
  ],
  [CODING_AGENT_HOST_OPERATIONS.proposalApply, CODING_COMMANDS.applyProposal],
  [CODING_AGENT_HOST_OPERATIONS.proposalUndo, CODING_COMMANDS.undoProposal],
]);

const CAPABILITIES: AgentHostCapabilitySnapshot = {
  revision: 1,
  domains: ["coding"],
  features: [
    "canonical_reads",
    "ordered_events",
    "event_replay",
    "idempotent_commands",
    "cancellation",
    "approval",
    "recovery",
  ],
  maxFrameBytes: 16 * 1024 * 1024,
  maxEventPageSize: 100,
  eventReplay: "bounded",
};

export function createCodingAgentHostEndpoint(
  options: CodingAgentHostEndpointOptions,
): InProcessAgentHostEndpoint {
  return createInProcessAgentHostEndpoint({
    host: options.host,
    capabilities: CAPABILITIES,
    accessToken: options.accessToken,
    handleOperation: async (request) =>
      await handleOperation(options.application, request),
    replayEvents: (request) =>
      createCodingAgentHostReplayResult(options.application, request),
    subscribeEvents: (listener) =>
      subscribeCodingAgentHostEvents(options.application, listener),
  });
}

async function handleOperation(
  application: CodingApplication,
  request: AgentHostOperationRequest,
): Promise<AgentHostOperationResult> {
  if (request.domain !== "coding") {
    return failed("unauthorized", "Coding Agent Host domain is required", false);
  }
  if (request.operationKind === "read") {
    return await runCodingCommand(
      application,
      request.requestId,
      request.payload,
      true,
    );
  }
  const command = COMMANDS.get(request.operation);
  if (command === undefined) {
    return failed("not_found", "Coding Agent Host operation is unavailable", false);
  }
  return await runCodingCommand(
    application,
    request.idempotencyKey,
    request.payload,
    false,
    command,
  );
}

async function runCodingCommand(
  application: CodingApplication,
  requestId: string,
  payload: JsonValue,
  read: boolean,
  command?: CodingCommand,
): Promise<AgentHostOperationResult> {
  const parsed = commandPayload(payload, read);
  if (parsed === undefined) {
    return failed(
      "malformed_request",
      "Coding Agent Host operation payload is invalid",
      false,
    );
  }
  const selectedCommand = read ? (parsed.command as CodingCommand) : command;
  if (selectedCommand === undefined) {
    return failed("not_found", "Coding Agent Host operation is unavailable", false);
  }
  if (read && !READ_COMMANDS.has(selectedCommand)) {
    return failed("unauthorized", "Coding read command is not exposed", false);
  }
  const input = read
    ? parsed.input
    : commandInput(selectedCommand, parsed.input, requestId);
  if (!read && input === undefined) {
    return failed(
      "malformed_request",
      "Coding Agent Host operation payload is invalid",
      false,
    );
  }
  const response = await dispatchCodingCommand(application, {
    protocol: CODING_TRANSPORT_PROTOCOL,
    kind: "command",
    requestId,
    command: selectedCommand,
    ...(read
      ? parsed.input === undefined
        ? {}
        : { input: parsed.input }
      : { input })
  } as CodingCommandRequest);
  if (!response.ok) return failedFromCodingError(response.error);
  return { outcome: "completed", result: jsonValue(response.value) };
}

function commandInput(
  command: CodingCommand,
  input: JsonValue | undefined,
  requestId: string,
): JsonValue | undefined {
  if (
    input === undefined ||
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input)
  ) {
    return input;
  }
  const record = input as Record<string, JsonValue>;
  if (Object.hasOwn(record, "requestId")) return undefined;
  if (
    command === CODING_COMMANDS.cancelTurn ||
    command === CODING_COMMANDS.applyProposal
  ) {
    if (
      command === CODING_COMMANDS.applyProposal &&
      Object.hasOwn(record, "idempotencyKey")
    ) {
      return undefined;
    }
    return input;
  }
  if (command === CODING_COMMANDS.startTurn) {
    if (Object.hasOwn(record, "idempotencyKey")) return undefined;
    return { ...record, idempotencyKey: requestId };
  }
  return { ...record, requestId };
}

function commandPayload(
  payload: JsonValue,
  read: boolean,
): { readonly command: string; readonly input?: JsonValue } | undefined {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return undefined;
  }
  const record = payload as Record<string, JsonValue>;
  if (read) {
    if (
      !hasOnlyKeys(record, ["command", "input"]) ||
      typeof record.command !== "string"
    ) {
      return undefined;
    }
    return {
      command: record.command,
      ...(record.input === undefined ? {} : { input: record.input }),
    };
  }
  if (Object.keys(record).includes("requestId")) return undefined;
  return { command: "", input: record };
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function failedFromCodingError(error: {
  readonly code: string;
  readonly message: string;
}): AgentHostOperationResult {
  const code: AgentHostError["code"] =
    error.code === "unknown_command" || error.code === "invalid_request"
      ? "malformed_request"
      : error.code === "project_unavailable" ||
          error.code === "turn_unavailable" ||
          error.code === "proposal_unavailable"
        ? "not_found"
        : "application_failure";
  return failed(code, error.message, error.code === "transport_failed");
}

function failed(
  code: AgentHostError["code"],
  message: string,
  retryable: boolean,
): AgentHostOperationResult {
  return {
    outcome: "failed",
    error: { code, message: boundedMessage(message), retryable },
  };
}

function boundedMessage(message: string): string {
  const normalized = message.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized.slice(0, 512) || "Coding operation failed";
}

function jsonValue(value: unknown): JsonValue {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? null : (JSON.parse(encoded) as JsonValue);
}
