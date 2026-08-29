import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AllowAllToolsPolicy } from "@wanex/runtime/tools";
import type {
  PreparedProviderReplayMessage,
  ProviderAdapter,
  ProviderEvent,
  ProviderRequest,
} from "@wanex/runtime/provider";
import { fakeModelDescriptor } from "@wanex/runtime/provider";
import type { JsonValue } from "@wanex/protocol";
import {
  CodingClientError,
  createCodingClient,
  createInProcessCodingTransport,
  createMessageCodingTransport,
  type CodingApplicationEvent,
  type CodingClient,
  type CodingCommandRequest,
} from "../src/index.js";
import {
  createCodingTransportEndpoint,
  startCodingApplication,
} from "../src/host/index.js";
import {
  ApprovalRequiredWorkspacePolicy,
  BlockingProvider,
  CodingHostTestScope,
  WorkspaceEditProvider,
  executionOptions,
  serviceBin,
} from "./support.js";

let scope: CodingHostTestScope;

beforeEach(() => {
  scope = new CodingHostTestScope();
});

afterEach(async () => {
  await scope.dispose();
});

describe("Coding product adapter acceptance", () => {
  it("runs approval, transcript, Proposal apply, and undo over a JSON message boundary", async () => {
    const environment = await scope.createEnvironment();
    const repositoryRoot = await scope.createRepository();
    const policy = new ApprovalRequiredWorkspacePolicy();
    const host = await startCodingApplication({
      dataDir: environment.dataDir,
      storage: { kind: "injected", handle: environment.storageHandle },
      artifacts: { explicitPath: serviceBin },
      execution: executionOptions(new WorkspaceEditProvider(), {
        toolPermissionPolicy: policy,
      }),
    });
    try {
      const project = await host.openProject({
        repositoryPath: repositoryRoot,
      });
      const endpoint = createCodingTransportEndpoint(host.application);
      const requests: CodingCommandRequest[] = [];
      const client = createCodingClient(
        createMessageCodingTransport({
          async send(request) {
            requests.push(clone(request));
            return clone(await endpoint.send(clone(request)));
          },
          subscribe(listener) {
            return endpoint.subscribe((event) => listener(clone(event)));
          },
        }),
        requestIds("desktop"),
      );

      await expect(client.listProjects()).resolves.toMatchObject([
        { projectId: project.projectId, state: "ready" },
      ]);
      const waitingEvent = nextClientEvent(
        client,
        (event) =>
          event.kind === "turn_invalidated" && event.reason === "turn_waiting",
      );
      const liveEvent = nextClientEvent(
        client,
        (event) =>
          event.kind === "turn_live_invalidated" &&
          event.reason === "turn_live_updated",
      );
      const started = await client.startTurn({
        projectId: project.projectId,
        idempotencyKey: "transport-desktop",
        content: [{ type: "text", text: "create desktop" }],
        proposalTitle: "Create desktop",
      });
      await expect(liveEvent).resolves.toMatchObject({
        kind: "turn_live_invalidated",
        projectId: project.projectId,
        turnId: started.turnId,
      });
      await policy.requested;
      await waitingEvent;
      const waiting = await client.readTurn({
        projectId: project.projectId,
        turnId: started.turnId,
      });
      expect(waiting).toMatchObject({ state: "waiting", canCancel: true });
      await expect(
        client.readLiveTurn({
          projectId: project.projectId,
          turnId: started.turnId,
        }),
      ).resolves.toMatchObject({
        phase: "waiting",
        activities: [{ state: "ready", name: "workspace_apply_changeset", nameTruncated: false }],
      });
      const liveResponse = await endpoint.send({
        protocol: "wanex.coding/1",
        kind: "command",
        requestId: "live-read",
        command: "turn.live.read",
        input: { projectId: project.projectId, turnId: started.turnId },
      });
      expect(JSON.stringify(liveResponse)).not.toContain("workspaceRoot");
      expect(JSON.stringify(liveResponse)).not.toContain("targetText");
      const approval = waiting!.approvals.items[0]!;

      const settledEvent = nextClientEvent(
        client,
        (event) =>
          event.kind === "turn_invalidated" &&
          event.turnId === started.turnId &&
          event.reason === "turn_settled",
      );
      await client.resolveTurnApproval({
        projectId: project.projectId,
        turnId: started.turnId,
        executionId: approval.executionId,
        expectedApprovalRevision: approval.approvalRevision,
        decision: "approve_once",
        reason: "reviewed isolated change",
        requestId: "approve-desktop-tool",
      });
      await settledEvent;
      const completed = await client.readTurn({
        projectId: project.projectId,
        turnId: started.turnId,
      });
      expect(completed).toMatchObject({
        state: "succeeded",
        result: "proposal_available",
        proposalId: expect.any(String),
      });

      const transcript = await client.readTranscript({
        projectId: project.projectId,
        sessionId: started.sessionId,
        limit: 100,
      });
      expect(transcript).toMatchObject({
        returnedCount: expect.any(Number),
        hasMore: false,
        contentTruncated: false,
      });
      expect(transcript?.messages.flatMap((message) => message.parts)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "text", text: "create desktop" }),
          expect.objectContaining({
            type: "tool_call",
            toolName: "workspace_apply_changeset",
          }),
          expect.objectContaining({ type: "tool_result", isError: false }),
        ]),
      );
      const serializedTranscript = JSON.stringify(transcript);
      expect(serializedTranscript).not.toContain("targetText");
      expect(serializedTranscript).not.toContain("desktop.txt");
      expect(serializedTranscript).not.toContain("contentDigest");
      expect(serializedTranscript).not.toContain("executionBindingDigest");
      expect(serializedTranscript).not.toContain(repositoryRoot);

      const proposalId = completed!.proposalId!;
      await client.decideProposal({
        projectId: project.projectId,
        proposalId,
        decision: "approve",
        reason: "reviewed desktop change",
        requestId: "approve-desktop-proposal",
      });
      await client.requestProposalApply({
        projectId: project.projectId,
        proposalId,
        reason: "apply desktop change",
        requestId: "request-desktop-apply",
      });
      await expect(
        client.applyProposal({
          projectId: project.projectId,
          proposalId,
        }),
      ).resolves.toMatchObject({ status: "applied" });
      await expect(
        client.undoProposal({
          projectId: project.projectId,
          proposalId,
          requestId: "undo-desktop-change",
        }),
      ).resolves.toMatchObject({ status: "applied", replayed: false });

      const malformed = await endpoint.send({
        protocol: "wanex.coding/1",
        kind: "command",
        requestId: "malformed-extra",
        command: "project.read",
        input: { projectId: project.projectId, trustedPath: repositoryRoot },
      } as never);
      expect(malformed).toMatchObject({
        ok: false,
        error: { code: "invalid_request", category: "validation" },
      });
      expect(JSON.stringify(malformed)).not.toContain(repositoryRoot);
      await expect(
        endpoint.send({
          protocol: "wanex.coding/1",
          kind: "command",
          requestId: "unknown-command",
          command: "private.execute",
        } as never),
      ).resolves.toMatchObject({
        requestId: "unknown-command",
        command: "private.execute",
        ok: false,
        error: { code: "unknown_command", category: "validation" },
      });
      expect(
        requests.every((request) => request.protocol === "wanex.coding/1"),
      ).toBe(true);
    } finally {
      await host.close();
      await environment.dispose();
    }
  }, 25_000);

  it("cancels in-process and detects Host replacement without polling or client state", async () => {
    const environment = await scope.createEnvironment();
    const repositoryRoot = await scope.createRepository();
    const firstProvider = new BlockingProvider();
    const options = {
      dataDir: environment.dataDir,
      storage: { kind: "injected" as const, handle: environment.storageHandle },
      artifacts: { explicitPath: serviceBin },
    };
    const firstHost = await startCodingApplication({
      ...options,
      execution: executionOptions(firstProvider, {
        toolPermissionPolicy: new AllowAllToolsPolicy(),
      }),
    });
    const firstProject = await firstHost.openProject({
      repositoryPath: repositoryRoot,
    });
    const firstClient = createCodingClient(
      createInProcessCodingTransport(
        createCodingTransportEndpoint(firstHost.application),
      ),
      requestIds("tui-first"),
    );
    const started = await firstClient.startTurn({
      projectId: firstProject.projectId,
      idempotencyKey: "transport-cancel",
      content: [{ type: "text", text: "wait for cancellation" }],
    });
    await firstProvider.started;
    const cancelEvent = nextClientEvent(
      firstClient,
      (event) =>
        event.kind === "turn_invalidated" &&
        event.turnId === started.turnId &&
        event.reason === "turn_settled",
    );
    await firstClient.cancelTurn({
      projectId: firstProject.projectId,
      turnId: started.turnId,
      reason: "cancel from tui",
    });
    await cancelEvent;
    await expect(
      firstClient.readTurn({
        projectId: firstProject.projectId,
        turnId: started.turnId,
      }),
    ).resolves.toMatchObject({ state: "cancelled", result: "cancelled" });
    const previousEvents = await firstClient.readEvents();
    await firstHost.close();

    const secondHost = await startCodingApplication({
      ...options,
      execution: executionOptions(new WorkspaceEditProvider(), {
        toolPermissionPolicy: new AllowAllToolsPolicy(),
      }),
    });
    try {
      const secondClient = createCodingClient(
        createInProcessCodingTransport(
          createCodingTransportEndpoint(secondHost.application),
        ),
        requestIds("tui-second"),
      );
      const liveEvents: CodingApplicationEvent[] = [];
      const unsubscribe = secondClient.subscribe((event) =>
        liveEvents.push(event),
      );
      const secondProject = await secondHost.openProject({
        repositoryPath: repositoryRoot,
      });
      const replay = await secondClient.readEvents({
        streamId: previousEvents.streamId,
        afterSequence: previousEvents.lastSequence,
        limit: 100,
      });
      expect(replay).toMatchObject({ gap: true, hasMore: false });
      expect(replay.streamId).not.toBe(previousEvents.streamId);
      expect(liveEvents).toEqual([
        expect.objectContaining({
          streamId: replay.streamId,
          reason: "project_opened",
        }),
      ]);
      await expect(
        secondClient.readTurn({
          projectId: secondProject.projectId,
          turnId: started.turnId,
        }),
      ).resolves.toMatchObject({ state: "cancelled", result: "cancelled" });
      await expect(
        secondClient.readTranscript({
          projectId: secondProject.projectId,
          sessionId: started.sessionId,
          limit: 100,
        }),
      ).resolves.toMatchObject({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "user" }),
        ]),
      });
      unsubscribe();
    } finally {
      await secondHost.close();
      await environment.dispose();
    }
  }, 20_000);

  it("bounds visible transcript bytes and hides provider-only reasoning", async () => {
    const environment = await scope.createEnvironment();
    const repositoryRoot = await scope.createRepository();
    const privateMarker = "PRIVATE_PROVIDER_REASONING";
    const host = await startCodingApplication({
      dataDir: environment.dataDir,
      storage: { kind: "injected", handle: environment.storageHandle },
      artifacts: { explicitPath: serviceBin },
      execution: executionOptions(
        new BoundedTranscriptProvider(privateMarker),
        {
          toolPermissionPolicy: new AllowAllToolsPolicy(),
        },
      ),
    });
    try {
      const project = await host.openProject({
        repositoryPath: repositoryRoot,
      });
      const client = createCodingClient(
        createInProcessCodingTransport(
          createCodingTransportEndpoint(host.application),
        ),
        requestIds("bounded"),
      );
      const settled = nextClientEvent(
        client,
        (event) =>
          event.kind === "turn_invalidated" && event.reason === "turn_settled",
      );
      const started = await client.startTurn({
        projectId: project.projectId,
        idempotencyKey: "transport-large-response",
        content: [{ type: "text", text: "large response" }],
      });
      await settled;
      const transcript = await client.readTranscript({
        projectId: project.projectId,
        sessionId: started.sessionId,
        limit: 100,
      });
      expect(transcript?.contentTruncated).toBe(true);
      const parts =
        transcript?.messages.flatMap((message) => message.parts) ?? [];
      expect(parts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "text", truncated: true }),
          expect.objectContaining({
            type: "hidden",
            sourceType: "reasoning",
            visibility: "provider_replay_only",
          }),
        ]),
      );
      expect(JSON.stringify(transcript)).not.toContain(privateMarker);
      const visibleText = parts
        .flatMap((part) =>
          part.type === "text" || part.type === "reasoning"
            ? [part.text ?? ""]
            : [],
        )
        .join("");
      expect(Buffer.byteLength(visibleText, "utf8")).toBeLessThanOrEqual(
        512 * 1024,
      );
    } finally {
      await host.close();
      await environment.dispose();
    }
  }, 15_000);

  it("rejects an uncorrelated or malformed response at the browser-safe client", async () => {
    const client = createCodingClient(
      createMessageCodingTransport({
        async send() {
          return {
            protocol: "wanex.coding/1",
            kind: "response",
            requestId: "wrong-request",
            command: "project.list",
            ok: true,
            value: [],
          };
        },
        subscribe: () => () => {},
      }),
      () => "expected-request",
    );
    await expect(client.listProjects()).rejects.toMatchObject({
      detail: { code: "invalid_transport_response", category: "transport" },
    });
    await expect(client.listProjects()).rejects.toBeInstanceOf(
      CodingClientError,
    );

    const nestedAuthority = createCodingClient(
      createMessageCodingTransport({
        async send(request) {
          return {
            protocol: "wanex.coding/1",
            kind: "response",
            requestId: request.requestId,
            command: request.command,
            ok: true,
            value: [
              {
                projectId: "repo_private",
                name: "Private",
                state: "ready",
                openedAt: 1,
                recovery: {
                  transactionAttention: false,
                  taskAttentionCount: 0,
                  taskFailureCount: 0,
                  moreTasksPending: false,
                  repositoryPath: "/private/repository",
                },
              },
            ],
          };
        },
        subscribe: () => () => {},
      }),
      () => "nested-authority",
    );
    await expect(nestedAuthority.listProjects()).rejects.toMatchObject({
      detail: { code: "invalid_transport_response" },
    });

    const malformedTranscript = createCodingClient(
      createMessageCodingTransport({
        async send(request) {
          return {
            protocol: "wanex.coding/1",
            kind: "response",
            requestId: request.requestId,
            command: request.command,
            ok: true,
            value: {
              projectId: "repo_private",
              sessionId: "ses_private",
              messages: [
                {
                  messageId: "msg_private",
                  sequence: 1,
                  turnId: "turn_private",
                  role: "assistant",
                  status: "completed",
                  createdAt: 1,
                  updatedAt: 1,
                  parts: [
                    {
                      partId: "part_private",
                      type: "resource",
                      visibility: "private_authority",
                      resourceId: "res_private",
                      sha256: "not-a-sha256",
                      sizeBytes: 1,
                      kind: "native_handle",
                    },
                  ],
                },
              ],
              returnedCount: 1,
              hasMore: false,
              contentTruncated: false,
              omittedPartCount: 0,
            },
          };
        },
        subscribe: () => () => {},
      }),
      () => "malformed-transcript",
    );
    await expect(
      malformedTranscript.readTranscript({
        projectId: "repo_private",
        sessionId: "ses_private",
      }),
    ).rejects.toMatchObject({
      detail: { code: "invalid_transport_response" },
    });
  });
});

class BoundedTranscriptProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const;
  readonly providerId = "coding-bounded-transcript";
  readonly model = fakeModelDescriptor("coding-bounded-transcript");
  readonly #privateMarker: string;

  constructor(privateMarker: string) {
    this.#privateMarker = privateMarker;
  }

  async *stream(_request: ProviderRequest): AsyncIterable<ProviderEvent> {
    yield {
      type: "reasoning_delta",
      partId: "private-reasoning",
      delta: this.#privateMarker,
      visibility: "provider_replay_only",
    };
    yield {
      type: "text_delta",
      partId: "large-text",
      delta: "界".repeat(40_000),
    };
    yield { type: "finish", reason: "stop" };
  }

  buildReplayMessages(
    messages: readonly PreparedProviderReplayMessage[],
  ): JsonValue[] {
    return messages as unknown as JsonValue[];
  }
}

function nextClientEvent(
  client: CodingClient,
  predicate: (event: CodingApplicationEvent) => boolean,
): Promise<CodingApplicationEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Coding client event was not observed"));
    }, 5_000);
    const unsubscribe = client.subscribe((event) => {
      if (!predicate(event)) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(event);
    });
  });
}

function requestIds(prefix: string): () => string {
  let sequence = 0;
  return () => `${prefix}-${++sequence}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
