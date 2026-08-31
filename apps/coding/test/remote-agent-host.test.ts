import { describe, expect, it } from "vitest";
import type {
  CodingApplication,
  CodingApplicationEvent,
  CodingApplicationEventPage,
  CodingProjectReadModel,
  CodingTurnReadModel,
} from "../src/application/model.js";
import {
  createRemoteCodingAgentHostComposition,
  createRemoteCodingAgentHostHandler,
} from "../src/host/agent-host/index.js";

describe("remote Coding Agent Host composition", () => {
  it("connects a typed client without exposing the endpoint secret", async () => {
    const fixture = createFixture();
    const requests: Array<{
      readonly headers: Headers;
      readonly body: Record<string, unknown>;
    }> = [];
    const composition = await createRemoteCodingAgentHostComposition({
      messageUrl: "https://coding.example.test/v1/agent-host/message",
      getBearerToken: () => "coding-bearer",
      clientId: "remote-coding-client",
      createRequestId: requestIds("remote-coding"),
      fetch: fakeFetch(fixture.handler, requests),
    });

    try {
      await expect(composition.client.listProjects()).resolves.toEqual([
        expect.objectContaining({ projectId: "project-1" }),
      ]);
      const request = {
        projectId: "project-1",
        sessionId: "session-1",
        content: [{ type: "text" as const, text: "remote coding" }],
        idempotencyKey: "remote-turn-once",
      };
      const first = await composition.client.startTurn(request);
      const second = await composition.client.startTurn(request);

      expect(first).toEqual(second);
      expect(fixture.startCalls).toHaveLength(1);
      expect(requests[0]?.headers.get("authorization")).toBe(
        "Bearer coding-bearer",
      );
      expect(requests[0]?.body).toMatchObject({
        kind: "wanex.agent-host.handshake.request",
        clientId: "remote-coding-client",
        requestedDomains: ["coding"],
      });
      expect(requests[0]?.body.accessToken).not.toBe("coding-bearer");
      expect(requests.at(-1)?.body).toMatchObject({
        kind: "wanex.agent-host.operation.request",
        operation: "coding.turn.start",
        idempotencyKey: "remote-turn-once",
        payload: {
          projectId: "project-1",
          content: [{ type: "text", text: "remote coding" }],
        },
      });
      expect(JSON.stringify(requests)).not.toContain("endpoint-secret");
    } finally {
      await composition.close();
      await composition.close();
      await fixture.handler.close();
    }
  });

  it("resolves Coding only for the authenticated subject", async () => {
    const fixture = createFixture();
    const unknown = await fixture.handler.handle({
      method: "POST",
      path: "/v1/agent-host/message",
      headers: { authorization: "Bearer unknown" },
      body: {
        kind: "wanex.agent-host.handshake.request",
        protocolVersion: 1,
        clientId: "unknown-client",
        accessToken: "forged",
        requestedDomains: ["coding"],
      },
      bodyBytes: 160,
    });
    expect(unknown.status).toBe(401);

    const other = await fixture.handler.handle({
      method: "POST",
      path: "/v1/agent-host/message",
      headers: { authorization: "Bearer other-bearer" },
      body: {
        kind: "wanex.agent-host.handshake.request",
        protocolVersion: 1,
        clientId: "other-client",
        accessToken: "forged",
        requestedDomains: ["coding"],
      },
      bodyBytes: 160,
    });
    expect(other.status).toBe(403);
    expect(other.body).toMatchObject({
      kind: "wanex.agent-host.error",
      error: { code: "unauthorized" },
    });

    await fixture.handler.close();
  });

  it("rejects request-id and idempotency-key smuggling at the remote boundary", async () => {
    const fixture = createFixture();
    const handshake = await fixture.handler.handle({
      method: "POST",
      path: "/v1/agent-host/message",
      headers: { authorization: "Bearer coding-bearer" },
      body: {
        kind: "wanex.agent-host.handshake.request",
        protocolVersion: 1,
        clientId: "validation-client",
        accessToken: "client-only-secret",
        requestedDomains: ["coding"],
      },
      bodyBytes: 180,
    });
    const sessionId = handshake.headers["x-wanex-host-session"];
    expect(sessionId).toBeTruthy();

    try {
      await expect(
        fixture.handler.handle({
          method: "POST",
          path: "/v1/agent-host/message",
          headers: {
            authorization: "Bearer coding-bearer",
            "x-wanex-host-session": sessionId,
          },
          body: {
            kind: "wanex.agent-host.operation.request",
            operationKind: "command",
            requestId: "request-1",
            idempotencyKey: "outer-key",
            domain: "coding",
            operation: "coding.turn.start",
            payload: {
              projectId: "project-1",
              content: [{ type: "text", text: "smuggled" }],
              idempotencyKey: "forged-key",
            },
          },
          bodyBytes: 300,
        }),
      ).resolves.toMatchObject({
        status: 200,
        body: {
          kind: "wanex.agent-host.operation.response",
          outcome: "failed",
          error: { code: "malformed_request" },
        },
      });

      await expect(
        fixture.handler.handle({
          method: "POST",
          path: "/v1/agent-host/message",
          headers: {
            authorization: "Bearer coding-bearer",
            "x-wanex-host-session": sessionId,
          },
          body: {
            kind: "wanex.agent-host.operation.request",
            operationKind: "command",
            requestId: "request-2",
            idempotencyKey: "outer-key-2",
            domain: "coding",
            operation: "coding.proposal.undo",
            payload: {
              projectId: "project-1",
              proposalId: "proposal-1",
              requestId: "forged-request-id",
            },
          },
          bodyBytes: 300,
        }),
      ).resolves.toMatchObject({
        status: 200,
        body: {
          kind: "wanex.agent-host.operation.response",
          outcome: "failed",
          error: { code: "malformed_request" },
        },
      });
      expect(fixture.startCalls).toHaveLength(0);
    } finally {
      await fixture.handler.close();
    }
  });

  it("exposes typed SSE events, canonical recovery, and idempotent shutdown", async () => {
    const fixture = createFixture();
    const requests: Array<{
      readonly headers: Headers;
      readonly body: Record<string, unknown>;
    }> = [];
    const composition = await createRemoteCodingAgentHostComposition({
      messageUrl: "https://coding.example.test/v1/agent-host/message",
      getBearerToken: () => "coding-bearer",
      clientId: "remote-coding-events",
      fetch: fakeFetch(fixture.handler, requests),
    });
    const received: unknown[] = [];
    const resets: string[] = [];
    composition.client.subscribe((event) => received.push(event));

    try {
      const stream = composition.startEvents({
        reconnectInitialDelayMs: 1,
        reconnectMaxDelayMs: 2,
        onCanonicalReadRequired: (reason) => resets.push(reason),
      });
      await stream.ready;
      fixture.emit(event(1));
      await waitFor(() => received.length === 1);

      expect(received[0]).toMatchObject({
        domain: "coding",
        type: "project_invalidated:project_opened",
        sequence: 1,
        payload: { projectId: "project-1" },
      });

      fixture.emit(event(3));
      await stream.closed;
      expect(resets).toEqual(["gap"]);
      await expect(composition.close()).resolves.toBeUndefined();
      await expect(composition.close()).resolves.toBeUndefined();
    } finally {
      await composition.close();
      await fixture.handler.close();
    }
  });
});

function createFixture() {
  const startCalls: Record<string, unknown>[] = [];
  const listeners = new Set<(event: CodingApplicationEvent) => void>();
  const application = createApplication(startCalls, listeners);
  const handler = createRemoteCodingAgentHostHandler({
    authenticateBearerToken: async (token) => {
      if (token === "coding-bearer") {
        return { subjectId: "coding-subject", expiresAt: Date.now() + 60_000 };
      }
      if (token === "other-bearer") {
        return { subjectId: "other-subject", expiresAt: Date.now() + 60_000 };
      }
      return null;
    },
    resolveCodingHost: async (subject) =>
      subject.subjectId === "coding-subject"
        ? {
            application,
            host: {
              hostId: "coding-remote-host",
              instanceId: "coding-remote-instance",
              connectionKind: "remote_tls",
              executionLocation: "remote",
            },
            grant: {
              subjectId: "coding-subject",
              hostId: "coding-remote-host",
              domains: ["coding"],
              expiresAt: Date.now() + 60_000,
            },
          }
        : null,
    createSessionId: () => "coding-session-secret",
    createEndpointAccessToken: () => "endpoint-secret",
  });
  return {
    handler,
    startCalls,
    emit(value: CodingApplicationEvent) {
      for (const listener of listeners) listener(value);
    },
  };
}

function createApplication(
  startCalls: Record<string, unknown>[],
  listeners: Set<(event: CodingApplicationEvent) => void>,
): CodingApplication {
  const projects: readonly CodingProjectReadModel[] = [
    {
      projectId: "project-1",
      name: "Remote Project",
      state: "ready",
      openedAt: 1,
      recovery: {
        transactionAttention: false,
        taskAttentionCount: 0,
        taskFailureCount: 0,
        moreTasksPending: false,
      },
    },
  ];
  const turns = new Map<string, CodingTurnReadModel>();
  return {
    state: "open",
    listProjects: async () => projects,
    startTurn: async (
      request: Parameters<CodingApplication["startTurn"]>[0],
    ) => {
      const existing = turns.get(request.idempotencyKey);
      if (existing !== undefined) return existing;
      const result = turn(request.projectId);
      turns.set(request.idempotencyKey, result);
      startCalls.push(request as unknown as Record<string, unknown>);
      return result;
    },
    readEvents: async (): Promise<CodingApplicationEventPage> => ({
      streamId: "coding-stream",
      events: [],
      firstRetainedSequence: 1,
      lastSequence: 0,
      gap: false,
      hasMore: false,
    }),
    subscribe: (
      listener: Parameters<CodingApplication["subscribe"]>[0],
    ) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as CodingApplication;
}

function turn(projectId: string): CodingTurnReadModel {
  return {
    projectId,
    sessionId: "session-1",
    turnId: "turn-1",
    state: "starting",
    createdAt: 1,
    updatedAt: 1,
    canCancel: true,
    approvals: { totalCount: 0, returnedCount: 0, omittedCount: 0, items: [] },
    recovery: { totalCount: 0, returnedCount: 0, omittedCount: 0, items: [] },
  };
}

function event(sequence: number): CodingApplicationEvent {
  return {
    kind: "project_invalidated",
    streamId: "coding-stream",
    sequence,
    occurredAt: sequence,
    projectId: "project-1",
    reason: "project_opened",
  };
}

function fakeFetch(
  handler: ReturnType<typeof createRemoteCodingAgentHostHandler>,
  requests: Array<{
    readonly headers: Headers;
    readonly body: Record<string, unknown>;
  }>,
): typeof globalThis.fetch {
  return (async (input, init = {}) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL
        ? input.toString()
        : input.url,
    );
    const headers = new Headers(init.headers);
    if (url.pathname === "/v1/agent-host/message") {
      const text = typeof init.body === "string" ? init.body : "{}";
      const body = JSON.parse(text) as Record<string, unknown>;
      requests.push({ headers, body });
      const result = await handler.handle({
        method: init.method ?? "POST",
        path: url.pathname,
        headers: Object.fromEntries(headers.entries()),
        body,
        bodyBytes: Buffer.byteLength(text),
      });
      return new Response(JSON.stringify(result.body), {
        status: result.status,
        headers: result.headers,
      });
    }

    const eventResult = await handler.openEventStream({
      method: init.method ?? "GET",
      path: url.pathname,
      headers: Object.fromEntries(headers.entries()),
    });
    if (eventResult.stream === undefined) {
      return new Response(
        eventResult.body === undefined
          ? undefined
          : JSON.stringify(eventResult.body),
        { status: eventResult.status, headers: eventResult.headers },
      );
    }

    const encoder = new TextEncoder();
    const stream = eventResult.stream;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        init.signal?.addEventListener("abort", () => stream.close(), {
          once: true,
        });
        void (async () => {
          try {
            for await (const frame of stream.frames) {
              const data = JSON.stringify(frame.data);
              controller.enqueue(
                encoder.encode(
                  `${frame.id === undefined ? "" : `id: ${frame.id}\n`}event: ${frame.event}\ndata: ${data}\n\n`,
                ),
              );
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        })();
      },
      cancel() {
        stream.close();
      },
    });
    return new Response(body, {
      status: eventResult.status,
      headers: {
        ...eventResult.headers,
        "content-type": "text/event-stream; charset=utf-8",
      },
    });
  }) as typeof globalThis.fetch;
}

function requestIds(prefix: string): () => string {
  let sequence = 0;
  return () => `${prefix}-request-${++sequence}`;
}

function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error("test condition timed out"));
        return;
      }
      setTimeout(check, 1);
    };
    check();
  });
}
