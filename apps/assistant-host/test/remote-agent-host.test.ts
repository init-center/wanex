import { describe, expect, it } from "vitest";
import type {
  Shell,
  SurfaceAdapter,
  SurfaceEvent,
} from "@wanex/assistant";
import {
  createRemoteAssistantAgentHostComposition,
  createRemoteAssistantAgentHostHandler,
} from "../src/agent-host/remote.js";

describe("remote Assistant Agent Host composition", () => {
  it("connects a typed client to an application-owned Assistant Host", async () => {
    const fixture = createFixture();
    const requests: Array<{
      readonly headers: Headers;
      readonly body: Record<string, unknown>;
    }> = [];
    const composition = await createRemoteAssistantAgentHostComposition({
      messageUrl: "https://assistant.example.test/v1/agent-host/message",
      getBearerToken: () => "subject-bearer",
      clientId: "remote-product-client",
      createRequestId: (() => {
        let sequence = 0;
        return () => `remote_request_${++sequence}`;
      })(),
      fetch: fakeFetch(fixture.handler, requests),
    });

    try {
      await expect(composition.client.readStatus()).resolves.toEqual({
        kind: "assistant.status",
        state: "ready",
      });
      await expect(
        composition.client.submitConversation({
          text: "hello from a remote product",
          idempotencyKey: "remote_submit_once",
        }),
      ).resolves.toEqual({ operationId: "remote_operation_1" });

      expect(requests[0]?.headers.get("authorization")).toBe(
        "Bearer subject-bearer",
      );
      expect(requests[0]?.body).toMatchObject({
        kind: "wanex.agent-host.handshake.request",
        clientId: "remote-product-client",
      });
      expect(requests[0]?.body.accessToken).not.toBe("subject-bearer");
      expect(requests[1]?.body).toMatchObject({
        kind: "wanex.agent-host.operation.request",
        operationKind: "read",
        operation: "assistant.surface.read",
      });
      expect(requests[2]?.body).toMatchObject({
        kind: "wanex.agent-host.operation.request",
        operation: "assistant.conversation.submit",
        idempotencyKey: "remote_submit_once",
        payload: { text: "hello from a remote product" },
      });
      expect(fixture.commandCalls).toEqual([
        {
          text: "hello from a remote product",
          idempotencyKey: "remote_submit_once",
        },
      ]);
    } finally {
      await composition.close();
      await composition.close();
      await fixture.handler.close();
    }
  });

  it("starts typed SSE observation explicitly and exposes canonical recovery", async () => {
    const fixture = createFixture();
    const requests: Array<{
      readonly headers: Headers;
      readonly body: Record<string, unknown>;
    }> = [];
    const composition = await createRemoteAssistantAgentHostComposition({
      messageUrl: "https://assistant.example.test/v1/agent-host/message",
      getBearerToken: () => "subject-bearer",
      clientId: "remote-event-client",
      fetch: fakeFetch(fixture.handler, requests),
    });
    const received: unknown[] = [];
    const states: string[] = [];
    const resets: string[] = [];
    composition.client.subscribe((event) => received.push(event));

    try {
      const stream = composition.startEvents({
        reconnectInitialDelayMs: 1,
        reconnectMaxDelayMs: 2,
        onStateChange: (state) => states.push(state),
        onCanonicalReadRequired: (reason) => resets.push(reason),
      });
      await stream.ready;
      fixture.emit(event(2));
      await waitFor(() => received.length === 1);

      expect(received[0]).toMatchObject({
        domain: "assistant",
        type: "assistant.surface.state_changed",
        sequence: 2,
      });
      expect(states).toContain("open");
      expect(resets).toEqual([]);

      stream.close();
      await stream.closed;
    } finally {
      await composition.close();
      await fixture.handler.close();
    }
  });

  it("derives the Assistant endpoint from the authenticated subject", async () => {
    const fixture = createFixture();
    const rejected = await fixture.handler.handle({
      method: "POST",
      path: "/v1/agent-host/message",
      headers: { authorization: "Bearer unknown" },
      body: {
        kind: "wanex.agent-host.handshake.request",
        protocolVersion: 1,
        clientId: "unknown-client",
        accessToken: "forged",
        requestedDomains: ["assistant"],
      },
      bodyBytes: 160,
    });

    expect(rejected.status).toBe(401);
    expect(rejected.body).toMatchObject({
      kind: "wanex.agent-host.error",
      error: { code: "unauthenticated" },
    });
    await fixture.handler.close();
  });

  it("rejects mixed domains before resolving the Assistant application", async () => {
    const fixture = createFixture();
    const rejected = await fixture.handler.handle({
      method: "POST",
      path: "/v1/agent-host/message",
      headers: { authorization: "Bearer subject-bearer" },
      body: {
        kind: "wanex.agent-host.handshake.request",
        protocolVersion: 1,
        clientId: "mixed-domain-client",
        accessToken: "client-only-value",
        requestedDomains: ["assistant", "coding"],
      },
      bodyBytes: 180,
    });

    expect(rejected.status).toBe(403);
    expect(rejected.body).toMatchObject({ error: { code: "unauthorized" } });
    expect(fixture.resolveCalls).toBe(0);
    await fixture.handler.close();
  });

  it("preserves an Assistant idempotency conflict at the remote client boundary", async () => {
    const fixture = createFixture(true);
    const composition = await createRemoteAssistantAgentHostComposition({
      messageUrl: "https://assistant.example.test/v1/agent-host/message",
      getBearerToken: () => "subject-bearer",
      clientId: "remote-conflict-client",
      fetch: fakeFetch(fixture.handler, []),
    });

    try {
      await expect(
        composition.client.submitConversation({
          text: "conflicting remote submission",
          idempotencyKey: "remote_conflict",
        }),
      ).rejects.toMatchObject({ code: "idempotency_conflict" });
    } finally {
      await composition.close();
      await fixture.handler.close();
    }
  });
});

function createFixture(rejectSubmit = false) {
  const commandCalls: unknown[] = [];
  let resolveCalls = 0;
  const surfaceFixture = createSurface();
  const surface = surfaceFixture.surface;
  const handler = createRemoteAssistantAgentHostHandler({
    authenticateBearerToken: async (token) =>
      token === "subject-bearer"
        ? { subjectId: "subject-1", expiresAt: Date.now() + 60_000 }
        : null,
    resolveAssistantHost: async (subject) => {
      resolveCalls += 1;
      return subject.subjectId === "subject-1"
        ? {
            surface,
            commands: createCommands(commandCalls, rejectSubmit),
            host: {
              hostId: "assistant-remote-host",
              instanceId: "assistant-remote-instance",
              connectionKind: "remote_tls",
              executionLocation: "remote",
            },
            grant: {
              subjectId: "subject-1",
              hostId: "assistant-remote-host",
              domains: ["assistant"],
              expiresAt: Date.now() + 60_000,
            },
          }
        : null;
    },
    createSessionId: () => "remote-session-1",
    createEndpointAccessToken: () => "endpoint-secret-1",
  });
  return {
    handler,
    surface,
    emit: surfaceFixture.emit,
    commandCalls,
    get resolveCalls() {
      return resolveCalls;
    },
  };
}

function createSurface(): {
  readonly surface: SurfaceAdapter;
  readonly emit: (event: SurfaceEvent) => void;
} {
  const listeners = new Set<(event: SurfaceEvent) => void>();
  const surface = {
    dispatchSurfaceCommand: async (request: { readonly command: string }) => ({
      ok: true,
      command: request.command,
      value:
        request.command === "status"
          ? { kind: "assistant.status", state: "ready" }
          : { command: request.command },
      event: event(1),
    }),
    readSurfaceEvents: () => ({
      streamId: "assistant_remote_surface",
      earliestSequence: 1,
      latestSequence: 1,
      gap: false,
      hasMore: false,
      events: [event(1)],
    }),
    subscribeSurfaceEvents: (listener: (event: SurfaceEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(value: SurfaceEvent) {
      for (const listener of listeners) listener(value);
    },
  };
  return {
    surface: surface as unknown as SurfaceAdapter,
    emit: surface.emit,
  };
}

function createCommands(calls: unknown[], rejectSubmit = false): Pick<
  Shell,
  | "submitConversationOperation"
  | "cancelTrackedConversationOperation"
  | "steerTrackedConversationOperation"
  | "resolveTrackedConversationApproval"
  | "resolveTrackedConversationRecovery"
> {
  const found = () => ({
    kind: "assistant.conversation-operation.found",
    operation: { operationId: "remote_operation_1" },
  }) as never;
  return {
    submitConversationOperation: async (input) => {
      calls.push(input);
      if (rejectSubmit) {
        return {
          kind: "assistant.conversation-operation.rejected",
          reason: "idempotency_conflict",
          message: "the idempotency key was already used for another request"
        } as never;
      }
      return found();
    },
    cancelTrackedConversationOperation: async () => found(),
    steerTrackedConversationOperation: async () => found(),
    resolveTrackedConversationApproval: async () => found(),
    resolveTrackedConversationRecovery: async () => found(),
  };
}

function fakeFetch(
  handler: ReturnType<typeof createRemoteAssistantAgentHostHandler>,
  requests: Array<{
    readonly headers: Headers;
    readonly body: Record<string, unknown>;
  }>,
): typeof globalThis.fetch {
  return (async (input, init = {}) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input.toString() : input.url,
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
        eventResult.body === undefined ? undefined : JSON.stringify(eventResult.body),
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

function event(sequence: number): SurfaceEvent {
  return {
    id: `assistant_remote_surface:${sequence}`,
    sequence,
    type: "assistant.surface.state_changed",
    command: "status",
    at: sequence,
  };
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
