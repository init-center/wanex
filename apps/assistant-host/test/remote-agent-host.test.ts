import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type {
  SurfaceAdapter,
  SurfaceCommandRequest,
  SurfaceEvent,
} from "@wanex/assistant";
import { createController } from "@wanex/assistant-ui";
import {
  createRemoteAssistantAgentHostComposition,
  createRemoteAssistantAgentHostHandler,
} from "../src/agent-host/remote.js";
import { startAssistantHost } from "../src/application/index.js";
import type { ResourceDeliveryPort } from "../src/resources/model.js";

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
);

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
      await expect(composition.client.status()).resolves.toMatchObject({
        ok: true,
        value: { kind: "assistant.status", state: "ready" },
      });
      await expect(
        composition.client.submitConversationOperation({
          text: "hello from a remote product",
          idempotencyKey: "remote_submit_once",
        }),
      ).resolves.toMatchObject({
        ok: true,
        value: {
          kind: "assistant.conversation-operation.found",
          operation: { operationId: "remote_operation_1" },
        },
      });

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
        operation: "assistant.surface.dispatch",
      });
      expect(requests[2]?.body).toMatchObject({
        kind: "wanex.agent-host.operation.request",
        operation: "assistant.surface.dispatch",
        payload: {
          command: "submitConversationOperation",
          input: {
            text: "hello from a remote product",
            idempotencyKey: "remote_submit_once",
          },
        },
      });
      expect(fixture.commandCalls).toEqual([
        {
          command: "status",
        },
        {
          command: "submitConversationOperation",
          input: {
            text: "hello from a remote product",
            idempotencyKey: "remote_submit_once",
          },
        },
      ]);
    } finally {
      await composition.close();
      await composition.close();
      await fixture.handler.close();
    }
  });

  it("binds remote Resource delivery grants to the authenticated subject", async () => {
    const sha256 = "d".repeat(64);
    const token = `wrd_${"e".repeat(43)}`;
    const prepare = vi.fn<ResourceDeliveryPort["prepare"]>(async (request) => ({
      kind: "assistant-host.resource-delivery",
      token,
      resourceId: request.resourceId,
      sha256: request.expectedSha256,
      resourceKind: "image",
      mediaType: "image/png",
      sizeBytes: 256,
      purpose: request.purpose,
      ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
      expiresAt: Date.now() + 60_000,
    }));
    const revoke = vi.fn(() => true);
    const resourceDeliveries: ResourceDeliveryPort = {
      prepare,
      open: async () => {
        throw new Error("remote Agent Host must not carry Resource bytes");
      },
      revoke,
      close() {},
      activeGrantCount: () => 0,
    };
    const surface = createSurface([], false).surface;
    const handler = createRemoteAssistantAgentHostHandler({
      authenticateBearerToken: async (bearer) =>
        bearer === "resource-bearer"
          ? { subjectId: "authenticated-resource-subject", expiresAt: Date.now() + 60_000 }
          : null,
      resolveAssistantHost: async () => ({
        surface,
        resourceDeliveries,
        host: {
          hostId: "resource-remote-host",
          instanceId: "resource-remote-instance",
          connectionKind: "remote_tls",
          executionLocation: "remote",
        },
        grant: {
          subjectId: "authenticated-resource-subject",
          hostId: "resource-remote-host",
          domains: ["assistant"],
          expiresAt: Date.now() + 60_000,
        },
      }),
      createSessionId: () => "resource-remote-session",
      createEndpointAccessToken: () => "resource-endpoint-token",
    });
    const composition = await createRemoteAssistantAgentHostComposition({
      messageUrl: "https://assistant.example.test/v1/agent-host/message",
      getBearerToken: () => "resource-bearer",
      clientId: "remote-resource-client",
      fetch: fakeFetch(handler, []),
    });

    try {
      await expect(composition.client.prepareResourceDelivery({
        resourceId: "resource_image_remote",
        expectedSha256: sha256,
        purpose: "preview",
        sessionId: "session_remote",
      })).resolves.toMatchObject({ token, resourceId: "resource_image_remote" });
      expect(prepare).toHaveBeenCalledWith({
        audience: "authenticated-resource-subject",
        resourceId: "resource_image_remote",
        expectedSha256: sha256,
        purpose: "preview",
        sessionId: "session_remote",
      });
      await expect(composition.client.revokeResourceDelivery(token)).resolves.toBe(true);
      expect(revoke).toHaveBeenCalledWith(token);
    } finally {
      await composition.close();
      await handler.close();
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
    composition.client.subscribeSurfaceEvents((event) => received.push(event));

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

  it("initializes the complete product controller without granting Host-local authority", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-remote-controller-"));
    const host = await startAssistantHost({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      modelEndpoint: productEndpoint(),
    });
    const handler = createRemoteAssistantAgentHostHandler({
      authenticateBearerToken: async (token) =>
        token === "subject-bearer"
          ? { subjectId: "controller-subject", expiresAt: Date.now() + 60_000 }
          : null,
      resolveAssistantHost: async () => ({
        surface: host.surface,
        host: {
          hostId: "assistant-controller-host",
          instanceId: "assistant-controller-instance",
          connectionKind: "remote_tls",
          executionLocation: "remote",
        },
        grant: {
          subjectId: "controller-subject",
          hostId: "assistant-controller-host",
          domains: ["assistant"],
          expiresAt: Date.now() + 60_000,
        },
      }),
      createSessionId: () => "remote-controller-session",
      createEndpointAccessToken: () => "remote-controller-endpoint-token",
    });
    const composition = await createRemoteAssistantAgentHostComposition({
      messageUrl: "https://assistant.example.test/v1/agent-host/message",
      getBearerToken: () => "subject-bearer",
      clientId: "remote-controller-client",
      fetch: fakeFetch(handler, []),
    });

    try {
      const controller = await createController({ client: composition.client });
      const snapshot = controller.snapshot();
      expect(snapshot).toMatchObject({
        kind: "web.snapshot",
        descriptor: { ok: true },
        status: { ok: true },
        home: { ok: true },
        settings: { ok: true },
        modelEndpoints: { ok: true },
        pluginManagement: {
          ok: true,
          value: {
            kind: "assistant.plugin-management.unavailable",
            message: "Plugin management is unavailable through this Host.",
          },
        },
        view: {
          ready: true,
          settings: { plugins: { state: "unavailable" } },
        },
        plan: {
          proposal: { kind: "assistant.plan-proposal.no-selection" },
        },
        goal: { state: "no-session" },
      });
      if (!snapshot.descriptor.ok) throw new Error("remote descriptor is unavailable");
      const commands = snapshot.descriptor.value.commands.map(({ command }) => command);
      expect(commands).toEqual(expect.arrayContaining([
        "createSchedule",
        "startPlanGeneration",
        "startGoal",
        "createTeamConversation",
      ]));
      expect(commands).not.toContain("prepareConversationAttachment");
      expect(commands).not.toContain("readPluginManagement");
      expect(snapshot.diagnostics).not.toContainEqual(
        expect.objectContaining({ code: "web.plugin_management_failed" }),
      );
      await expect(controller.dispatchAction({
        type: "create-schedule",
        input: {
          definition: {
            prompt: "Remote Assistant scheduled check",
            trigger: { kind: "once", at: Date.now() + 86_400_000 },
          },
          idempotencyKey: "remote-controller-schedule",
        },
      }, { requestId: "remote-controller-schedule-request" })).resolves.toMatchObject({
        ok: true,
        action: "create-schedule",
        output: {
          result: { kind: "assistant.schedule.applied", operation: "create" },
        },
      });
      await expect(controller.dispatchAction({
        type: "create-team-conversation",
        input: {
          mode: "discussion",
          title: "Remote Assistant group",
          idempotencyKey: "remote-controller-team",
        },
      }, { requestId: "remote-controller-team-request" })).resolves.toMatchObject({
        ok: true,
        action: "create-team-conversation",
        snapshot: {
          teamList: {
            ok: true,
            value: {
              conversations: [
                expect.objectContaining({ title: "Remote Assistant group" }),
              ],
            },
          },
        },
      });
      await expect(composition.client.prepareConversationAttachment({
        resourceId: "remote-resource-is-not-readable",
      })).resolves.toMatchObject({
        ok: false,
        error: { code: "command_error" },
      });
    } finally {
      await composition.close();
      await handler.close();
      await host.close();
      await rm(storeDir, { recursive: true, force: true });
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

    expect(rejected.status).toBe(400);
    expect(rejected.body).toMatchObject({ error: { code: "malformed_request" } });
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
        composition.client.submitConversationOperation({
          text: "conflicting remote submission",
          idempotencyKey: "remote_conflict",
        }),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "command_error" },
      });
    } finally {
      await composition.close();
      await fixture.handler.close();
    }
  });
});

function createFixture(rejectSubmit = false) {
  const commandCalls: unknown[] = [];
  let resolveCalls = 0;
  const surfaceFixture = createSurface(commandCalls, rejectSubmit);
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

function createSurface(
  calls: unknown[],
  rejectSubmit: boolean,
): {
  readonly surface: SurfaceAdapter;
  readonly emit: (event: SurfaceEvent) => void;
} {
  const listeners = new Set<(event: SurfaceEvent) => void>();
  const surface = {
    descriptor: () => ({
      kind: "assistant.surface-descriptor",
      transport: "app-owned-ipc-or-api",
      commandCount: 2,
      rendererBoundary: {},
      commands: [],
    }),
    dispatchSurfaceCommand: async (request: SurfaceCommandRequest) => {
      calls.push(request);
      if (rejectSubmit && request.command === "submitConversationOperation") {
        return {
          ok: false,
          command: request.command,
          error: {
            code: "command_error",
            category: "runtime",
            message: "the idempotency key was already used",
          },
          event: event(1),
        };
      }
      return {
        ok: true,
        command: request.command,
        value: request.command === "status"
          ? { kind: "assistant.status", state: "ready" }
          : {
              kind: "assistant.conversation-operation.found",
              operation: { operationId: "remote_operation_1" },
            },
        event: event(1),
      };
    },
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
    dispose: async () => undefined,
  };
  return {
    surface: surface as unknown as SurfaceAdapter,
    emit: surface.emit,
  };
}

function productEndpoint() {
  return {
    id: "remote-controller-provider",
    connection: { id: "remote-controller-provider", providerId: "fake" },
    protocol: { id: "fake" as const },
    model: {
      id: "remote-controller-model",
      operations: ["conversation" as const],
      inputModalities: ["text" as const],
      outputModalities: ["text" as const],
      features: ["tool_calling" as const],
      catalog: {
        source: "custom" as const,
        catalogId: "wanex.test.remote-controller",
        revision: "1",
      },
    },
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
