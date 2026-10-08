import { randomUUID } from "node:crypto";
import {
  type SurfaceDescriptor,
  type SurfaceEnvelope,
  type SurfaceEvent,
  type SurfaceEventPage,
} from "@wanex/assistant";
import {
  createSurfaceClient,
  isSurfaceDescriptor,
  isSurfaceEvent,
  isSurfaceEventPage,
  type SurfaceClient,
  type SurfaceClientCommandRequest,
  type SurfaceClientTransport,
} from "@wanex/assistant/surface";
import type {
  AgentHostClient,
  AgentHostClientTransport,
  AgentHostFeature,
  AgentHostHandshakeResponse,
  AgentHostOperationResponse,
  JsonValue,
} from "@wanex/protocol";
import {
  AgentHostClientError,
  createAgentHostClient,
} from "@wanex/protocol";
import type {
  PreparedResourceDelivery,
  ResourceDeliveryAuthorizationRequest,
} from "../resources/model.js";
import { ASSISTANT_AGENT_HOST_OPERATIONS } from "./model.js";
import { remoteAssistantSurfaceCommandKind } from "./policy.js";

export interface AssistantAgentHostClientOptions {
  readonly clientId: string;
  readonly accessToken: string;
  readonly createRequestId?: () => string;
  readonly createIdempotencyKey?: () => string;
}

export interface AssistantAgentHostClient extends SurfaceClient {
  connect(): Promise<AgentHostHandshakeResponse>;
  prepareResourceDelivery(
    request: ResourceDeliveryAuthorizationRequest,
  ): Promise<PreparedResourceDelivery>;
  revokeResourceDelivery(token: string): Promise<boolean>;
  close(): void;
}

export function createAssistantAgentHostClient(
  transport: AgentHostClientTransport,
  options: AssistantAgentHostClientOptions,
): AssistantAgentHostClient {
  const protocolClient = createAgentHostClient(
    transport,
    options.createRequestId,
  );
  const createIdempotencyKey = options.createIdempotencyKey ?? randomUUID;
  const subscriptions = new Set<() => void>();
  let connection: AgentHostHandshakeResponse | undefined;
  let closed = false;
  const surface = createSurfaceClient(createSurfaceTransport());

  const client: AssistantAgentHostClient = {
    ...surface,
    async connect() {
      assertOpen();
      if (connection !== undefined) return connection;
      const response = await protocolClient.handshake({
        protocolVersion: 1,
        clientId: options.clientId,
        accessToken: options.accessToken,
        requestedDomains: ["assistant"],
      });
      assertCapabilities(response);
      connection = response;
      return response;
    },
    async prepareResourceDelivery(request) {
      assertFeature("resource_delivery");
      const value = await command(
        ASSISTANT_AGENT_HOST_OPERATIONS.resourceDeliveryPrepare,
        createIdempotencyKey(),
        jsonValue(request),
      );
      const prepared = parsePreparedResourceDelivery(value, request);
      if (prepared === undefined) {
        throw invalidResponse("Assistant Resource delivery grant is invalid");
      }
      return prepared;
    },
    async revokeResourceDelivery(token) {
      assertFeature("resource_delivery");
      const value = await command(
        ASSISTANT_AGENT_HOST_OPERATIONS.resourceDeliveryRevoke,
        createIdempotencyKey(),
        { token },
      );
      if (!isResourceDeliveryRevocation(value)) {
        throw invalidResponse("Assistant Resource delivery revocation is invalid");
      }
      return value.revoked;
    },
    close() {
      if (closed) return;
      closed = true;
      for (const unsubscribe of subscriptions) unsubscribe();
      subscriptions.clear();
    },
  };

  return Object.freeze(client);

  function createSurfaceTransport(): SurfaceClientTransport {
    return {
      async descriptor() {
        const value = await read(
          ASSISTANT_AGENT_HOST_OPERATIONS.surfaceDescriptor,
          null,
        );
        if (!isSurfaceDescriptor(value)) {
          throw invalidResponse("Assistant Surface descriptor is invalid");
        }
        return value as unknown as SurfaceDescriptor;
      },
      async dispatchSurfaceCommand(request) {
        const kind = remoteAssistantSurfaceCommandKind(request.command);
        if (kind === "unavailable") {
          throw new AgentHostClientError(
            "unauthorized",
            "Assistant Surface command is unavailable through a remote Host",
          );
        }
        const payload = jsonValue(request);
        const response = kind === "read"
          ? await read(ASSISTANT_AGENT_HOST_OPERATIONS.surfaceDispatch, payload)
          : await command(
              ASSISTANT_AGENT_HOST_OPERATIONS.surfaceDispatch,
              surfaceIdempotencyKey(request, createIdempotencyKey),
              payload,
            );
        return response as unknown as SurfaceEnvelope;
      },
      async readSurfaceEvents(request = {}) {
        const value = await read(
          ASSISTANT_AGENT_HOST_OPERATIONS.surfaceEventsRead,
          jsonValue(request),
        );
        if (!isSurfaceEventPage(value)) {
          throw invalidResponse("Assistant Surface event page is invalid");
        }
        return value as unknown as SurfaceEventPage;
      },
      subscribeSurfaceEvents(listener) {
        assertConnected();
        const unsubscribe = protocolClient.subscribe((event) => {
          if (event.domain !== "assistant" || !isSurfaceEvent(event.payload)) return;
          try {
            listener(event.payload as SurfaceEvent);
          } catch {
            // One Surface subscriber cannot affect the shared Host transport.
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
    };
  }

  async function read(operation: string, payload: JsonValue): Promise<JsonValue> {
    assertConnected();
    const response = await protocolClient.read({
      domain: "assistant",
      operation,
      payload,
    });
    return completedResult(response);
  }

  async function command(
    operation: string,
    idempotencyKey: string,
    payload: JsonValue,
  ): Promise<JsonValue> {
    assertConnected();
    const response = await protocolClient.command({
      domain: "assistant",
      operation,
      idempotencyKey,
      payload,
    });
    return completedResult(response);
  }

  function completedResult(response: AgentHostOperationResponse): JsonValue {
    if (response.outcome === "failed") {
      if (response.error === undefined) {
        throw invalidResponse("Assistant Host failure has no error detail");
      }
      throw new AgentHostClientError(
        response.error.code,
        response.error.message,
        response.error,
      );
    }
    if (response.outcome !== "completed" || response.result === undefined) {
      throw invalidResponse("Assistant Surface operation did not complete");
    }
    return response.result;
  }

  function assertConnected(): void {
    assertOpen();
    if (connection === undefined) {
      throw new AgentHostClientError(
        "unauthenticated",
        "Assistant Host client is not connected",
      );
    }
  }

  function assertFeature(feature: AgentHostFeature): void {
    assertConnected();
    if (!connection?.capabilities.features.includes(feature)) {
      throw new AgentHostClientError(
        "unauthorized",
        `Assistant Host does not advertise ${feature}`,
      );
    }
  }

  function assertOpen(): void {
    if (closed) {
      throw new AgentHostClientError(
        "transport_failure",
        "Assistant Host client is closed",
      );
    }
  }
}

function parsePreparedResourceDelivery(
  value: JsonValue,
  request: ResourceDeliveryAuthorizationRequest,
): PreparedResourceDelivery | undefined {
  if (!isExactRecord(value, [
    "kind",
    "token",
    "resourceId",
    "sha256",
    "resourceKind",
    "mediaType",
    "sizeBytes",
    "purpose",
    "sessionId",
    "expiresAt",
  ])) return undefined;
  const token = value.token;
  const resourceKind = value.resourceKind;
  const mediaType = value.mediaType;
  const sizeBytes = value.sizeBytes;
  const expiresAt = value.expiresAt;
  if (
    value.kind !== "assistant-host.resource-delivery" ||
    !isResourceDeliveryToken(token) ||
    value.resourceId !== request.resourceId ||
    value.sha256 !== request.expectedSha256 ||
    (resourceKind !== "image" && resourceKind !== "audio" && resourceKind !== "video") ||
    !isBoundedIdentity(mediaType) ||
    !isPositiveSafeInteger(sizeBytes) ||
    value.purpose !== request.purpose ||
    value.sessionId !== request.sessionId ||
    !isPositiveSafeInteger(expiresAt)
  ) return undefined;
  return {
    kind: "assistant-host.resource-delivery",
    token,
    resourceId: request.resourceId,
    sha256: request.expectedSha256,
    resourceKind,
    mediaType,
    sizeBytes,
    purpose: request.purpose,
    ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
    expiresAt,
  };
}

function isResourceDeliveryRevocation(
  value: JsonValue,
): value is { readonly kind: "assistant-host.resource-delivery-revoked"; readonly revoked: boolean } {
  return isExactRecord(value, ["kind", "revoked"]) &&
    value.kind === "assistant-host.resource-delivery-revoked" &&
    typeof value.revoked === "boolean";
}

function isExactRecord(
  value: JsonValue,
  allowedKeys: readonly string[],
): value is Record<string, JsonValue> {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isResourceDeliveryToken(value: unknown): value is string {
  return typeof value === "string" && /^wrd_[A-Za-z0-9_-]{43}$/.test(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function assertCapabilities(response: AgentHostHandshakeResponse): void {
  if (
    !response.capabilities.domains.includes("assistant") ||
    !response.capabilities.features.includes("canonical_reads") ||
    !response.capabilities.features.includes("event_replay")
  ) {
    throw new AgentHostClientError(
      "unauthorized",
      "Assistant Host does not advertise the required capabilities",
    );
  }
}

function jsonValue(value: unknown): JsonValue {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? null : (JSON.parse(encoded) as JsonValue);
}

function surfaceIdempotencyKey(
  request: SurfaceClientCommandRequest,
  create: () => string,
): string {
  if (
    typeof request.input === "object" &&
    request.input !== null &&
    !Array.isArray(request.input) &&
    "idempotencyKey" in request.input
  ) {
    const value = (request.input as Record<string, unknown>).idempotencyKey;
    if (isBoundedIdentity(value)) return value;
  }
  return request.requestId ?? create();
}

function isBoundedIdentity(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= 256 &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function invalidResponse(message: string): AgentHostClientError {
  return new AgentHostClientError("invalid_response", message);
}
