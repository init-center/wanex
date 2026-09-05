import type { SurfaceAdapter } from "@wanex/assistant";
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
  ASSISTANT_AGENT_HOST_OPERATIONS,
  type AssistantAgentHostEndpointOptions,
} from "./model.js";
import {
  createAssistantAgentHostEventBridge,
  createAssistantReplayResult,
} from "./events.js";

const READ_COMMANDS = new Set([
  "status",
  "readHome",
  "readSettings",
  "listModelEndpoints",
  "readAssistantCommands",
  "readExecutionReference",
  "listSchedules",
  "readSchedule",
  "readSessionTranscript",
  "readConversationAttachments",
  "readSideQuery",
  "readPlanGeneration",
  "readPlanProposal",
  "listPlanProposals",
  "readGoal",
  "readTrackedConversationOperation",
  "listTeamConversations",
  "readTeamConversation",
  "readPluginManagement",
]);

const CAPABILITIES: AgentHostCapabilitySnapshot = {
  revision: 1,
  domains: ["assistant"],
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

export function createAssistantAgentHostEndpoint(
  options: AssistantAgentHostEndpointOptions,
): InProcessAgentHostEndpoint {
  const events = createAssistantAgentHostEventBridge(options.surface);
  return createInProcessAgentHostEndpoint({
    host: options.host,
    capabilities: CAPABILITIES,
    accessToken: options.accessToken,
    handleOperation: async (request) =>
      await handleOperation(options.surface, options.commands, request),
    replayEvents: (request) => createAssistantReplayResult(options.surface, request),
    subscribeEvents: events.subscribe,
  });
}

async function handleOperation(
  surface: SurfaceAdapter,
  commands: AssistantAgentHostEndpointOptions["commands"],
  request: AgentHostOperationRequest,
): Promise<AgentHostOperationResult> {
  if (request.domain !== "assistant") {
    return failed("unauthorized", "Assistant Agent Host domain is required", false);
  }
  if (request.operationKind === "read") {
    return await handleRead(surface, request);
  }
  if (!isAssistantConversationCommand(request.operation)) {
    return failed("not_found", "Assistant Agent Host operation is unavailable", false);
  }
  const payload = objectPayload(request.payload, request.operation);
  if (payload === undefined) {
    return failed(
      "malformed_request",
      "Assistant operation payload must be an object",
      false,
    );
  }
  const result = await runAssistantCommand(commands, request.operation, payload, request);
  if (
    request.operation === ASSISTANT_AGENT_HOST_OPERATIONS.conversationSubmit &&
    isRejectedConversationResult(result)
  ) {
    return failed(
      result.reason === "idempotency_conflict"
        ? "idempotency_conflict"
        : "application_failure",
      result.message,
      false,
    );
  }
  if (
    request.operation === ASSISTANT_AGENT_HOST_OPERATIONS.conversationSubmit &&
    !isConversationOperationFound(result)
  ) {
    return failed(
      "application_failure",
      "Assistant submission returned no operation",
      true,
    );
  }
  if (request.operation === ASSISTANT_AGENT_HOST_OPERATIONS.conversationSubmit) {
    const submitted = result;
    if (!isConversationOperationFound(submitted)) {
      return failed(
        "application_failure",
        "Assistant submission returned no operation",
        true,
      );
    }
    return {
      outcome: "accepted",
      operationId: submitted.operation.operationId,
    };
  }
  return { outcome: "completed", result: jsonValue(result) };
}

async function runAssistantCommand(
  commands: AssistantAgentHostEndpointOptions["commands"],
  operation: string,
  payload: Record<string, JsonValue>,
  request: Extract<AgentHostOperationRequest, { operationKind: "command" }>,
): Promise<unknown> {
  switch (operation) {
    case ASSISTANT_AGENT_HOST_OPERATIONS.conversationSubmit:
      return await commands.submitConversationOperation({
        ...(payload as unknown as Parameters<
          typeof commands.submitConversationOperation
        >[0]),
        idempotencyKey: request.idempotencyKey,
      });
    case ASSISTANT_AGENT_HOST_OPERATIONS.conversationCancel:
      return await commands.cancelTrackedConversationOperation(
        payload as unknown as Parameters<
          typeof commands.cancelTrackedConversationOperation
        >[0],
      );
    case ASSISTANT_AGENT_HOST_OPERATIONS.conversationSteer:
      return await commands.steerTrackedConversationOperation({
        ...(payload as unknown as Parameters<
          typeof commands.steerTrackedConversationOperation
        >[0]),
        requestId: request.requestId,
        idempotencyKey: request.idempotencyKey,
      });
    case ASSISTANT_AGENT_HOST_OPERATIONS.conversationApprovalResolve:
      return await commands.resolveTrackedConversationApproval({
        ...(payload as unknown as Parameters<
          typeof commands.resolveTrackedConversationApproval
        >[0]),
        idempotencyKey: request.idempotencyKey,
      });
    case ASSISTANT_AGENT_HOST_OPERATIONS.conversationRecoveryResolve:
      return await commands.resolveTrackedConversationRecovery({
        ...(payload as unknown as Parameters<
          typeof commands.resolveTrackedConversationRecovery
        >[0]),
        idempotencyKey: request.idempotencyKey,
      });
  }
}

async function handleRead(
  surface: SurfaceAdapter,
  request: Extract<AgentHostOperationRequest, { operationKind: "read" }>,
): Promise<AgentHostOperationResult> {
  if (request.operation !== ASSISTANT_AGENT_HOST_OPERATIONS.surfaceRead) {
    return failed("not_found", "Assistant read operation is unavailable", false);
  }
  const payload = objectPayload(request.payload, request.operation);
  if (payload === undefined || typeof payload.command !== "string") {
    return failed(
      "malformed_request",
      "assistant.surface.read requires a command",
      false,
    );
  }
  if (!READ_COMMANDS.has(payload.command)) {
    return failed("unauthorized", "Assistant read command is not exposed", false);
  }
  const envelope = await surface.dispatchSurfaceCommand({
    command: payload.command,
    ...(payload.input === undefined ? {} : { input: payload.input }),
    requestId: request.requestId,
  });
  if (!envelope.ok) {
    return failed("application_failure", envelope.error.message, false);
  }
  return { outcome: "completed", result: jsonValue(envelope.value) };
}

function objectPayload(
  payload: JsonValue,
  operation: string,
): Record<string, JsonValue> | undefined {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return undefined;
  }
  const record = payload as Record<string, JsonValue>;
  if (operation === ASSISTANT_AGENT_HOST_OPERATIONS.surfaceRead) {
    return hasOnlyKeys(record, ["command", "input"]) ? record : undefined;
  }
  const allowed = ASSISTANT_COMMAND_FIELDS[operation];
  return allowed !== undefined && hasOnlyKeys(record, allowed) ? record : undefined;
}

const ASSISTANT_COMMAND_FIELDS: Readonly<Record<string, readonly string[]>> = {
  [ASSISTANT_AGENT_HOST_OPERATIONS.conversationSubmit]: [
    "text",
    "sessionId",
    "principalId",
  ],
  [ASSISTANT_AGENT_HOST_OPERATIONS.conversationCancel]: ["reason", "sessionId"],
  [ASSISTANT_AGENT_HOST_OPERATIONS.conversationSteer]: [
    "operationId",
    "text",
    "sessionId",
  ],
  [ASSISTANT_AGENT_HOST_OPERATIONS.conversationApprovalResolve]: [
    "sessionId",
    "approvalId",
    "expectedApprovalRevision",
    "decision",
    "reason",
  ],
  [ASSISTANT_AGENT_HOST_OPERATIONS.conversationRecoveryResolve]: [
    "sessionId",
    "recoveryId",
    "expectedRecoveryRevision",
    "decision",
    "reason",
    "content",
    "error",
  ],
};

function isAssistantConversationCommand(
  value: string,
): boolean {
  return Object.values(ASSISTANT_AGENT_HOST_OPERATIONS).includes(
    value as (typeof ASSISTANT_AGENT_HOST_OPERATIONS)[keyof typeof ASSISTANT_AGENT_HOST_OPERATIONS],
  ) && value !== ASSISTANT_AGENT_HOST_OPERATIONS.surfaceRead;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isConversationOperationFound(value: unknown): value is {
  readonly kind: "assistant.conversation-operation.found";
  readonly operation: { readonly operationId: string };
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const operation = record.operation;
  return (
    record.kind === "assistant.conversation-operation.found" &&
    typeof operation === "object" &&
    operation !== null &&
    !Array.isArray(operation) &&
    typeof (operation as Record<string, unknown>).operationId === "string"
  );
}

function isRejectedConversationResult(
  value: unknown,
): value is { readonly message: string; readonly reason: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).kind ===
      "assistant.conversation-operation.rejected" &&
    typeof (value as Record<string, unknown>).message === "string" &&
    typeof (value as Record<string, unknown>).reason === "string"
  );
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
  return normalized.slice(0, 512) || "Assistant operation failed";
}

function jsonValue(value: unknown): JsonValue {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? null : (JSON.parse(encoded) as JsonValue);
}
