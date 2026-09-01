import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createAgentHostClient,
  type AgentHostEvent,
} from "@wanex/protocol";
import type {
  CodingApplication,
  CodingApplicationEvent,
  CodingApplicationEventPage,
  ListCodingEventsRequest,
} from "../src/application/model.js";
import {
  createLocalAgentHostIpcClientTransport,
  listenLocalAgentHostIpc,
} from "@wanex/runtime/host";
import {
  CODING_AGENT_HOST_OPERATIONS,
  createCodingAgentHostClient,
  createCodingAgentHostComposition,
  createCodingAgentHostEndpoint,
} from "../src/host/agent-host/index.js";

describe("Coding Agent Host binding", () => {
  it("uses canonical coding reads and maps the envelope key to control requestId", async () => {
    const calls: Record<string, unknown>[] = [];
    const application = fakeApplication(calls);
    const endpoint = createCodingAgentHostEndpoint({
      application,
      host: {
        hostId: "coding_host_test",
        instanceId: "coding_instance_test",
        connectionKind: "in_process",
        executionLocation: "local",
      },
      accessToken: "coding_token",
    });
    const client = createClient(endpoint);
    await client.handshake({
      protocolVersion: 1,
      clientId: "coding_client",
      accessToken: "coding_token",
      requestedDomains: ["coding"],
    });

    await expect(
      client.read({
        domain: "coding",
        operation: CODING_AGENT_HOST_OPERATIONS.read,
        payload: { command: "project.list" },
      }),
    ).resolves.toMatchObject({
      outcome: "completed",
      result: [{ projectId: "project_1" }],
    });
    await expect(
      client.command({
        domain: "coding",
        operation: CODING_AGENT_HOST_OPERATIONS.proposalDecide,
        idempotencyKey: "proposal_decision_once",
        payload: {
          projectId: "project_1",
          proposalId: "proposal_1",
          decision: "approve",
          reason: "reviewed",
        },
      }),
    ).resolves.toMatchObject({ outcome: "completed", result: { action: "approve" } });
    await expect(
      client.command({
        domain: "coding",
        operation: CODING_AGENT_HOST_OPERATIONS.proposalApply,
        idempotencyKey: "proposal_apply_once",
        payload: {
          projectId: "project_1",
          proposalId: "proposal_1",
        },
      }),
    ).resolves.toMatchObject({
      outcome: "completed",
      result: { status: "applied" },
    });
    await expect(
      client.command({
        domain: "coding",
        operation: CODING_AGENT_HOST_OPERATIONS.proposalApply,
        idempotencyKey: "proposal_apply_outer",
        payload: {
          projectId: "project_1",
          proposalId: "proposal_1",
          idempotencyKey: "proposal_apply_inner",
        },
      }),
    ).resolves.toMatchObject({
      outcome: "failed",
      error: { code: "malformed_request" },
    });
    expect(calls).toEqual([
      {
        projectId: "project_1",
        proposalId: "proposal_1",
        decision: "approve",
        reason: "reviewed",
        requestId: "proposal_decision_once",
      },
      {
        projectId: "project_1",
        proposalId: "proposal_1",
      },
    ]);
  });

  it("exposes durable turn.start through the envelope key and rejects key smuggling", async () => {
    const calls: Record<string, unknown>[] = [];
    const endpoint = createCodingAgentHostEndpoint({
      application: fakeApplication(calls),
      host: {
        hostId: "coding_validation_host",
        instanceId: "coding_validation_instance",
        connectionKind: "in_process",
        executionLocation: "local",
      },
      accessToken: "coding_validation_token",
    });
    const client = createClient(endpoint);
    await client.handshake({
      protocolVersion: 1,
      clientId: "coding_validation_client",
      accessToken: "coding_validation_token",
      requestedDomains: ["coding"],
    });
    await expect(
      client.command({
        domain: "coding",
        operation: CODING_AGENT_HOST_OPERATIONS.turnStart,
        idempotencyKey: "turn_start_once",
        payload: { projectId: "project_1", content: [{ type: "text", text: "start" }] },
      }),
    ).resolves.toMatchObject({
      outcome: "completed",
      result: { turnId: "turn_1", state: "starting" },
    });
    await expect(
      client.command({
        domain: "coding",
        operation: CODING_AGENT_HOST_OPERATIONS.turnStart,
        idempotencyKey: "turn_start_second",
        payload: {
          projectId: "project_1",
          content: [{ type: "text", text: "start" }],
          idempotencyKey: "forged_key",
        },
      }),
    ).resolves.toMatchObject({
      outcome: "failed",
      error: { code: "malformed_request" },
    });
    await expect(
      client.command({
        domain: "coding",
        operation: CODING_AGENT_HOST_OPERATIONS.proposalUndo,
        idempotencyKey: "undo_once",
        payload: {
          projectId: "project_1",
          proposalId: "proposal_1",
          requestId: "forged_request_id",
        },
      }),
    ).resolves.toMatchObject({
      outcome: "failed",
      error: { code: "malformed_request" },
    });
    expect(calls).toEqual([
      {
        projectId: "project_1",
        content: [{ type: "text", text: "start" }],
        idempotencyKey: "turn_start_once",
      },
    ]);
  });

  it("projects events, replays them, and reports stream replacement", async () => {
    const application = fakeApplication([]);
    const endpoint = createCodingAgentHostEndpoint({
      application,
      host: {
        hostId: "coding_events_host",
        instanceId: "coding_events_instance",
        connectionKind: "in_process",
        executionLocation: "local",
      },
      accessToken: "coding_events_token",
    });
    const client = createClient(endpoint);
    await client.handshake({
      protocolVersion: 1,
      clientId: "coding_events_client",
      accessToken: "coding_events_token",
      requestedDomains: ["coding"],
    });
    const events: AgentHostEvent[] = [];
    client.subscribe((event) => events.push(event));
    emitCodingEvent(application);
    expect(events).toEqual([
      expect.objectContaining({
        domain: "coding",
        streamId: "coding:coding_stream_test",
        type: "project_invalidated:project_opened",
      }),
    ]);
    await expect(
      client.replay({
        streamId: "coding:missing_stream",
        afterSequence: 0,
        limit: 10,
      }),
    ).resolves.toMatchObject({
      outcome: "gap",
      gap: { reason: "stream_replaced", canonicalReadRequired: true },
    });
  });
  it("composes a typed local consumer and closes its event subscription", async () => {
    const application = fakeApplication([]);
    const composition = await createCodingAgentHostComposition({
      application,
      host: {
        hostId: "coding_composition_host",
        instanceId: "coding_composition_instance",
        connectionKind: "in_process",
        executionLocation: "local",
      },
      accessToken: "composition_token",
      clientId: "composition_client",
    });

    await expect(composition.client.listProjects()).resolves.toEqual([
      expect.objectContaining({ projectId: "project_1" }),
    ]);
    await expect(
      composition.client.startTurn({
        projectId: "project_1",
        idempotencyKey: "composition_start",
        content: [{ type: "text", text: "start from typed client" }],
      }),
    ).resolves.toMatchObject({ turnId: "turn_1", state: "starting" });
    const received: unknown[] = [];
    composition.client.subscribe((event) => received.push(event));
    emitCodingEvent(application);
    expect(received).toHaveLength(1);
    await expect(
      composition.client.replay({
        streamId: "coding:coding_stream_test",
        afterSequence: 0,
        limit: 10,
      }),
    ).resolves.toMatchObject({ outcome: "replayed" });
    await expect(
      composition.client.replay({
        streamId: "coding:missing_stream",
        afterSequence: 0,
        limit: 10,
      }),
    ).resolves.toMatchObject({
      outcome: "gap",
      gap: { canonicalReadRequired: true },
    });

    composition.close();
    composition.close();
    emitCodingEvent(application);
    expect(received).toHaveLength(1);
  });

  it("does not inject the host request id into turn cancellation input", async () => {
    const calls: Record<string, unknown>[] = [];
    const endpoint = createCodingAgentHostEndpoint({
      application: fakeApplication(calls),
      host: {
        hostId: "coding_cancel_host",
        instanceId: "coding_cancel_instance",
        connectionKind: "in_process",
        executionLocation: "local",
      },
      accessToken: "cancel_token",
    });
    const client = createClient(endpoint);
    await client.handshake({
      protocolVersion: 1,
      clientId: "cancel_client",
      accessToken: "cancel_token",
      requestedDomains: ["coding"],
    });

    await expect(
      client.command({
        domain: "coding",
        operation: CODING_AGENT_HOST_OPERATIONS.turnCancel,
        idempotencyKey: "cancel_once",
        payload: { projectId: "project_1", turnId: "turn_1", reason: "stop" },
      }),
    ).resolves.toMatchObject({ outcome: "completed" });
    expect(calls).toEqual([
      { projectId: "project_1", turnId: "turn_1", reason: "stop" },
    ]);
  });

  describe("Coding Agent Host over local IPC", () => {
    it("keeps typed durable start semantics across a real reconnect", async () => {
      const socketPath = await createLocalIpcAddress();
      const calls: Record<string, unknown>[] = [];
      const application = fakeApplication(calls);
      const server = await listenLocalAgentHostIpc({
        socketPath,
        createEndpoint: () =>
          createCodingAgentHostEndpoint({
            application,
            host: {
              hostId: "coding_local_ipc_host",
              instanceId: "coding_local_ipc_instance",
              connectionKind: "local_ipc",
              executionLocation: "local",
            },
            accessToken: "coding_local_ipc_token",
          }),
      });
      const firstTransport = createLocalAgentHostIpcClientTransport({ socketPath });
      const firstClient = createCodingAgentHostClient(firstTransport, {
        clientId: "coding_ipc_client_first",
        accessToken: "coding_local_ipc_token",
        createRequestId: requestIds("local-ipc-first"),
      });

      try {
        const request = {
          projectId: "project_1",
          idempotencyKey: "local-ipc-start-once",
          content: [{ type: "text" as const, text: "start over local IPC" }],
        };
        await firstClient.connect();
        const started = await firstClient.startTurn(request);
        expect(started).toMatchObject({ turnId: "turn_1", state: "starting" });
        await expect(
          firstClient.replay({
            streamId: "coding:missing_stream",
            afterSequence: 0,
            limit: 10,
          }),
        ).resolves.toMatchObject({
          outcome: "gap",
          gap: { reason: "stream_replaced", canonicalReadRequired: true },
        });
        await expect(firstClient.listProjects()).resolves.toEqual([
          expect.objectContaining({ projectId: "project_1" }),
        ]);
        firstClient.close();
        await firstTransport.close();

        const secondTransport = createLocalAgentHostIpcClientTransport({ socketPath });
        const secondClient = createCodingAgentHostClient(secondTransport, {
          clientId: "coding_ipc_client_second",
          accessToken: "coding_local_ipc_token",
          createRequestId: requestIds("local-ipc-second"),
        });
        try {
          await secondClient.connect();
          await expect(secondClient.startTurn(request)).resolves.toMatchObject({
            turnId: started.turnId,
            sessionId: started.sessionId,
          });
          await expect(
            secondClient.startTurn({
              ...request,
              content: [{ type: "text", text: "conflicting local IPC retry" }],
            }),
          ).rejects.toMatchObject({ code: "application_failure" });
          expect(calls).toHaveLength(1);
        } finally {
          secondClient.close();
          await secondTransport.close();
        }
      } finally {
        await server.close();
      }
    });
  });
});

function createClient(endpoint: { send: (value: unknown) => Promise<unknown>; subscribe: (listener: (event: AgentHostEvent) => void) => () => void }) {
  let sequence = 0;
  return createAgentHostClient(
    {
      send: async (request) => await endpoint.send(request),
      subscribe: (listener) => endpoint.subscribe(listener),
    },
    () => `coding_test_request_${++sequence}`,
  );
}

function requestIds(prefix: string): () => string {
  let sequence = 0;
  return () => `${prefix}_request_${++sequence}`;
}

async function createLocalIpcAddress(): Promise<string> {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\wanex-coding-${randomUUID()}`;
  }
  const directory = await mkdtemp(join(tmpdir(), "wanex-coding-host-ipc-"));
  return join(directory, "host.sock");
}

function fakeApplication(calls: Record<string, unknown>[]): CodingApplication {
  const listeners = new Set<(event: CodingApplicationEvent) => void>();
  const startedTurns = new Map<string, Record<string, unknown>>();
  const page: CodingApplicationEventPage = {
    streamId: "coding_stream_test",
    events: [codingEvent()],
    firstRetainedSequence: 1,
    lastSequence: 1,
    gap: false,
    hasMore: false,
  };
  return {
    state: "open",
    listProjects: async () => [
      {
        projectId: "project_1",
        name: "Project",
        state: "ready",
        openedAt: 1,
        recovery: {
          transactionAttention: false,
          taskAttentionCount: 0,
          taskFailureCount: 0,
          moreTasksPending: false,
        },
      },
    ],
    startTurn: async (
      request: Parameters<CodingApplication["startTurn"]>[0],
    ) => {
      const existing = startedTurns.get(request.idempotencyKey);
      if (existing !== undefined) {
        if (JSON.stringify(existing.input) !== JSON.stringify(request.content)) {
          throw new Error("coding Turn idempotency key was reused with different input");
        }
        return existing.result as never;
      }
      const result = codingTurn(request.projectId, "turn_1");
      calls.push(request as unknown as Record<string, unknown>);
      startedTurns.set(request.idempotencyKey, { input: request.content, result });
      return result as never;
    },
    decideProposal: async (
      request: Parameters<CodingApplication["decideProposal"]>[0],
    ) => {
      calls.push(request as unknown as Record<string, unknown>);
      return { action: "approve" } as never;
    },
    applyProposal: async (
      request: Parameters<CodingApplication["applyProposal"]>[0],
    ) => {
      calls.push(request as unknown as Record<string, unknown>);
      return { status: "applied" } as never;
    },
    cancelTurn: async (
      request: Parameters<CodingApplication["cancelTurn"]>[0],
    ) => {
      calls.push(request as unknown as Record<string, unknown>);
      return { kind: "cancelled" } as never;
    },
    readEvents: async (request: ListCodingEventsRequest = {}) =>
      request.streamId === "missing_stream" ? { ...page, gap: true, events: [] } : page,
    subscribe: (
      listener: Parameters<CodingApplication["subscribe"]>[0],
    ) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    __emit: (event: CodingApplicationEvent) => {
      for (const listener of listeners) listener(event);
    },
  } as unknown as CodingApplication;
}

function emitCodingEvent(application: CodingApplication): void {
  (application as unknown as { __emit: (event: CodingApplicationEvent) => void }).__emit(
    codingEvent(),
  );
}

function codingEvent(): CodingApplicationEvent {
  return {
    kind: "project_invalidated",
    streamId: "coding_stream_test",
    sequence: 1,
    occurredAt: 1,
    projectId: "project_1",
    reason: "project_opened",
  };
}

function codingTurn(projectId: string, turnId: string): Record<string, unknown> {
  return {
    projectId,
    sessionId: "session_1",
    turnId,
    state: "starting",
    createdAt: 1,
    updatedAt: 1,
    canCancel: true,
    approvals: {
      totalCount: 0,
      returnedCount: 0,
      omittedCount: 0,
      items: [],
    },
    recovery: {
      totalCount: 0,
      returnedCount: 0,
      omittedCount: 0,
      items: [],
    },
  };
}
