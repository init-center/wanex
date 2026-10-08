import type {
  ReadSurfaceEventsRequest,
  SurfaceCommandRequest,
  SurfaceDescriptor,
} from "@wanex/assistant";
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
  ResourceDeliveryError,
  type ResourceDeliveryAuthorizationRequest,
} from "../resources/model.js";
import {
  ASSISTANT_AGENT_HOST_OPERATIONS,
  type AssistantAgentHostEndpointOptions,
} from "./model.js";
import {
  createAssistantAgentHostEventBridge,
  createAssistantReplayResult,
} from "./events.js";
import {
  isSurfaceCommand,
  projectRemoteAssistantSurfaceCommands,
  remoteAssistantSurfaceCommandKind,
} from "./policy.js";

const BASE_CAPABILITIES: AgentHostCapabilitySnapshot = {
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
  const deliveryConfigured = options.resourceDeliveries !== undefined;
  if (deliveryConfigured !== (options.resourceDeliveryAudience !== undefined)) {
    throw new Error(
      "Assistant Agent Host Resource delivery requires a port and trusted audience",
    );
  }
  if (
    options.resourceDeliveryAudience !== undefined &&
    !isBoundedIdentity(options.resourceDeliveryAudience)
  ) {
    throw new Error("Assistant Agent Host Resource delivery audience is invalid");
  }
  const capabilities: AgentHostCapabilitySnapshot = deliveryConfigured
    ? {
        ...BASE_CAPABILITIES,
        features: [...BASE_CAPABILITIES.features, "resource_delivery"],
      }
    : BASE_CAPABILITIES;
  const events = createAssistantAgentHostEventBridge(options.surface);
  const issuedTokens = new Set<string>();
  const endpoint = createInProcessAgentHostEndpoint({
    host: options.host,
    capabilities,
    accessToken: options.accessToken,
    handleOperation: async (request) =>
      await handleOperation(options, issuedTokens, request),
    replayEvents: (request) => createAssistantReplayResult(options.surface, request),
    subscribeEvents: events.subscribe,
  });
  return Object.freeze({
    send: endpoint.send,
    subscribe: endpoint.subscribe,
    close() {
      for (const token of issuedTokens) options.resourceDeliveries?.revoke(token);
      issuedTokens.clear();
      endpoint.close();
    },
  });
}

async function handleOperation(
  options: AssistantAgentHostEndpointOptions,
  issuedTokens: Set<string>,
  request: AgentHostOperationRequest,
): Promise<AgentHostOperationResult> {
  if (request.domain !== "assistant") {
    return failed("unauthorized", "Assistant Agent Host domain is required", false);
  }
  switch (request.operation) {
    case ASSISTANT_AGENT_HOST_OPERATIONS.surfaceDescriptor:
      if (request.operationKind !== "read" || request.payload !== null) {
        return malformed("Assistant Surface descriptor request is invalid");
      }
      return completed(projectDescriptor(options.surface.descriptor()));
    case ASSISTANT_AGENT_HOST_OPERATIONS.surfaceEventsRead:
      if (request.operationKind !== "read") {
        return failed(
          "unauthorized",
          "Assistant Surface event reads must be read operations",
          false,
        );
      }
      try {
        return completed(
          options.surface.readSurfaceEvents(parseEventReadRequest(request.payload)),
        );
      } catch {
        return malformed("Assistant Surface event read request is invalid");
      }
    case ASSISTANT_AGENT_HOST_OPERATIONS.surfaceDispatch:
      return await dispatchSurfaceCommand(options, request);
    case ASSISTANT_AGENT_HOST_OPERATIONS.resourceDeliveryPrepare:
      return await prepareResourceDelivery(options, issuedTokens, request);
    case ASSISTANT_AGENT_HOST_OPERATIONS.resourceDeliveryRevoke:
      return revokeResourceDelivery(options, issuedTokens, request);
    default:
      return failed("not_found", "Assistant Agent Host operation is unavailable", false);
  }
}

async function prepareResourceDelivery(
  options: AssistantAgentHostEndpointOptions,
  issuedTokens: Set<string>,
  request: AgentHostOperationRequest,
): Promise<AgentHostOperationResult> {
  if (request.operationKind !== "command") {
    return failed(
      "unauthorized",
      "Resource delivery preparation requires a command",
      false,
    );
  }
  if (
    options.resourceDeliveries === undefined ||
    options.resourceDeliveryAudience === undefined
  ) {
    return failed(
      "not_found",
      "Resource delivery is unavailable through this Host",
      false,
    );
  }
  const payload = parsePrepareResourceDelivery(request.payload);
  if (payload === undefined) {
    return malformed("Resource delivery preparation request is invalid");
  }
  try {
    const prepared = await options.resourceDeliveries.prepare({
      audience: options.resourceDeliveryAudience,
      ...payload,
    });
    issuedTokens.add(prepared.token);
    return completed(prepared);
  } catch (error) {
    return resourceFailure(error);
  }
}

function revokeResourceDelivery(
  options: AssistantAgentHostEndpointOptions,
  issuedTokens: Set<string>,
  request: AgentHostOperationRequest,
): AgentHostOperationResult {
  if (request.operationKind !== "command") {
    return failed(
      "unauthorized",
      "Resource delivery revocation requires a command",
      false,
    );
  }
  if (options.resourceDeliveries === undefined) {
    return failed(
      "not_found",
      "Resource delivery is unavailable through this Host",
      false,
    );
  }
  const payload = exactRecord(request.payload, ["token"]);
  if (
    payload === undefined ||
    Object.keys(payload).length !== 1 ||
    !isResourceDeliveryToken(payload.token)
  ) {
    return malformed("Resource delivery revocation request is invalid");
  }
  const token = payload.token;
  const owned = issuedTokens.delete(token);
  return completed({
    kind: "assistant-host.resource-delivery-revoked",
    revoked: owned && options.resourceDeliveries.revoke(token),
  });
}

function parsePrepareResourceDelivery(
  payload: JsonValue,
): ResourceDeliveryAuthorizationRequest | undefined {
  const value = exactRecord(payload, [
    "resourceId",
    "expectedSha256",
    "purpose",
    "sessionId",
  ]);
  if (
    value === undefined ||
    !isBoundedIdentity(value.resourceId) ||
    typeof value.expectedSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.expectedSha256) ||
    (value.purpose !== "preview" && value.purpose !== "media") ||
    (value.sessionId !== undefined && !isBoundedIdentity(value.sessionId))
  ) {
    return undefined;
  }
  return {
    resourceId: value.resourceId,
    expectedSha256: value.expectedSha256,
    purpose: value.purpose,
    ...(value.sessionId === undefined ? {} : { sessionId: value.sessionId }),
  };
}

function isResourceDeliveryToken(value: unknown): value is string {
  return typeof value === "string" && /^wrd_[A-Za-z0-9_-]{43}$/.test(value);
}

function resourceFailure(error: unknown): AgentHostOperationResult {
  if (!(error instanceof ResourceDeliveryError)) {
    return failed("application_failure", "Resource delivery failed", true);
  }
  const code = error.statusCode === 403
    ? "unauthorized"
    : error.statusCode === 404 || error.statusCode === 410
      ? "not_found"
      : error.statusCode === 413 || error.statusCode === 429
        ? "resource_limit"
        : error.statusCode === 400 ||
            error.statusCode === 415 ||
            error.statusCode === 416
          ? "malformed_request"
          : "application_failure";
  return failed(code, error.message, false);
}

async function dispatchSurfaceCommand(
  options: AssistantAgentHostEndpointOptions,
  request: AgentHostOperationRequest,
): Promise<AgentHostOperationResult> {
  const payload = exactRecord(request.payload, ["command", "input", "requestId"]);
  if (payload === undefined || !isSurfaceCommand(payload.command)) {
    return malformed("Assistant Surface dispatch request is invalid");
  }
  const kind = remoteAssistantSurfaceCommandKind(payload.command);
  if (kind === "unavailable") {
    return failed(
      "unauthorized",
      "Assistant Surface command is unavailable through a remote Host",
      false,
    );
  }
  if (request.operationKind !== kind) {
    return failed(
      "unauthorized",
      `Assistant Surface ${kind} command used the wrong operation kind`,
      false,
    );
  }
  if (payload.requestId !== undefined && !isBoundedIdentity(payload.requestId)) {
    return malformed("Assistant Surface request identity is invalid");
  }
  const surfaceRequest: SurfaceCommandRequest = {
    command: payload.command,
    ...(payload.input === undefined ? {} : { input: payload.input }),
    ...(payload.requestId === undefined
      ? {}
      : { requestId: payload.requestId as string }),
  };
  return completed(await options.surface.dispatchSurfaceCommand(surfaceRequest));
}

function projectDescriptor(descriptor: SurfaceDescriptor): SurfaceDescriptor {
  const commands = projectRemoteAssistantSurfaceCommands(descriptor.commands);
  return { ...descriptor, commandCount: commands.length, commands };
}

function parseEventReadRequest(payload: JsonValue): ReadSurfaceEventsRequest {
  const value = exactRecord(payload, ["streamId", "afterSequence", "limit"]);
  if (value === undefined) {
    throw new Error("Assistant Surface event read request is invalid");
  }
  if (
    (value.streamId !== undefined && typeof value.streamId !== "string") ||
    (value.afterSequence !== undefined &&
      (typeof value.afterSequence !== "number" ||
        !Number.isSafeInteger(value.afterSequence) ||
        value.afterSequence < 0)) ||
    (value.limit !== undefined &&
      (typeof value.limit !== "number" ||
        !Number.isSafeInteger(value.limit) ||
        value.limit < 1))
  ) {
    throw new Error("Assistant Surface event read request is invalid");
  }
  return {
    ...(value.streamId === undefined ? {} : { streamId: value.streamId as string }),
    ...(value.afterSequence === undefined
      ? {}
      : { afterSequence: value.afterSequence as number }),
    ...(value.limit === undefined ? {} : { limit: value.limit as number }),
  };
}

function exactRecord(
  value: JsonValue,
  allowedKeys: readonly string[],
): Record<string, JsonValue> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, JsonValue>;
  return Object.keys(record).every((key) => allowedKeys.includes(key))
    ? record
    : undefined;
}

function isBoundedIdentity(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= 256 &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function completed(value: unknown): AgentHostOperationResult {
  return { outcome: "completed", result: jsonValue(value) };
}

function malformed(message: string): AgentHostOperationResult {
  return failed("malformed_request", message, false);
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
