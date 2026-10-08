import { describe, expect, it, vi } from "vitest";
import {
  SURFACE_COMMANDS,
  type SurfaceAdapter,
  type SurfaceCommandRequest,
  type SurfaceDescriptor,
  type SurfaceEnvelope,
  type SurfaceEvent,
  type SurfaceEventPage,
} from "@wanex/assistant";
import {
  createAgentHostClient,
  type AgentHostEvent,
} from "@wanex/protocol";
import {
  ASSISTANT_AGENT_HOST_OPERATIONS,
  createAssistantAgentHostClient,
  createAssistantAgentHostComposition,
  createAssistantAgentHostEndpoint,
} from "../src/agent-host/index.js";
import type {
  PreparedResourceDelivery,
  ResourceDeliveryPort,
} from "../src/resources/model.js";

describe("Assistant Agent Host Surface binding", () => {
  it("projects the remote descriptor and dispatches typed reads and commands", async () => {
    const calls: SurfaceCommandRequest[] = [];
    const endpoint = createEndpoint(fakeSurface(calls));
    const client = createRawClient(endpoint);
    await connect(client);

    const descriptor = await client.read({
      domain: "assistant",
      operation: ASSISTANT_AGENT_HOST_OPERATIONS.surfaceDescriptor,
      payload: null,
    });
    expect(descriptor).toMatchObject({
      outcome: "completed",
      result: {
        kind: "assistant.surface-descriptor",
        commandCount: 2,
        commands: [
          { command: SURFACE_COMMANDS.status },
          { command: SURFACE_COMMANDS.submitConversationOperation },
        ],
      },
    });

    await expect(client.read({
      domain: "assistant",
      operation: ASSISTANT_AGENT_HOST_OPERATIONS.surfaceDispatch,
      payload: { command: SURFACE_COMMANDS.status, requestId: "status_request" },
    })).resolves.toMatchObject({
      outcome: "completed",
      result: { ok: true, command: SURFACE_COMMANDS.status },
    });
    await expect(client.command({
      domain: "assistant",
      operation: ASSISTANT_AGENT_HOST_OPERATIONS.surfaceDispatch,
      idempotencyKey: "submit_once",
      payload: {
        command: SURFACE_COMMANDS.submitConversationOperation,
        input: { text: "hello", idempotencyKey: "turn_once" },
        requestId: "submit_request",
      },
    })).resolves.toMatchObject({
      outcome: "completed",
      result: {
        ok: true,
        command: SURFACE_COMMANDS.submitConversationOperation,
      },
    });
    expect(calls).toEqual([
      { command: SURFACE_COMMANDS.status, requestId: "status_request" },
      {
        command: SURFACE_COMMANDS.submitConversationOperation,
        input: { text: "hello", idempotencyKey: "turn_once" },
        requestId: "submit_request",
      },
    ]);
  });

  it("enforces operation kind and rejects Host-local Surface commands", async () => {
    const calls: SurfaceCommandRequest[] = [];
    const client = createRawClient(createEndpoint(fakeSurface(calls)));
    await connect(client);

    await expect(client.read({
      domain: "assistant",
      operation: ASSISTANT_AGENT_HOST_OPERATIONS.surfaceDispatch,
      payload: { command: SURFACE_COMMANDS.submitConversationOperation },
    })).resolves.toMatchObject({
      outcome: "failed",
      error: { code: "unauthorized" },
    });
    await expect(client.command({
      domain: "assistant",
      operation: ASSISTANT_AGENT_HOST_OPERATIONS.surfaceDispatch,
      idempotencyKey: "wrong_kind",
      payload: { command: SURFACE_COMMANDS.status },
    })).resolves.toMatchObject({
      outcome: "failed",
      error: { code: "unauthorized" },
    });
    await expect(client.command({
      domain: "assistant",
      operation: ASSISTANT_AGENT_HOST_OPERATIONS.surfaceDispatch,
      idempotencyKey: "plugin_review",
      payload: { command: SURFACE_COMMANDS.requestLocalPluginReview },
    })).resolves.toMatchObject({
      outcome: "failed",
      error: { code: "unauthorized" },
    });
    await expect(client.command({
      domain: "assistant",
      operation: ASSISTANT_AGENT_HOST_OPERATIONS.surfaceDispatch,
      idempotencyKey: "attachment_prepare",
      payload: { command: SURFACE_COMMANDS.prepareConversationAttachment },
    })).resolves.toMatchObject({
      outcome: "failed",
      error: { code: "unauthorized" },
    });
    expect(calls).toHaveLength(0);
  });

  it("exposes canonical event pages and protocol replay without changing events", async () => {
    const surface = fakeSurface([]);
    const client = createRawClient(createEndpoint(surface));
    await connect(client);
    const received: AgentHostEvent[] = [];
    client.subscribe((value) => received.push(value));
    surfaceEmit(surface, event());

    expect(received).toEqual([
      expect.objectContaining({
        domain: "assistant",
        streamId: "assistant:assistant_surface_test",
        sequence: 1,
      }),
    ]);
    await expect(client.read({
      domain: "assistant",
      operation: ASSISTANT_AGENT_HOST_OPERATIONS.surfaceEventsRead,
      payload: { afterSequence: 0, limit: 10 },
    })).resolves.toMatchObject({
      outcome: "completed",
      result: { streamId: "assistant_surface_test", gap: false },
    });
    await expect(client.replay({
      streamId: "assistant:assistant_surface_test",
      afterSequence: 99,
      limit: 10,
    })).resolves.toMatchObject({
      outcome: "gap",
      gap: { canonicalReadRequired: true },
    });
  });

  it("does not grant an unsupported domain", async () => {
    const client = createRawClient(createEndpoint(fakeSurface([])));
    await expect(client.handshake({
      protocolVersion: 1,
      clientId: "wrong_domain",
      accessToken: "assistant_token",
      requestedDomains: ["coding" as never],
    })).rejects.toMatchObject({ code: "malformed_request" });
  });

  it("composes the existing SurfaceClient contract and closes subscriptions", async () => {
    const calls: SurfaceCommandRequest[] = [];
    const surface = fakeSurface(calls);
    const composition = await createAssistantAgentHostComposition({
      surface,
      host: host(),
      accessToken: "assistant_token",
      clientId: "surface_client",
      createIdempotencyKey: () => "surface_mutation_once",
    });

    await expect(composition.client.status()).resolves.toMatchObject({
      ok: true,
      value: { kind: "assistant.status" },
    });
    const submission = {
      text: "hello from SurfaceClient",
      idempotencyKey: "turn_once",
    };
    const first = await composition.client.submitConversationOperation(submission);
    const duplicate = await composition.client.submitConversationOperation(submission);
    expect(first).toMatchObject({
      ok: true,
      value: { kind: "assistant.conversation-operation.found" },
    });
    expect(duplicate).toEqual(first);
    expect(calls.filter(
      ({ command }) => command === SURFACE_COMMANDS.submitConversationOperation,
    )).toHaveLength(1);
    const received: SurfaceEvent[] = [];
    composition.client.subscribeSurfaceEvents((value) => received.push(value));
    surfaceEmit(surface, event());
    expect(received).toHaveLength(1);
    await expect(composition.client.readSurfaceEvents({
      afterSequence: 99,
      limit: 10,
    })).resolves.toMatchObject({ ok: true, gap: true });

    composition.close();
    composition.close();
    surfaceEmit(surface, event());
    expect(received).toHaveLength(1);
  });

  it("advertises, validates, deduplicates, and revokes Resource delivery commands", async () => {
    const token = `wrd_${"a".repeat(43)}`;
    const prepared: PreparedResourceDelivery = {
      kind: "assistant-host.resource-delivery",
      token,
      resourceId: "resource_image_1",
      sha256: "b".repeat(64),
      resourceKind: "image",
      mediaType: "image/png",
      sizeBytes: 128,
      purpose: "preview",
      sessionId: "session_1",
      expiresAt: 10_000,
    };
    const prepare = vi.fn(async () => prepared);
    const revoke = vi.fn(() => true);
    const endpoint = createAssistantAgentHostEndpoint({
      surface: fakeSurface([]),
      host: host(),
      accessToken: "assistant_token",
      resourceDeliveries: resourceDeliveryPort({ prepare, revoke }),
      resourceDeliveryAudience: "authenticated_subject",
    });
    const client = createRawClient(endpoint);
    const handshake = await client.handshake({
      protocolVersion: 1,
      clientId: "assistant_resource_client",
      accessToken: "assistant_token",
      requestedDomains: ["assistant"],
    });
    expect(handshake.capabilities.features).toContain("resource_delivery");

    await expect(client.read({
      domain: "assistant",
      operation: ASSISTANT_AGENT_HOST_OPERATIONS.resourceDeliveryPrepare,
      payload: null,
    })).resolves.toMatchObject({
      outcome: "failed",
      error: { code: "unauthorized" },
    });
    await expect(client.command({
      domain: "assistant",
      operation: ASSISTANT_AGENT_HOST_OPERATIONS.resourceDeliveryPrepare,
      idempotencyKey: "malformed_prepare",
      payload: { resourceId: "resource_image_1" },
    })).resolves.toMatchObject({
      outcome: "failed",
      error: { code: "malformed_request" },
    });
    expect(prepare).not.toHaveBeenCalled();

    const request = {
      domain: "assistant" as const,
      operation: ASSISTANT_AGENT_HOST_OPERATIONS.resourceDeliveryPrepare,
      idempotencyKey: "prepare_once",
      payload: {
        resourceId: prepared.resourceId,
        expectedSha256: prepared.sha256,
        purpose: prepared.purpose,
        sessionId: "session_1",
      },
    };
    const first = await client.command(request);
    const duplicate = await client.command(request);
    expect(duplicate).toMatchObject({
      outcome: "completed",
      result: first.result,
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith({
      audience: "authenticated_subject",
      ...request.payload,
    });

    endpoint.close();
    expect(revoke).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith(token);
  });

  it("keeps Resource delivery optional and rejects malformed typed responses", async () => {
    const unavailable = await createAssistantAgentHostComposition({
      surface: fakeSurface([]),
      host: host(),
      accessToken: "assistant_token",
      clientId: "assistant_without_resources",
    });
    await expect(unavailable.client.prepareResourceDelivery({
      resourceId: "resource_image_1",
      expectedSha256: "b".repeat(64),
      purpose: "preview",
    })).rejects.toMatchObject({ code: "unauthorized" });
    unavailable.close();

    const endpoint = createAssistantAgentHostEndpoint({
      surface: fakeSurface([]),
      host: host(),
      accessToken: "assistant_token",
      resourceDeliveries: resourceDeliveryPort({
        prepare: async () => ({
          kind: "assistant-host.resource-delivery",
          token: `wrd_${"c".repeat(43)}`,
          resourceId: "wrong_resource",
          sha256: "b".repeat(64),
          resourceKind: "image",
          mediaType: "image/png",
          sizeBytes: 1,
          purpose: "preview",
          expiresAt: 10_000,
        }),
      }),
      resourceDeliveryAudience: "authenticated_subject",
    });
    const malformed = createAssistantAgentHostClient(endpoint, {
      clientId: "assistant_malformed_resource",
      accessToken: "assistant_token",
    });
    await malformed.connect();
    await expect(malformed.prepareResourceDelivery({
      resourceId: "resource_image_1",
      expectedSha256: "b".repeat(64),
      purpose: "preview",
    })).rejects.toMatchObject({ code: "invalid_response" });
    malformed.close();
    endpoint.close();
  });
});

function resourceDeliveryPort(overrides: {
  readonly prepare?: ResourceDeliveryPort["prepare"];
  readonly revoke?: ResourceDeliveryPort["revoke"];
} = {}): ResourceDeliveryPort {
  return {
    prepare: overrides.prepare ?? (async () => {
      throw new Error("unexpected Resource delivery preparation");
    }),
    open: async () => {
      throw new Error("unexpected Resource delivery open");
    },
    revoke: overrides.revoke ?? (() => false),
    close() {},
    activeGrantCount: () => 0,
  };
}

function createEndpoint(surface: SurfaceAdapter) {
  return createAssistantAgentHostEndpoint({
    surface,
    host: host(),
    accessToken: "assistant_token",
  });
}

function host() {
  return {
    hostId: "assistant_host_test",
    instanceId: "assistant_instance_test",
    connectionKind: "in_process" as const,
    executionLocation: "local" as const,
  };
}

function createRawClient(endpoint: {
  send(value: unknown): Promise<unknown>;
  subscribe(listener: (event: AgentHostEvent) => void): () => void;
}) {
  let sequence = 0;
  return createAgentHostClient({
    send: async (request) => await endpoint.send(request),
    subscribe: (listener) => endpoint.subscribe(listener),
  }, () => `assistant_test_request_${++sequence}`);
}

async function connect(client: ReturnType<typeof createRawClient>): Promise<void> {
  await client.handshake({
    protocolVersion: 1,
    clientId: "assistant_client",
    accessToken: "assistant_token",
    requestedDomains: ["assistant"],
  });
}

function fakeSurface(calls: SurfaceCommandRequest[]): SurfaceAdapter {
  const listeners = new Set<(event: SurfaceEvent) => void>();
  let currentPage: SurfaceEventPage = {
    streamId: "assistant_surface_test",
    earliestSequence: 1,
    latestSequence: 1,
    gap: false,
    hasMore: false,
    events: [event()],
  };
  const descriptor: SurfaceDescriptor = {
    kind: "assistant.surface-descriptor",
    transport: "app-owned-ipc-or-api",
    commandCount: 4,
    rendererBoundary: {} as never,
    commands: [
      descriptorRow(SURFACE_COMMANDS.status, false),
      descriptorRow(SURFACE_COMMANDS.submitConversationOperation, true),
      descriptorRow(SURFACE_COMMANDS.prepareConversationAttachment, true),
      descriptorRow(SURFACE_COMMANDS.requestLocalPluginReview, true),
    ],
  };
  const fake = {
    descriptor: () => descriptor,
    async dispatchSurfaceCommand(request: SurfaceCommandRequest) {
      calls.push(request);
      const value = request.command === SURFACE_COMMANDS.status
        ? { kind: "assistant.status" }
        : request.command === SURFACE_COMMANDS.submitConversationOperation
          ? {
              kind: "assistant.conversation-operation.found",
              operation: { operationId: "assistant_operation_1" },
            }
          : { command: request.command };
      return {
        ok: true,
        command: request.command,
        value,
        event: event(),
      } as SurfaceEnvelope;
    },
    readSurfaceEvents(request?: Parameters<SurfaceAdapter["readSurfaceEvents"]>[0]) {
      return request?.afterSequence === 99
        ? { ...currentPage, gap: true, events: [] }
        : currentPage;
    },
    subscribeSurfaceEvents(listener: (value: SurfaceEvent) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: async () => undefined,
    emit(value: SurfaceEvent) {
      currentPage = { ...currentPage, events: [value] };
      for (const listener of listeners) listener(value);
    },
  };
  return fake as SurfaceAdapter;
}

function descriptorRow(command: keyof typeof SURFACE_COMMANDS extends never ? never : (typeof SURFACE_COMMANDS)[keyof typeof SURFACE_COMMANDS], mutatesState: boolean) {
  return { command, title: command, input: "none" as const, mutatesState };
}

function surfaceEmit(surface: SurfaceAdapter, value: SurfaceEvent): void {
  (surface as SurfaceAdapter & { emit(value: SurfaceEvent): void }).emit(value);
}

function event(): SurfaceEvent {
  return {
    id: "assistant_surface_test:1",
    sequence: 1,
    type: "assistant.surface.state_changed",
    command: SURFACE_COMMANDS.status,
    at: 1,
  };
}
