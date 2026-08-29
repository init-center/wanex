import { describe, expect, it } from "vitest";
import {
  createAgentHostClient,
  type AgentHostEvent,
  type AgentHostEventPage,
} from "@wanex/protocol";
import type {
  Shell,
  SurfaceAdapter,
  SurfaceCommandRequest,
  SurfaceEnvelope,
  SurfaceEvent,
  SurfaceEventPage,
} from "@wanex/assistant";
import {
  createAssistantAgentHostEndpoint,
  createAssistantAgentHostComposition,
  ASSISTANT_AGENT_HOST_OPERATIONS,
} from "../src/agent-host/index.js";

describe("Assistant Agent Host binding", () => {
  it("uses canonical Surface reads and forwards the envelope idempotency key", async () => {
    const calls: unknown[] = [];
    const surface = fakeSurface(calls);
    const endpoint = createAssistantAgentHostEndpoint({
      surface,
      commands: fakeCommands(calls),
      host: {
        hostId: "assistant_host_test",
        instanceId: "assistant_instance_test",
        connectionKind: "in_process",
        executionLocation: "local",
      },
      accessToken: "assistant_token",
    });
    const client = createClient(endpoint);

    await client.handshake({
      protocolVersion: 1,
      clientId: "assistant_client",
      accessToken: "assistant_token",
      requestedDomains: ["assistant"],
    });
    await expect(
      client.read({
        domain: "assistant",
        operation: ASSISTANT_AGENT_HOST_OPERATIONS.surfaceRead,
        payload: { command: "status" },
      }),
    ).resolves.toMatchObject({
      outcome: "completed",
      result: { command: "status" },
    });

    await expect(
      client.command({
        domain: "assistant",
        operation: ASSISTANT_AGENT_HOST_OPERATIONS.conversationSubmit,
        idempotencyKey: "assistant_submit_once",
        payload: { text: "hello" },
      }),
    ).resolves.toMatchObject({
      outcome: "accepted",
      operationId: "assistant_operation_1",
    });
    expect(calls).toEqual([
      {
        command: "status",
        requestId: expect.any(String),
      },
      {
        command: "submitConversationOperation",
        input: { text: "hello", idempotencyKey: "assistant_submit_once" },
      },
    ]);
  });

  it("rejects unexposed reads and malformed payloads before Surface invocation", async () => {
    const calls: unknown[] = [];
    const endpoint = createAssistantAgentHostEndpoint({
      surface: fakeSurface(calls),
      commands: fakeCommands(calls),
      host: {
        hostId: "assistant_validation_host",
        instanceId: "assistant_validation_instance",
        connectionKind: "in_process",
        executionLocation: "local",
      },
      accessToken: "validation_token",
    });
    const client = createClient(endpoint);
    await client.handshake({
      protocolVersion: 1,
      clientId: "validation_client",
      accessToken: "validation_token",
      requestedDomains: ["assistant"],
    });

    await expect(
      client.read({
        domain: "assistant",
        operation: ASSISTANT_AGENT_HOST_OPERATIONS.surfaceRead,
        payload: { command: "submitConversationOperation" },
      }),
    ).resolves.toMatchObject({
      outcome: "failed",
      error: { code: "unauthorized" },
    });
    await expect(
      client.command({
        domain: "assistant",
        operation: ASSISTANT_AGENT_HOST_OPERATIONS.conversationCancel,
        idempotencyKey: "cancel_once",
        payload: { reason: "stop", idempotencyKey: "forged" },
      }),
    ).resolves.toMatchObject({
      outcome: "failed",
      error: { code: "malformed_request" },
    });
    expect(calls).toHaveLength(0);
  });

  it("forwards one stable idempotency key to every exposed conversation control", async () => {
    const calls: unknown[] = [];
    const endpoint = createAssistantAgentHostEndpoint({
      surface: fakeSurface(calls),
      commands: fakeCommands(calls),
      host: {
        hostId: "assistant_controls_host",
        instanceId: "assistant_controls_instance",
        connectionKind: "in_process",
        executionLocation: "local",
      },
      accessToken: "controls_token",
    });
    const client = createClient(endpoint);
    await client.handshake({
      protocolVersion: 1,
      clientId: "controls_client",
      accessToken: "controls_token",
      requestedDomains: ["assistant"],
    });

    for (const [operation, idempotencyKey, payload] of [
      [
        ASSISTANT_AGENT_HOST_OPERATIONS.conversationSteer,
        "steer_once",
        { operationId: "operation_1", text: "focus" },
      ],
      [
        ASSISTANT_AGENT_HOST_OPERATIONS.conversationApprovalResolve,
        "approval_once",
        {
          approvalId: "approval_1",
          expectedApprovalRevision: 1,
          decision: "approve_once",
          reason: "reviewed",
        },
      ],
      [
        ASSISTANT_AGENT_HOST_OPERATIONS.conversationRecoveryResolve,
        "recovery_once",
        {
          recoveryId: "recovery_1",
          expectedRecoveryRevision: 1,
          decision: "retry",
          reason: "retry safely",
        },
      ],
    ] as const) {
      await expect(
        client.command({
          domain: "assistant",
          operation,
          idempotencyKey,
          payload,
        }),
      ).resolves.toMatchObject({ outcome: "completed" });
    }
    expect(calls).toEqual([
      {
        command: "steerTrackedConversationOperation",
        input: {
          operationId: "operation_1",
          text: "focus",
          requestId: expect.any(String),
          idempotencyKey: "steer_once",
        },
      },
      {
        command: "resolveTrackedConversationApproval",
        input: {
          approvalId: "approval_1",
          expectedApprovalRevision: 1,
          decision: "approve_once",
          reason: "reviewed",
          idempotencyKey: "approval_once",
        },
      },
      {
        command: "resolveTrackedConversationRecovery",
        input: {
          recoveryId: "recovery_1",
          expectedRecoveryRevision: 1,
          decision: "retry",
          reason: "retry safely",
          idempotencyKey: "recovery_once",
        },
      },
    ]);
  });

  it("projects live events and turns a replay gap into a canonical-read requirement", async () => {
    const surface = fakeSurface([]);
    const endpoint = createAssistantAgentHostEndpoint({
      surface,
      commands: fakeCommands([]),
      host: {
        hostId: "assistant_events_host",
        instanceId: "assistant_events_instance",
        connectionKind: "in_process",
        executionLocation: "local",
      },
      accessToken: "events_token",
    });
    const client = createClient(endpoint);
    await client.handshake({
      protocolVersion: 1,
      clientId: "events_client",
      accessToken: "events_token",
      requestedDomains: ["assistant"],
    });
    const received: AgentHostEvent[] = [];
    client.subscribe((event) => received.push(event));

    surfaceEmit(surface, event());
    await expect(received).toEqual([
      expect.objectContaining({
        domain: "assistant",
        streamId: "assistant:assistant_surface_test",
        sequence: 1,
        type: "assistant.surface.state_changed",
      }),
    ]);
    await expect(
      client.replay({
        streamId: "assistant:assistant_surface_test",
        afterSequence: 0,
        limit: 10,
      }),
    ).resolves.toMatchObject({
      outcome: "replayed",
      page: { streamId: "assistant:assistant_surface_test", latestSequence: 1 },
    });
    await expect(
      client.replay({
        streamId: "assistant:assistant_surface_test",
        afterSequence: 99,
        limit: 10,
      }),
    ).resolves.toMatchObject({
      outcome: "gap",
      gap: { reason: "cursor_before_window", canonicalReadRequired: true },
    });
  });

  it("does not grant the coding domain during handshake", async () => {
    const endpoint = createAssistantAgentHostEndpoint({
      surface: fakeSurface([]),
      commands: fakeCommands([]),
      host: {
        hostId: "assistant_domain_host",
        instanceId: "assistant_domain_instance",
        connectionKind: "in_process",
        executionLocation: "local",
      },
      accessToken: "domain_token",
    });
    const client = createClient(endpoint);
    await expect(
      client.handshake({
        protocolVersion: 1,
        clientId: "domain_client",
        accessToken: "domain_token",
        requestedDomains: ["coding"],
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("composes a typed local consumer and closes its event subscription", async () => {
    const surface = fakeSurface([], true);
    const composition = await createAssistantAgentHostComposition({
      surface,
      commands: fakeCommands([]),
      host: {
        hostId: "assistant_composition_host",
        instanceId: "assistant_composition_instance",
        connectionKind: "in_process",
        executionLocation: "local",
      },
      accessToken: "composition_token",
      clientId: "composition_client",
    });

    await expect(composition.client.readStatus()).resolves.toMatchObject({
      kind: "assistant.status",
    });
    await expect(
      composition.client.submitConversation({
        text: "hello from typed client",
        idempotencyKey: "typed_submit_once",
      }),
    ).resolves.toEqual({ operationId: "assistant_operation_1" });

    const received: unknown[] = [];
    composition.client.subscribe((event) => received.push(event));
    surfaceEmit(surface, event());
    expect(received).toHaveLength(1);
    await expect(
      composition.client.replay({
        streamId: "assistant:assistant_surface_test",
        afterSequence: 0,
        limit: 10,
      }),
    ).resolves.toMatchObject({ outcome: "replayed" });
    await expect(
      composition.client.replay({
        streamId: "assistant:assistant_surface_test",
        afterSequence: 99,
        limit: 10,
      }),
    ).resolves.toMatchObject({
      outcome: "gap",
      gap: { canonicalReadRequired: true },
    });

    composition.close();
    composition.close();
    surfaceEmit(surface, event());
    expect(received).toHaveLength(1);
  });
});

function createClient(endpoint: { send: (value: unknown) => Promise<unknown>; subscribe: (listener: (event: AgentHostEvent) => void) => () => void }) {
  let sequence = 0;
  return createAgentHostClient(
    {
      send: async (request) => await endpoint.send(request),
      subscribe: (listener) => endpoint.subscribe(listener),
    },
    () => `assistant_test_request_${++sequence}`,
  );
}

function fakeSurface(calls: unknown[], typed = false): SurfaceAdapter {
  const listeners = new Set<(event: SurfaceEvent) => void>();
  let currentPage: SurfaceEventPage = {
    streamId: "assistant_surface_test",
    earliestSequence: 1,
    latestSequence: 1,
    gap: false,
    hasMore: false,
    events: [event()],
  };
  const fake = {
    descriptor: () => ({}) as never,
    dispatchSurfaceCommand: async (
      request: SurfaceCommandRequest,
    ) => {
      calls.push(request);
      const value =
        request.command === "submitConversationOperation"
          ? {
              kind: "assistant.conversation-operation.found",
              operation: { operationId: "assistant_operation_1" },
            }
          : typed && request.command === "status"
            ? { kind: "assistant.status" }
            : { command: request.command };
      return {
        ok: true,
        command: request.command,
        value,
        event: event(),
      } as SurfaceEnvelope;
    },
    readSurfaceEvents: (
      request?: Parameters<SurfaceAdapter["readSurfaceEvents"]>[0],
    ) => {
      if (request?.afterSequence === 99) {
        return { ...currentPage, gap: true, events: [] };
      }
      return currentPage;
    },
    subscribeSurfaceEvents: (
      listener: Parameters<SurfaceAdapter["subscribeSurfaceEvents"]>[0],
    ) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: async () => undefined,
    emit: (value: SurfaceEvent) => {
      currentPage = { ...currentPage, events: [value] };
      for (const listener of listeners) listener(value);
    },
  };
  return fake as unknown as SurfaceAdapter;
}

function fakeCommands(calls: unknown[]): Pick<
  Shell,
  | "submitConversationOperation"
  | "cancelTrackedConversationOperation"
  | "steerTrackedConversationOperation"
  | "resolveTrackedConversationApproval"
  | "resolveTrackedConversationRecovery"
> {
  const found = () => ({
    kind: "assistant.conversation-operation.found",
    operation: { operationId: "assistant_operation_1" },
  }) as never;
  return {
    submitConversationOperation: async (input) => {
      calls.push({ command: "submitConversationOperation", input });
      return found();
    },
    cancelTrackedConversationOperation: async (input) => {
      calls.push({ command: "cancelTrackedConversationOperation", input });
      return found();
    },
    steerTrackedConversationOperation: async (input) => {
      calls.push({ command: "steerTrackedConversationOperation", input });
      return found();
    },
    resolveTrackedConversationApproval: async (input) => {
      calls.push({ command: "resolveTrackedConversationApproval", input });
      return found();
    },
    resolveTrackedConversationRecovery: async (input) => {
      calls.push({ command: "resolveTrackedConversationRecovery", input });
      return found();
    },
  };
}

function surfaceEmit(surface: SurfaceAdapter, value: SurfaceEvent): void {
  (surface as unknown as { emit: (event: SurfaceEvent) => void }).emit(value);
}

function event(): SurfaceEvent {
  return {
    id: "assistant_surface_test:1",
    sequence: 1,
    type: "assistant.surface.state_changed",
    command: "status",
    at: 1,
  };
}
