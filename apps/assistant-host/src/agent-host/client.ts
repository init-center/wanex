import type {
  AgentHostClient,
  AgentHostClientTransport,
  AgentHostEvent,
  AgentHostEventPage,
  AgentHostEventReplayResponse,
  AgentHostHandshakeResponse,
  AgentHostOperationResponse,
  JsonValue,
} from "@wanex/protocol";
import {
  AgentHostClientError,
  createAgentHostClient,
} from "@wanex/protocol";
import type {
  HomeOptions,
  HomeReadModel,
  ReadSessionTranscriptRequest,
  SettingsReadModel,
  ShellStatus,
  SteerTrackedConversationOperationRequest,
  SubmitConversationOperationRequest,
  CancelTrackedConversationOperationRequest,
  CancelTrackedConversationOperationResult,
  ResolveTrackedConversationApprovalRequest,
  ResolveTrackedConversationApprovalResult,
  ResolveTrackedConversationRecoveryRequest,
  ResolveTrackedConversationRecoveryResult,
  SteerTrackedConversationOperationResult,
  SessionTranscriptReadResult,
} from "@wanex/assistant";
import {
  isSurfaceCommandValue,
  isSurfaceEvent,
  SURFACE_COMMANDS,
  type SurfaceCommand,
  type SurfaceEvent,
} from "@wanex/assistant";
import {
  ASSISTANT_AGENT_HOST_OPERATIONS,
  type AssistantAgentHostOperation,
} from "./model.js";

export interface AssistantAgentHostClientOptions {
  readonly clientId: string;
  readonly accessToken: string;
  readonly createRequestId?: () => string;
}

export type AssistantAgentHostEvent = Omit<
  AgentHostEvent,
  "domain" | "payload"
> & {
  readonly domain: "assistant";
  readonly payload: SurfaceEvent;
};

export type AssistantAgentHostEventListener = (
  event: AssistantAgentHostEvent,
) => void;

export interface AssistantAgentHostReplayRequest {
  readonly streamId: string;
  readonly afterSequence: number;
  readonly limit: number;
}

export type AssistantAgentHostReplayResult =
  | {
      readonly outcome: "replayed";
      readonly page: Omit<AgentHostEventPage, "events"> & {
        readonly events: readonly AssistantAgentHostEvent[];
      };
    }
  | {
      readonly outcome: "gap";
      readonly gap: NonNullable<AgentHostEventReplayResponse["gap"]>;
    };

export type AssistantConversationAdmission = {
  readonly operationId: string;
};

export type AssistantSubmitConversationRequest = Omit<
  SubmitConversationOperationRequest,
  "idempotencyKey"
> & {
  readonly idempotencyKey: string;
};

export type AssistantSteerConversationRequest = Omit<
  SteerTrackedConversationOperationRequest,
  "requestId" | "idempotencyKey"
> & {
  readonly idempotencyKey: string;
};

export type AssistantResolveApprovalRequest = Omit<
  ResolveTrackedConversationApprovalRequest,
  "idempotencyKey"
> & {
  readonly idempotencyKey: string;
};

export type AssistantResolveRecoveryRequest = Omit<
  ResolveTrackedConversationRecoveryRequest,
  "idempotencyKey"
> & {
  readonly idempotencyKey: string;
};

export interface AssistantAgentHostClient {
  connect(): Promise<AgentHostHandshakeResponse>;
  readStatus(): Promise<ShellStatus>;
  readHome(options?: HomeOptions): Promise<HomeReadModel>;
  readSettings(): Promise<SettingsReadModel>;
  readSessionTranscript(
    request?: ReadSessionTranscriptRequest,
  ): Promise<SessionTranscriptReadResult>;
  submitConversation(
    request: AssistantSubmitConversationRequest,
  ): Promise<AssistantConversationAdmission>;
  cancelConversation(
    request: CancelTrackedConversationOperationRequest & {
      readonly idempotencyKey: string;
    },
  ): Promise<CancelTrackedConversationOperationResult>;
  steerConversation(
    request: AssistantSteerConversationRequest,
  ): Promise<SteerTrackedConversationOperationResult>;
  resolveApproval(
    request: AssistantResolveApprovalRequest,
  ): Promise<ResolveTrackedConversationApprovalResult>;
  resolveRecovery(
    request: AssistantResolveRecoveryRequest,
  ): Promise<ResolveTrackedConversationRecoveryResult>;
  subscribe(listener: AssistantAgentHostEventListener): () => void;
  replay(
    request: AssistantAgentHostReplayRequest,
  ): Promise<AssistantAgentHostReplayResult>;
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
  const subscriptions = new Set<() => void>();
  let connection: AgentHostHandshakeResponse | undefined;
  let closed = false;

  const client: AssistantAgentHostClient = {
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
    async readStatus() {
      return await readSurface(
        SURFACE_COMMANDS.status,
        undefined,
        isKind<ShellStatus>("assistant.status"),
      );
    },
    async readHome(options) {
      return await readSurface(
        SURFACE_COMMANDS.readHome,
        options,
        isKind<HomeReadModel>("assistant.home"),
      );
    },
    async readSettings() {
      return await readSurface(
        SURFACE_COMMANDS.readSettings,
        undefined,
        isKind<SettingsReadModel>("assistant.settings"),
      );
    },
    async readSessionTranscript(request) {
      return await readSurface(
        SURFACE_COMMANDS.readSessionTranscript,
        request,
        (value) => isSurfaceCommandValue(value, SURFACE_COMMANDS.readSessionTranscript),
      ) as SessionTranscriptReadResult;
    },
    async submitConversation(request) {
      const response = await command(
        ASSISTANT_AGENT_HOST_OPERATIONS.conversationSubmit,
        request.idempotencyKey,
        withoutKey(request),
      );
      if (response.outcome !== "accepted" || response.operationId === undefined) {
        throw invalidResponse("Assistant conversation admission did not return an operation");
      }
      return { operationId: response.operationId };
    },
    async cancelConversation(request) {
      const response = await command(
        ASSISTANT_AGENT_HOST_OPERATIONS.conversationCancel,
        request.idempotencyKey,
        withoutKey(request),
      );
      return expectAssistantResult<CancelTrackedConversationOperationResult>(
        response,
        "assistant.conversation-operation.cancel",
      );
    },
    async steerConversation(request) {
      const response = await command(
        ASSISTANT_AGENT_HOST_OPERATIONS.conversationSteer,
        request.idempotencyKey,
        withoutKey(request),
      );
      return expectConversationResult<SteerTrackedConversationOperationResult>(response);
    },
    async resolveApproval(request) {
      const response = await command(
        ASSISTANT_AGENT_HOST_OPERATIONS.conversationApprovalResolve,
        request.idempotencyKey,
        withoutKey(request),
      );
      return expectConversationResult<ResolveTrackedConversationApprovalResult>(response);
    },
    async resolveRecovery(request) {
      const response = await command(
        ASSISTANT_AGENT_HOST_OPERATIONS.conversationRecoveryResolve,
        request.idempotencyKey,
        withoutKey(request),
      );
      return expectConversationResult<ResolveTrackedConversationRecoveryResult>(response);
    },
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
          throw invalidResponse("Assistant replay gap has no detail");
        }
        return { outcome: "gap", gap: response.gap };
      }
      if (response.page === undefined) {
        throw invalidResponse("Assistant replay response has no event page");
      }
      const events = response.page.events.map(projectEvent);
      if (events.some((event): event is undefined => event === undefined)) {
        throw invalidResponse("Assistant event replay contains an invalid event");
      }
      return {
        outcome: "replayed",
        page: { ...response.page, events: events as AssistantAgentHostEvent[] },
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

  async function readSurface<T>(
    commandName: SurfaceCommand,
    input: unknown,
    guard: (value: unknown) => boolean,
  ): Promise<T> {
    const response = await command(
      ASSISTANT_AGENT_HOST_OPERATIONS.surfaceRead,
      undefined,
      input === undefined
        ? { command: commandName }
        : { command: commandName, input: input as JsonValue },
      "read",
    );
    if (
      response.outcome !== "completed" ||
      response.result === undefined ||
      !guard(response.result)
    ) {
      throw invalidResponse(`Assistant read ${commandName} returned an invalid result`);
    }
    return response.result as T;
  }

  async function command(
    operation: AssistantAgentHostOperation,
    idempotencyKey: string | undefined,
    payload: unknown,
    operationKind: "command" | "read" = "command",
  ): Promise<AgentHostOperationResponse> {
    assertOpen();
    if (connection === undefined) {
      throw new AgentHostClientError("unauthenticated", "Assistant Host client is not connected");
    }
    if (operationKind === "read") {
      return await protocolClient.read({
        domain: "assistant",
        operation: ASSISTANT_AGENT_HOST_OPERATIONS.surfaceRead,
        payload: payload as JsonValue,
      });
    }
    if (idempotencyKey === undefined) {
      throw new AgentHostClientError("malformed_request", "Assistant command requires an idempotency key");
    }
    const response = await protocolClient.command({
      domain: "assistant",
      operation,
      idempotencyKey,
      payload: payload as JsonValue,
    });
    if (response.outcome === "failed") {
      if (response.error === undefined) {
        throw invalidResponse("Assistant command failure has no error detail");
      }
      throw new AgentHostClientError(
        response.error.code,
        response.error.message,
        response.error,
      );
    }
    return response;
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

function projectEvent(event: AgentHostEvent): AssistantAgentHostEvent | undefined {
  return event.domain === "assistant" && isSurfaceEvent(event.payload)
    ? (event as unknown as AssistantAgentHostEvent)
    : undefined;
}

function isKind<T>(kind: string): (value: unknown) => value is T {
  return (value): value is T =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).kind === kind;
}

function expectAssistantResult<T>(
  response: AgentHostOperationResponse,
  kind: string,
): T {
  if (response.outcome !== "completed" || response.result === undefined) {
    throw invalidResponse("Assistant command did not complete");
  }
  if (!isKind<T>(kind)(response.result)) {
    throw invalidResponse(`Assistant command result kind ${kind} is invalid`);
  }
  return response.result as T;
}

function expectConversationResult<T>(response: AgentHostOperationResponse): T {
  if (response.outcome !== "completed" || response.result === undefined) {
    throw invalidResponse("Assistant conversation command did not complete");
  }
  if (!hasKind(response.result, "assistant.conversation-operation.found") &&
      !hasKind(response.result, "assistant.conversation-operation.rejected")) {
    throw invalidResponse("Assistant conversation command result is invalid");
  }
  return response.result as T;
}

function hasKind(value: unknown, kind: string): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).kind === kind
  );
}

function withoutKey<T extends object>(
  value: T & { readonly idempotencyKey?: string },
): Record<string, unknown> {
  const { idempotencyKey: _idempotencyKey, ...payload } = value;
  return payload;
}

function invalidResponse(message: string): AgentHostClientError {
  return new AgentHostClientError("invalid_response", message);
}
