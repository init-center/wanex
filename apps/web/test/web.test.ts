import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createShell,
  createSurfaceAdapter,
  type Shell,
  type ShellOptions,
  type ConversationPresentationPart,
} from "@wanex/product";
import { type SurfaceTransportRequest } from "@wanex/product/surface";
import {
  createHostSurfaceClient,
  sendHostSurfaceMessage,
} from "../src/application/host.js";
import {
  createController,
  createSurface,
  handleRequest,
  buildViewModel,
  projectDiagnostics,
  projectExecutionActivityFromResult,
  type Snapshot,
} from "../src/index.js";
import {
  preserveExpandedConversationHistory,
  projectConversationFromResult,
} from "../src/application/conversation/projection.js";
import { conversationModelEndpoints } from "../src/application/conversation/endpoints.js";

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
);

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("@wanex/web", () => {
  it("rereads the canonical command catalog only after invalidation", async () => {
    const catalog = createWebCatalog("web-catalog-zero");
    await withWebSurface(
      async ({ productSurface, surface, observed }) => {
        const readCount = () => observed.filter(
          (request) =>
            request.operation === "dispatchSurfaceCommand" &&
            request.command.command === "readProductCommands",
        ).length;
        expect(surface.snapshot().commandCatalog).toMatchObject({
          ok: true,
          value: { extensionRevision: "web-catalog-zero" },
        });
        const initialReads = readCount();

        expect(catalog.publish("web-catalog-one")).toBe(true);
        expect(catalog.publish("web-catalog-one")).toBe(false);
        expect(
          productSurface.readSurfaceEvents().events.filter(
            (event) =>
              event.type === "product.surface.command-catalog.invalidated",
          ),
        ).toHaveLength(1);

        const reconciled = await surface.reconcileEvents();
        expect(readCount()).toBe(initialReads + 1);
        expect(reconciled.commandCatalog).toMatchObject({
          ok: true,
          value: {
            extensionRevision: "web-catalog-one",
          },
        });

        await surface.reconcileEvents();
        expect(readCount()).toBe(initialReads + 1);
      },
      { extensions: { source: catalog.source } },
    );
  });

  it.each([
    ["pending", "submitted"],
    ["ready", "submitted"],
    ["running", "running"],
    ["waiting", "waiting"],
    ["retry_scheduled", "retrying"],
    ["succeeded", "succeeded"],
    ["failed", "failed"],
    ["cancelled", "cancelled"],
  ] as const)(
    "projects %s execution activity as %s",
    (schedulerState, state) => {
      const activity = projectExecutionActivityFromResult(
        {
          kind: "found",
          reference: { kind: "job", id: "job_web_projection" },
          activity: {
            kind: "wanex-app.execution.job",
            jobKind: "plugin.action",
            state: schedulerState,
            attempt: 1,
            maxAttempts: 3,
            scheduledAt: 10,
            createdAt: 9,
            updatedAt: 11,
          },
        },
        12,
      );

      expect(activity).toMatchObject({
        state,
        reference: { kind: "job", id: "job_web_projection" },
        schedulerState,
        jobKind: "plugin.action",
      });
    },
  );

  it("keeps waiting conversation work cancellable and queueable", () => {
    const conversation = projectConversationFromResult({
      kind: "product.conversation-operation.found",
      operation: {
        kind: "product.conversation-operation",
        operationId: "operation_waiting_media",
        sessionId: "session_waiting_media",
        state: "waiting",
        createdAt: 10,
        updatedAt: 11,
        transcript: { rows: [], totalRows: 0, truncated: false },
        capabilities: {
          steerable: false,
          cancellable: true,
          regeneratable: false,
          terminal: false,
        },
      },
    });

    expect(conversation).toMatchObject({
      state: "waiting",
      canSubmit: false,
      canQueueFollowUp: true,
      canCancel: true,
      canRegenerate: false,
    });
  });

  it("preserves expanded durable history while replacing stale live inputs", () => {
    const row = (
      id: string,
      kind: "input" | "message",
      status: string,
      createdAt: number,
    ) => ({
      id,
      kind,
      role: "user" as const,
      status,
      createdAt,
      updatedAt: createdAt,
      parts: [{ key: `${id}:text`, type: "text" as const, text: id }],
      capabilityRequests: [],
    });
    const current = {
      kind: "web.conversation" as const,
      state: "succeeded" as const,
      sessionId: "session_history_preservation",
      historyRows: [
        row("old-message", "message", "completed", 1),
        row("failed-input", "input", "failed", 2),
        row("live-input", "input", "admitted", 3),
      ],
      historyPage: {
        limit: 100,
        hasMore: false,
        liveRowsTruncated: false,
      },
      historyExpanded: true,
      canSubmit: true,
      canQueueFollowUp: false,
      canSteer: false,
      canCancel: false,
      canRegenerate: false,
    };
    const candidate = {
      ...current,
      historyRows: [
        row("old-message", "message", "completed", 1),
        row("new-message", "message", "completed", 4),
      ],
      historyPage: {
        limit: 100,
        hasMore: true,
        nextCursor: "canonical-cursor",
        liveRowsTruncated: true,
      },
      historyExpanded: false,
    };

    const preserved = preserveExpandedConversationHistory(current, candidate);

    expect(preserved.historyRows.map((item) => item.id)).toEqual([
      "old-message",
      "failed-input",
      "new-message",
    ]);
    expect(preserved.historyPage).toEqual({
      limit: 100,
      hasMore: false,
      liveRowsTruncated: true,
    });
    expect(preserved.historyExpanded).toBe(true);
  });

  it("tracks command job references and refreshes them during reconciliation", async () => {
    const executionEvents = createWebExecutionInvalidations()
    await withWebSurface(async ({ app, client }) => {
      await app.dispatchProductCommand({
        command: "submitConversationOperation",
        input: {
          text: "seed tracked web execution",
          sessionId: "ses_web_execution_activity",
          jobId: "job_web_execution_activity",
        },
      });
      let activityState: "ready" | "succeeded" = "ready"
      let activityReadCount = 0
      const trackedClient = {
        ...client,
        async executeProductCommand() {
          const original = await client.executeProductCommand({
            commandId: "product.status",
          });
          if (!original.ok || original.value.kind !== "completed") {
            return original;
          }
          return {
            ...original,
            value: {
              ...original.value,
              kind: "submitted" as const,
              summary: {
                ...original.value.summary,
                message: "Command submitted" as const,
                references: [
                  { kind: "job" as const, id: "job_web_execution_activity" },
                ],
              },
            },
          };
        },
        async readExecutionReference(
          reference: Parameters<typeof client.readExecutionReference>[0],
        ) {
          activityReadCount += 1
          const original = await client.readExecutionReference(reference)
          if (!original.ok || original.value.kind !== "found") return original
          return {
            ...original,
            value: {
              ...original.value,
              activity: {
                ...original.value.activity,
                state: activityState,
                ...(activityState === "succeeded"
                  ? { finishedAt: original.value.activity.finishedAt ?? 12_346 }
                  : {}),
              },
            },
          }
        },
      };
      const tracked = await createSurface({
        client: trackedClient,
        now: () => 12_345,
      });

      const executed = await tracked.dispatchAction({
        type: "execute-command",
        input: { commandId: "product.status" },
      });
      expect(executed.snapshot.executionActivity).toMatchObject({
        reference: { kind: "job", id: "job_web_execution_activity" },
        state: "submitted",
      });
      expect(executed.snapshot.commandExecution).toMatchObject({
        state: "submitted",
        message: "Command submitted",
      })
      expect(activityReadCount).toBe(1)

      executionEvents.publish({ kind: "job", id: "job_other" })
      const unrelated = await tracked.reconcileEvents()
      expect(unrelated.executionActivity.state).toBe("submitted")
      expect(activityReadCount).toBe(1)

      activityState = "succeeded"
      executionEvents.publish({
        kind: "job",
        id: "job_web_execution_activity",
      })
      const reconciled = await tracked.reconcileEvents()
      expect(reconciled.executionActivity.state).toBe("succeeded")
      expect(activityReadCount).toBe(2)

      executionEvents.publish({
        kind: "job",
        id: "job_web_execution_activity",
      })
      const terminal = await tracked.reconcileEvents()
      expect(terminal.executionActivity.state).toBe("succeeded")
      expect(activityReadCount).toBe(2)
    }, {
      productCommands: {
        executionInvalidations: executionEvents.source,
      },
    });
  });

  it("projects product state into a safe typed web snapshot", async () => {
    await withWebSurface(async ({ surface }) => {
      const snapshot = surface.snapshot();

      expect(snapshot.eventStreamId).toBeDefined();
      const { eventStreamId: _eventStreamId, ...snapshotWithoutStream } =
        snapshot;

      expect(snapshot).toMatchObject({
        kind: "web.snapshot",
        descriptor: {
          ok: true,
          value: {
            commandCount: 67,
          },
        },
        view: {
          title: "New conversation",
          ready: true,
          mode: "chat",
          layout: "single",
          theme: "system",
          density: "comfortable",
          settings: {
            profile: {
              activeModelEndpointId: "web-test",
              readiness: {
                status: "ready",
                reason: "active_endpoint_ready",
                activeEndpointId: "web-test",
                endpointCount: 1,
                canRun: true,
                attentionRequired: false,
                requiresCredential: false,
                credentialConfigured: false,
              },
              endpointCount: 1,
              endpoints: [
                expect.objectContaining({
                  id: "web-test",
                  model: expect.objectContaining({
                    id: "web-test-model",
                    inputModalities: ["text"],
                  }),
                  active: true,
                  credentialConfigured: false,
                }),
              ],
            },
            renderer: {
              layout: "single",
              mode: "chat",
              theme: "system",
              density: "comfortable",
              availableLayouts: ["single", "split", "diagnostics"],
              availableModes: ["chat", "workbench", "diagnostics"],
              availableThemes: ["system", "light", "dark"],
              availableDensities: ["comfortable", "compact"],
            },
            privacy: {
              exposesStorePath: false,
              exposesServiceBinaryPath: false,
              exposesSecrets: false,
            },
            integration: {
              rendererCalls: "app-owned-ipc-or-api",
              rendererMayOpenStorage: false,
              rendererMayReceiveStorePath: false,
              rendererMayReceiveServiceBinaryPath: false,
            },
          },
          commandCount: 67,
          commandPaletteCount: 1,
          commandPalette: {
            kind: "web.command-palette",
            state: "ready",
            message: "1 command available",
            rows: expect.arrayContaining([
              expect.objectContaining({
                id: "product.status",
                handlerRef: "wanex.product.backend.status",
                sourceKind: "builtin",
                trust: "trusted",
                input: { mode: "none" },
              }),
            ]),
            diagnostics: [],
          },
          sessionCount: 0,
          recentSessions: [],
          workbenchState: "idle",
          workbenchRowCount: 0,
          conversationCanSubmit: true,
          conversationCanCancel: false,
          conversationCanRegenerate: false,
          conversationState: "idle",
          operationStatus: {
            kind: "web.operation-status",
            state: "idle",
            message: "No operation yet",
          },
          commandPreview: {
            kind: "web.command-preview",
            state: "empty",
            message: "No command preview yet",
            inputAccepted: false,
          },
          commandExecution: {
            kind: "web.command-execution",
            state: "empty",
            message: "No command execution yet",
            references: [],
          },
          providerRunGate: {
            state: "ready",
            status: "ready",
            reason: "active_endpoint_ready",
            activeEndpointId: "web-test",
            canRun: true,
            canSubmitConversation: true,
            attentionRequired: false,
            message: "Provider ready",
          },
          actions: expect.arrayContaining([
            expect.objectContaining({
              id: "refresh",
              mutatesState: false,
            }),
            expect.objectContaining({
              id: "start-new-conversation",
              mutatesState: true,
            }),
            expect.objectContaining({
              id: "select-session",
              mutatesState: true,
            }),
            expect.objectContaining({
              id: "set-active-model-endpoint",
              mutatesState: true,
            }),
            expect.objectContaining({
              id: "preview-command",
              mutatesState: false,
            }),
            expect.objectContaining({
              id: "execute-command",
              mutatesState: true,
            }),
            expect.objectContaining({
              id: "open-workbench",
              mutatesState: true,
            }),
            expect.objectContaining({
              id: "submit-conversation",
              mutatesState: true,
            }),
            expect.objectContaining({
              id: "refresh-conversation",
              mutatesState: false,
            }),
            expect.objectContaining({
              id: "cancel-conversation",
              mutatesState: false,
            }),
            expect.objectContaining({
              id: "regenerate-conversation",
              mutatesState: true,
            }),
          ]),
        },
      });
      expect(snapshot.view.conversationAttachmentCanUpload).toBe(false);
      expect(snapshot.view.conversationAttachmentAccept).toBe("");




    });
  });

  it("projects every canonical turn while tracking only the latest operation", async () => {
    await withWebSurface(async ({ surface }) => {
      const first = await surface.dispatchAction({
        type: "submit-conversation",
        input: { text: "first canonical question" },
      });
      const sessionId = first.snapshot.conversation.sessionId;
      if (sessionId === undefined)
        throw new Error("expected conversation session");
      await waitForConversationTerminal(surface, sessionId);

      const second = await surface.dispatchAction({
        type: "submit-conversation",
        input: { text: "second canonical question", sessionId },
      });
      expect(
        second.snapshot.conversation.operation?.transcript.rows.some(
          (row) => conversationRowText(row) === "first canonical question",
        ),
      ).toBe(false);
      const terminal = await waitForConversationTerminal(surface, sessionId);
      const userRows = terminal.conversation.historyRows
        .filter((row) => row.role === "user")
        .map(conversationRowText);
      expect(userRows).toEqual([
        "first canonical question",
        "second canonical question",
      ]);

    });
  });

  it("dispatches actions and reconciles Surface events by cursor", async () => {
    await withWebSurface(async ({ app, productSurface, surface, observed }) => {
      await seedSession(
        app,
        "ses_product_app_web",
        "hello from web application conversation",
      );
      await app.modelEndpoints.upsertModelEndpoint({
        modelEndpoint: fakeModelEndpoint(
          "web-second-provider",
          "web-second-model",
        ),
      });
      const providerSnapshot = await surface.refresh();
      expect(providerSnapshot.view.settings.profile.endpoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "web-second-provider",
            active: false,
          }),
        ]),
      );
      const switchedProvider = await surface.dispatchAction({
        type: "set-active-model-endpoint",
        input: {
          endpointId: "web-second-provider",
        },
      });
      expect(switchedProvider).toMatchObject({
        ok: true,
        action: "set-active-model-endpoint",
        snapshot: {
          view: {
            settings: {
              profile: {
                activeModelEndpointId: "web-second-provider",
                endpoints: expect.arrayContaining([
                  expect.objectContaining({
                    id: "web-second-provider",
                    active: true,
                  }),
                ]),
              },
            },
          },
        },
      });

      const selected = await surface.dispatchAction({
        type: "select-session",
        sessionId: "ses_product_app_web",
      });
      expect(selected).toMatchObject({
        ok: true,
        action: "select-session",
        snapshot: {
          view: {
            selection: {
              kind: "session",
              sessionId: "ses_product_app_web",
            },
          },
        },
      });
      const cursorAfterSelect = surface.snapshot().eventCursor;

      const newChat = await surface.dispatchAction({
        type: "start-new-conversation",
      });
      expect(newChat).toMatchObject({
        ok: true,
        action: "start-new-conversation",
        snapshot: {
          view: {
            mode: "chat",
            conversationState: "idle",
          },
        },
      });
      expect(newChat.snapshot.view.selection).toBeUndefined();

      await surface.dispatchAction({
        type: "select-session",
        sessionId: "ses_product_app_web",
      });

      const mode = await surface.dispatchAction({
        type: "set-mode",
        input: {
          mode: "workbench",
        },
      });
      expect(mode).toMatchObject({
        ok: true,
        action: "set-mode",
        snapshot: {
          view: {
            mode: "workbench",
          },
        },
      });
      expect(surface.snapshot().eventCursor).toBeGreaterThan(cursorAfterSelect);

      const preview = await surface.dispatchAction({
        type: "preview-command",
        input: {
          commandId: "product.agent.submit",
          input: {
            text: "hello from web application preview",
          },
        },
      });
      expect(preview).toMatchObject({
        ok: true,
        action: "preview-command",
        snapshot: {
          commandPreview: {
            kind: "web.command-preview",
            state: "runnable",
            commandId: "product.agent.submit",
            inputAccepted: true,
            message: "Command is runnable",
          },
          view: {
            commandPreview: {
              state: "runnable",
              commandId: "product.agent.submit",
              inputAccepted: true,
            },
            operationStatus: {
              state: "succeeded",
              action: "preview-command",
            },
            workbenchState: "idle",
          },
        },
      });

      const execution = await surface.dispatchAction({
        type: "execute-command",
        input: {
          commandId: "product.status",
        },
      });
      expect(execution).toMatchObject({
        ok: true,
        action: "execute-command",
        snapshot: {
          commandExecution: {
            state: "completed",
            commandId: "product.status",
            handlerRef: "wanex.product.backend.status",
            message: "Command completed",
            valueKind: "object",
            references: [],
          },
          view: {
            commandExecution: {
              state: "completed",
              commandId: "product.status",
            },
            operationStatus: {
              state: "succeeded",
              action: "execute-command",
            },
          },
        },
      });

      const opened = await surface.dispatchAction({
        type: "open-workbench",
      });
      expect(opened).toMatchObject({
        ok: true,
        action: "open-workbench",
        snapshot: {
          workbench: {
            state: "ready",
            sessionId: "ses_product_app_web",
            summary: {
              rowCount: 2,
            },
          },
          view: {
            workbenchState: "ready",
          },
        },
      });

      const submitted = await surface.dispatchAction({
        type: "submit-conversation",
        input: {
          text: "hello from web application conversation",
          sessionId: "ses_product_app_web",
        },
      });
      expect(submitted.ok).toBe(true);
      expect(submitted.snapshot.conversation).toMatchObject({
        sessionId: "ses_product_app_web",
        operation: {
          kind: "product.conversation-operation",
          sessionId: "ses_product_app_web",
        },
      });
      expect(submitted.snapshot.view).toMatchObject({
        sessionCount: 1,
        selectedSessionTitle: "hello from web application conversation",
        recentSessions: [
          expect.objectContaining({
            sessionId: "ses_product_app_web",
            label: "hello from web application conversation",
            selected: true,
            status: "active",
          }),
        ],
      });
      const selectSessionAction = submitted.snapshot.view.actions.find(
        (action) => action.id === "select-session",
      );
      expect(selectSessionAction?.fields[0]).toMatchObject({
        kind: "select",
        options: [
          {
            value: "ses_product_app_web",
            label: "hello from web application conversation",
          },
        ],
      });

      const terminal = await waitForConversationTerminal(
        surface,
        "ses_product_app_web",
      );
      expect(
        terminal.conversation.operation?.transcript.rows.some((row) =>
          conversationRowText(row).includes(
            "hello from web application conversation",
          ),
        ),
      ).toBe(true);
      const reconciled = await surface.dispatchAction({
        type: "open-workbench",
        input: { sessionId: "ses_product_app_web" },
      });
      expect(reconciled.snapshot.workbench.summary.rowCount).toBeGreaterThan(0);
      expect(
        reconciled.snapshot.workbench.rows.some((row) =>
          row.text.includes("hello from web application conversation"),
        ),
      ).toBe(true);
      expect(terminal.events).toMatchObject({
        ok: true,
        events: expect.any(Array),
      });
      expect(observed.map((request) => request.operation)).toEqual(
        expect.arrayContaining([
          "descriptor",
          "dispatchSurfaceCommand",
          "readSurfaceEvents",
        ]),
      );
      expect(
        observed.some(
          (request) =>
            request.operation === "readSurfaceEvents" &&
            request.input?.afterSequence === cursorAfterSelect,
        ),
      ).toBe(true);

      const descriptor = await sendHostSurfaceMessage(
        productSurface,
        {
          kind: "product.surface-transport.request",
          operation: "descriptor",
          requestId: "web_host_descriptor",
        },
      );
      expect(descriptor).toMatchObject({
        ok: true,
        operation: "descriptor",
        requestId: "web_host_descriptor",
      });
    });
  });

  it("closes the event cursor boundary before reading canonical projections", async () => {
    await withWebSurface(async ({ client }) => {
      let armed = false;
      let eventBoundaryClosed = false;
      const guardedClient = {
        ...client,
        async readSurfaceEvents(
          input?: Parameters<typeof client.readSurfaceEvents>[0],
        ) {
          const result = await client.readSurfaceEvents(input);
          if (armed) eventBoundaryClosed = true;
          return result;
        },
        async readTrackedConversationOperation(
          input?: Parameters<typeof client.readTrackedConversationOperation>[0],
        ) {
          if (armed && !eventBoundaryClosed) {
            throw new Error("operation projection crossed the event cursor boundary");
          }
          return await client.readTrackedConversationOperation(input);
        },
        async readSessionTranscript(
          input?: Parameters<typeof client.readSessionTranscript>[0],
        ) {
          if (armed && !eventBoundaryClosed) {
            throw new Error("transcript projection crossed the event cursor boundary");
          }
          return await client.readSessionTranscript(input);
        },
      };
      const guardedSurface = await createSurface({
        client: guardedClient,
        now: () => 11_002,
      });

      armed = true;
      eventBoundaryClosed = false;
      await expect(guardedSurface.reconcileEvents({ limit: 20 }))
        .resolves.toMatchObject({ kind: "web.snapshot" });
    });
  });

  it("renames, archives, and restores sessions through revision-fenced actions", async () => {
    await withWebSurface(async ({ app, surface }) => {
      const sessionId = "ses_product_app_web_lifecycle";
      await seedSession(app, sessionId, "Original web chat");
      await seedSession(
        app,
        "ses_product_app_web_lifecycle_second",
        "Second web chat",
      );
      const initial = await surface.refresh();
      const active = initial.view.recentSessions.find(
        (session) => session.sessionId === sessionId,
      );
      expect(active).toMatchObject({ revision: 1, status: "active" });
      if (active === undefined) throw new Error("expected active web session");

      await surface.dispatchAction({ type: "select-session", sessionId });
      const renamed = await surface.dispatchAction({
        type: "rename-session",
        input: {
          sessionId,
          expectedRevision: active.revision,
          title: "Renamed web chat",
        },
      });
      expect(renamed.ok).toBe(true);
      expect(renamed.snapshot.view.recentSessions).toContainEqual(
        expect.objectContaining({
          sessionId,
          label: "Renamed web chat",
          revision: 2,
          selected: true,
        }),
      );

      const archived = await surface.dispatchAction({
        type: "archive-session",
        input: { sessionId, expectedRevision: 2 },
      });
      expect(archived.ok).toBe(true);
      expect(archived.snapshot.view.selection).toBeUndefined();
      expect(
        archived.snapshot.view.recentSessions.some(
          (session) => session.sessionId === sessionId,
        ),
      ).toBe(false);
      expect(archived.snapshot.view.archivedSessions).toContainEqual(
        expect.objectContaining({
          sessionId,
          label: "Renamed web chat",
          revision: 3,
          status: "archived",
        }),
      );

      const restored = await surface.dispatchAction({
        type: "restore-session",
        input: { sessionId, expectedRevision: 3 },
      });
      expect(restored.ok).toBe(true);
      expect(restored.snapshot.view.selection).toBeUndefined();
      expect(restored.snapshot.view.recentSessions).toContainEqual(
        expect.objectContaining({
          sessionId,
          label: "Renamed web chat",
          revision: 4,
          status: "active",
          selected: false,
        }),
      );
      expect(
        restored.snapshot.view.archivedSessions.some(
          (session) => session.sessionId === sessionId,
        ),
      ).toBe(false);
    });
  });

  it("projects only ready conversation models for the composer", async () => {
    await withWebSurface(async ({ app, surface }) => {
      await app.modelEndpoints.upsertModelEndpoint({
        modelEndpoint: fakeModelEndpoint(
          "web-second-provider",
          "web-second-model",
        ),
      });
      await app.modelEndpoints.upsertModelEndpoint({
        modelEndpoint: imageModelEndpoint("web-image-provider"),
      });

      const snapshot = await surface.refresh();
      expect(conversationModelEndpoints(snapshot, true).map((endpoint) => endpoint.id)).toEqual([
        "web-second-provider",
        "web-test",
      ]);
      expect(conversationModelEndpoints(snapshot, true).some((endpoint) =>
        endpoint.id === "web-image-provider"
      )).toBe(false);
    });
  });

  it("renders redacted model endpoint rows without leaking secrets", async () => {
    await withWebSurface(async ({ app, surface }) => {
      await app.modelEndpoints.upsertModelEndpoint({
        modelEndpoint: openAIModelEndpoint({
          id: "web-secret-provider",
          modelId: "web-secret-model",
          baseUrl: "https://provider.example.test/v1",
          secretRef: "env://SECRET",
        }),
        makeActive: true,
      });

      const snapshot = await surface.refresh();

      expect(snapshot.view.settings.profile.endpoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "web-secret-provider",
            active: true,
            credentialConfigured: true,
          }),
        ]),
      );
      expect(snapshot.view.settings.profile.readiness).toMatchObject({
        status: "ready",
        reason: "active_endpoint_ready",
        activeEndpointId: "web-secret-provider",
        endpointCount: 2,
        canRun: true,
        attentionRequired: false,
        requiresCredential: true,
        credentialConfigured: true,
      });
      const serialized = JSON.stringify(snapshot);
      expect(serialized).toContain("https://provider.example.test/v1");
      expect(serialized).not.toContain("env://SECRET");
    });
  });

  it("blocks conversation submission when provider readiness needs host setup", async () => {
    await withWebSurface(async ({ app, surface }) => {
      await app.modelEndpoints.upsertModelEndpoint({
        modelEndpoint: openAIModelEndpoint({
          id: "web-missing-key-provider",
          modelId: "web-missing-key-model",
          baseUrl: "https://provider.example.test/v1",
        }),
        makeActive: true,
      });

      const snapshot = await surface.refresh();

      expect(snapshot.view.providerRunGate).toEqual({
        state: "blocked",
        status: "missing_required_credential",
        reason: "active_endpoint_missing_credential",
        activeEndpointId: "web-missing-key-provider",
        canRun: false,
        canSubmitConversation: false,
        attentionRequired: true,
        message: "Host setup required",
      });
      expect(snapshot.view.settings.profile.readiness).toMatchObject({
        status: "missing_required_credential",
        activeEndpointId: "web-missing-key-provider",
        canRun: false,
        attentionRequired: true,
        requiresCredential: true,
        credentialConfigured: false,
      });

      const preview = await surface.dispatchAction({
        type: "preview-command",
        input: {
          commandId: "product.agent.submit",
          input: {
            text: "web preview should not bypass provider setup",
          },
        },
      });
      expect(preview).toMatchObject({
        ok: false,
        action: "preview-command",
        snapshot: {
          commandPreview: {
            state: "rejected",
            commandId: "product.agent.submit",
            reason: "provider_not_ready",
            inputAccepted: false,
            provider: {
              status: "missing_required_credential",
              activeEndpointId: "web-missing-key-provider",
              canRun: false,
              attentionRequired: true,
            },
          },
          workbench: {
            state: "idle",
          },
          view: {
            operationStatus: {
              state: "blocked",
              action: "preview-command",
            },
            commandPreview: {
              state: "rejected",
              reason: "provider_not_ready",
            },
            providerRunGate: {
              state: "blocked",
              canSubmitConversation: false,
            },
          },
        },
      });

      const execution = await surface.dispatchAction({
        type: "execute-command",
        input: {
          commandId: "product.agent.submit",
          input: {
            text: "web execution should not bypass provider setup",
          },
        },
      });
      expect(execution).toMatchObject({
        ok: false,
        action: "execute-command",
        snapshot: {
          commandExecution: {
            state: "rejected",
            commandId: "product.agent.submit",
            reason: "provider_not_ready",
            references: [],
            provider: {
              status: "missing_required_credential",
              canRun: false,
            },
          },
          view: {
            operationStatus: {
              state: "blocked",
              action: "execute-command",
            },
          },
        },
      });

      const submitted = await surface.dispatchAction({
        type: "submit-conversation",
        input: {
          text: "web should not bypass provider setup",
        },
      });
      expect(submitted).toMatchObject({
        ok: false,
        action: "submit-conversation",
        snapshot: {
          conversation: {
            state: "rejected",
            message: expect.stringContaining("provider is not ready"),
          },
          view: {
            operationStatus: {
              state: "blocked",
              action: "submit-conversation",
            },
            providerRunGate: {
              state: "blocked",
              canSubmitConversation: false,
            },
          },
        },
      });
      expect(submitted.snapshot.view.selection).toBeUndefined();
      expect(submitted.snapshot.view.operationStatus.message).toContain(
        "provider is not ready",
      );
      expect(JSON.stringify(submitted)).not.toContain(serviceBin);
    });
  });

  it("submits a conversation operation without a selected session", async () => {
    await withWebSurface(async ({ surface }) => {
      const submitted = await surface.dispatchAction({
        type: "submit-conversation",
        input: {
          text: "hello from web application start",
        },
      });

      expect(submitted).toMatchObject({
        ok: true,
        action: "submit-conversation",
        snapshot: {
          conversation: {
            operation: {
              kind: "product.conversation-operation",
            },
          },
          view: {
            sessionCount: 1,
            selectedSessionTitle: "hello from web application start",
          },
        },
      });
      expect(submitted.snapshot.conversation.sessionId).toMatch(/^ses_/);
      expect(submitted.snapshot.view.selection).toEqual({
        kind: "session",
        sessionId: submitted.snapshot.conversation.sessionId,
      });

      const terminal = await waitForConversationTerminal(
        surface,
        submitted.snapshot.conversation.sessionId as string,
      );
      expect(
        terminal.conversation.operation?.transcript.rows.some(
          (row) =>
            row.role === "user" &&
            conversationRowText(row) === "hello from web application start",
        ),
      ).toBe(true);
    });
  });


  it("runs and dismisses one transient side query through the real Surface", async () => {
    await withWebSurface(async ({ app, surface, observed }) => {
      await seedSession(app, "ses_web_side_query", "canonical side context");
      await app.selectSession({ sessionId: "ses_web_side_query" });
      const ready = await surface.refresh();
      expect(ready.sideQuery).toEqual({
        kind: "web.side-query",
        state: "idle",
      });
      expect(ready.view.sideQueryCanStart).toBe(true);

      const started = await surface.dispatchAction({
        type: "start-side-query",
        input: { question: "temporary web side question" },
      });
      expect(started.ok).toBe(true);
      expect(started.snapshot.sideQuery).toMatchObject({
        queryId: expect.stringMatching(/^sideq_/),
        sessionId: "ses_web_side_query",
        question: "temporary web side question",
      });
      expect(
        started.snapshot.conversation.historyRows.some(
          (row) => conversationRowText(row) === "temporary web side question",
        ),
      ).toBe(false);

      const terminal = await waitForSideQueryTerminal(surface);
      expect(terminal.sideQuery).toMatchObject({
        state: "succeeded",
        answerText: "Fake response from web-test-model",
      });

      const queryId = terminal.sideQuery.queryId;
      if (queryId === undefined) throw new Error("expected side-query ID");
      const dismissed = await surface.dispatchAction({
        type: "dismiss-side-query",
        input: { queryId },
      });
      expect(dismissed).toMatchObject({
        ok: true,
        snapshot: {
          sideQuery: {
            state: "idle",
          },
          view: {
            sideQueryCanStart: true,
          },
        },
      });
      expect(JSON.stringify(dismissed.snapshot.conversation)).not.toContain(
        "temporary web side question",
      );
      expect(
        observed.some(
          (request) =>
            request.operation === "dispatchSurfaceCommand" &&
            request.command.command === "startSideQuery",
        ),
      ).toBe(true);
      expect(
        observed.some(
          (request) =>
            request.operation === "dispatchSurfaceCommand" &&
            request.command.command === "readSideQuery",
        ),
      ).toBe(true);
    });
  });

  it("serializes action and refresh commits so transient workflow state cannot regress", async () => {
    await withWebSurface(async ({ app, client }) => {
      await seedSession(app, "ses_web_serial_side_query", "serial side context");
      await app.selectSession({ sessionId: "ses_web_serial_side_query" });

      let releaseStart: (() => void) | undefined;
      let markStartEntered: (() => void) | undefined;
      const startEntered = new Promise<void>((resolve) => {
        markStartEntered = resolve;
      });
      const startGate = new Promise<void>((resolve) => {
        releaseStart = resolve;
      });
      let statusReadWhileStartBlocked = false;
      let startBlocked = false;
      const serializedSurface = await createSurface({
        client: {
          ...client,
          async startSideQuery(input) {
            startBlocked = true;
            markStartEntered?.();
            await startGate;
            startBlocked = false;
            return await client.startSideQuery(input);
          },
          async status() {
            if (startBlocked) statusReadWhileStartBlocked = true;
            return await client.status();
          },
        },
        now: () => 11_002,
      });

      const action = serializedSurface.dispatchAction({
        type: "start-side-query",
        input: { question: "serial workflow question" },
      });
      await startEntered;
      const refresh = serializedSurface.refresh();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(statusReadWhileStartBlocked).toBe(false);

      releaseStart?.();
      const [started, refreshed] = await Promise.all([action, refresh]);
      expect(started.ok).toBe(true);
      expect(started.snapshot.sideQuery).toMatchObject({
        question: "serial workflow question",
      });
      expect(refreshed.sideQuery.queryId).toBe(started.snapshot.sideQuery.queryId);
      expect(refreshed.sideQuery.state).not.toBe("idle");
    });
  });

  it("loads earlier conversation history through the action boundary and preserves it on refresh", async () => {
    await withWebSurface(async ({ app, client }) => {
      const sessionId = "ses_web_incremental_history";
      await seedSession(app, sessionId, "first history turn");
      const second = await app.submitConversationOperation({
        sessionId,
        text: "second history turn",
      });
      expect(second.kind).toBe("product.conversation-operation.found");
      await waitForAppConversationTerminal(app, sessionId);
      await app.selectSession({ sessionId });

      const pagedClient = {
        ...client,
        async readSessionTranscript(input?: Parameters<typeof client.readSessionTranscript>[0]) {
          return await client.readSessionTranscript({
            ...input,
            ...(input?.limit === undefined ? { limit: 1 } : {}),
          });
        },
      };
      const surface = await createSurface({
        client: pagedClient,
        now: () => 18_001,
      });
      const initial = surface.snapshot();
      expect(initial.conversation.historyPage).toMatchObject({
        limit: 1,
        hasMore: true,
      });
      const cursor = initial.conversation.historyPage.nextCursor;
      if (cursor === undefined) throw new Error("expected history cursor");

      const loaded = await surface.dispatchAction({
        type: "load-earlier-history",
        input: { sessionId, cursor, limit: 1 },
      });
      expect(loaded.ok).toBe(true);
      expect(loaded.snapshot.conversation.historyExpanded).toBe(true);
      expect(
        loaded.snapshot.conversation.historyRows.map(conversationRowText),
      ).toEqual([
        "first history turn",
        "Fake response from web-test-model",
        "second history turn",
        "Fake response from web-test-model",
      ]);

      const refreshed = await surface.refresh();
      expect(refreshed.conversation.historyExpanded).toBe(true);
      expect(refreshed.conversation.historyRows).toHaveLength(4);
      expect(refreshed.conversation.historyPage.hasMore).toBe(false);
    });
  });

  it("projects and reconciles the Goal Mode journey by invalidation", async () => {
    await withWebSurface(async ({ app, client }) => {
      await seedSession(app, "ses_web_goal");
      await app.selectSession({ sessionId: "ses_web_goal" });
      let goalReads = 0;
      const observedClient = {
        ...client,
        async readGoal(input?: Parameters<typeof client.readGoal>[0]) {
          goalReads += 1;
          return await client.readGoal(input);
        },
      };
      const surface = await createSurface({
        client: observedClient,
        eventLimit: 100,
        now: () => 17_001,
      });
      expect(surface.snapshot().goal.state).toBe("missing");
      const readsAfterInitialSnapshot = goalReads;

      const started = await app.startGoal({
        objective: "Render <Goal> safely",
        successCriteria: ["Goal output is escaped"],
        stopPolicy: {
          maxAttempts: 1,
          maxConsecutiveBlockedAttempts: 1,
        },
      });
      const reconciled = await surface.reconcileEvents({ limit: 100 });
      expect(goalReads).toBeGreaterThan(readsAfterInitialSnapshot);
      expect(reconciled.goal).toMatchObject({
        sessionId: "ses_web_goal",
        goal: {
          goalId: started.goalId,
          objective: "Render <Goal> safely",
        },
      });

      await waitForProductGoalTerminal(app, started.goalId);
      await surface.reconcileEvents({ limit: 100 });
      const readsAfterGoalEvents = goalReads;
      await client.status();
      const ordinaryEventSnapshot = await surface.reconcileEvents({ limit: 100 });
      expect(goalReads).toBe(readsAfterGoalEvents);

    });
  });


  it("falls back to command text input when the product catalog is unavailable", async () => {
    await withWebSurface(async ({ surface }) => {
      const snapshot = surface.snapshot();
      if (!snapshot.commandCatalog.ok) {
        throw new Error("expected the fixture command catalog to be available");
      }
      const unavailable = {
        ...snapshot,
        commandCatalog: {
          ok: false as const,
          command: "readProductCommands" as const,
          error: {
            code: "command_error" as const,
            category: "runtime" as const,
            message: "catalog offline",
          },
          event: snapshot.commandCatalog.event,
        },
        diagnostics: [],
      };
      const base = {
        ...unavailable,
        diagnostics: projectDiagnostics(unavailable),
      };
      const projected = {
        ...base,
        view: buildViewModel(base),
      };
      const previewAction = projected.view.actions.find(
        (action) => action.id === "preview-command",
      );

      expect(projected.view.ready).toBe(true);
      expect(projected.view.commandPalette).toMatchObject({
        state: "unavailable",
        rows: [],
        diagnostics: [],
      });
      expect(previewAction?.fields[0]).toMatchObject({
        name: "commandId",
        kind: "text",
      });
    });
  });
  it("runs a controller loop from typed action to canonical snapshot reconciliation", async () => {
    await withWebSurface(async ({ app, client, observed }) => {
      await seedSession(
        app,
        "ses_controller_workbench",
        "controller conversation turn",
      );
      const controller = await createController({
        client,
        now: () => 11_777,
      });
      const initial = controller.snapshot();

      expect(initial).toMatchObject({
        kind: "web.snapshot",
        view: {
          ready: true,
          layout: "single",
        },
      });

      const updated = await controller.dispatchAction({
        type: "set-layout",
        input: {
          layout: "split",
        },
      });

      expect(updated).toMatchObject({
        ok: true,
        action: "set-layout",
        snapshot: {
          view: {
            layout: "split",
            operationStatus: {
              state: "succeeded",
              action: "set-layout",
            },
          },
        },
      });

      const preferences = await controller.dispatchAction({
        type: "update-preferences",
        input: {
          preferences: {
            theme: "dark",
            density: "compact",
          },
        },
      });
      expect(preferences).toMatchObject({
        ok: true,
        action: "update-preferences",
        snapshot: {
          view: {
            theme: "dark",
            density: "compact",
          },
        },
      });

      const workbench = await controller.dispatchAction({
        type: "set-mode",
        input: {
          mode: "workbench",
        },
      });
      expect(workbench).toMatchObject({
        ok: true,
        action: "set-mode",
        snapshot: {
          view: {
            mode: "workbench",
          },
        },
      });

      const preview = await controller.dispatchAction({
        type: "preview-command",
        input: {
          commandId: "product.agent.submit",
          input: {
            text: "controller preview",
          },
        },
      });
      expect(preview).toMatchObject({
        ok: true,
        action: "preview-command",
        snapshot: {
          commandPreview: {
            state: "runnable",
            commandId: "product.agent.submit",
          },
          view: {
            commandPreview: {
              state: "runnable",
              commandId: "product.agent.submit",
            },
          },
        },
      });

      expect(controller.snapshot().view.layout).toBe("split");
      expect(
        observed.filter((request) => request.operation === "readSurfaceEvents")
          .length,
      ).toBeGreaterThanOrEqual(3);
      expect(
        observed.some(
          (request) =>
            request.operation === "readSurfaceEvents" &&
            request.input?.limit === 20 &&
            request.input.streamId === controller.snapshot().eventStreamId,
        ),
      ).toBe(true);

      await controller.dispatchAction({
        type: "select-session",
        sessionId: "ses_controller_workbench",
      });
      const submitted = await controller.dispatchAction({
        type: "submit-conversation",
        input: {
          text: "controller conversation turn",
          sessionId: "ses_controller_workbench",
        },
      });
      expect(submitted).toMatchObject({
        ok: true,
        action: "submit-conversation",
        snapshot: {
          conversation: {
            sessionId: "ses_controller_workbench",
            operation: {
              kind: "product.conversation-operation",
            },
          },
          view: {
            conversationState: expect.any(String),
          },
        },
      });
      expect(submitted.ok && submitted.snapshot.conversation.historyRows.some(
        (row) => conversationRowText(row).includes("controller conversation turn"),
      )).toBe(true);
    });
  });

  it("handles framework-free request envelopes for future platform hosts", async () => {
    await withWebSurface(async ({ app, client, observed }) => {
      await seedSession(
        app,
        "ses_request_workbench",
        "request envelope conversation turn",
      );
      const controller = await createController({
        client,
        now: () => 11_888,
      });

      const snapshotResponse = await handleRequest(controller, {
        kind: "web.request",
        operation: "snapshot",
        requestId: "req_snapshot",
      });
      expect(snapshotResponse).toMatchObject({
        kind: "web.response",
        ok: true,
        operation: "snapshot",
        requestId: "req_snapshot",
        snapshot: {
          view: {
            ready: true,
            mode: "chat",
          },
        },
      });

      const submitted = await handleRequest(controller, {
        kind: "web.request",
        operation: "dispatchAction",
        requestId: "req_submit",
        action: {
          type: "set-mode",
          input: {
            mode: "diagnostics",
          },
        },
      });
      expect(submitted).toMatchObject({
        ok: true,
        operation: "dispatchAction",
        requestId: "req_submit",
        actionResult: {
          ok: true,
          action: "set-mode",
          snapshot: {
            view: {
              mode: "diagnostics",
            },
          },
        },
      });

      const invalidAction = await handleRequest(controller, {
        kind: "web.request",
        operation: "dispatchAction",
        action: {
          type: "set-layout",
          input: {
            layout: "floating",
          },
        },
      });
      expect(invalidAction).toMatchObject({
        ok: true,
        operation: "dispatchAction",
        actionResult: {
          ok: false,
          action: "set-layout",
          snapshot: {
            view: {
              mode: "diagnostics",
              layout: "single",
            },
          },
        },
      });

      const unknownAction = await handleRequest(controller, {
        kind: "web.request",
        operation: "dispatchAction",
        action: {
          type: "restartGateway",
        },
      });
      expect(unknownAction).toMatchObject({
        ok: false,
        operation: "dispatchAction",
        error: {
          code: "invalid_request",
          field: "action.type",
        },
      });

      const invalidHistoryAction = await handleRequest(controller, {
        kind: "web.request",
        operation: "dispatchAction",
        action: {
          type: "load-earlier-history",
          input: {
            sessionId: "ses_request_workbench",
            cursor: "",
            limit: 201,
          },
        },
      });
      expect(invalidHistoryAction).toMatchObject({
        ok: false,
        operation: "dispatchAction",
        error: {
          code: "invalid_request",
          field: "action.input.cursor",
        },
      });

      const submittedConversation = await handleRequest(
        controller,
        {
          kind: "web.request",
          operation: "dispatchAction",
          requestId: "req_submit_conversation",
          action: {
            type: "submit-conversation",
            input: {
              text: "request envelope submitted conversation",
            },
          },
        },
      );
      expect(submittedConversation).toMatchObject({
        ok: true,
        operation: "dispatchAction",
        requestId: "req_submit_conversation",
        actionResult: {
          ok: true,
          action: "submit-conversation",
          snapshot: {
            conversation: {
              operation: {
                kind: "product.conversation-operation",
              },
            },
          },
        },
      });
      await waitForAppConversationTerminal(app, "ses_request_workbench");

      const selectedWorkbench = await handleRequest(controller, {
        kind: "web.request",
        operation: "dispatchAction",
        requestId: "req_select_workbench",
        action: {
          type: "select-session",
          sessionId: "ses_request_workbench",
        },
      });
      expect(selectedWorkbench).toMatchObject({
        ok: true,
        operation: "dispatchAction",
        actionResult: {
          snapshot: {
            view: {
              selection: {
                kind: "session",
                sessionId: "ses_request_workbench",
              },
            },
          },
        },
      });
      const submittedToSelectedSession = await handleRequest(
        controller,
        {
          kind: "web.request",
          operation: "dispatchAction",
          requestId: "req_submit_selected_conversation",
          action: {
            type: "submit-conversation",
            input: {
              text: "request envelope conversation turn",
              sessionId: "ses_request_workbench",
            },
          },
        },
      );
      expect(submittedToSelectedSession).toMatchObject({
        ok: true,
        operation: "dispatchAction",
        actionResult: {
          ok: true,
          action: "submit-conversation",
          snapshot: {
            conversation: {
              sessionId: "ses_request_workbench",
            },
          },
        },
      });

      const currentOperationId =
        submittedToSelectedSession.ok &&
        submittedToSelectedSession.operation === "dispatchAction" &&
        submittedToSelectedSession.actionResult.ok
          ? submittedToSelectedSession.actionResult.snapshot.conversation.operationId
          : undefined;
      if (currentOperationId === undefined) {
        throw new Error("expected selected conversation operation");
      }
      const steeringRequest = await handleRequest(controller, {
        kind: "web.request",
        operation: "dispatchAction",
        requestId: "req_web_steer_current",
        action: {
          type: "steer-current-response",
          input: {
            operationId: currentOperationId,
            sessionId: "ses_request_workbench",
            text: "focus on the current failure path",
          },
        },
      });
      expect(steeringRequest).toMatchObject({
        ok: true,
        operation: "dispatchAction",
        requestId: "req_web_steer_current",
      });
      expect(
        observed.some(
          (request) =>
            request.operation === "dispatchSurfaceCommand" &&
            request.command.command === "steerTrackedConversationOperation" &&
            request.command.requestId === "req_web_steer_current" &&
            !JSON.stringify(request.command.input).includes("attemptId") &&
            !JSON.stringify(request.command.input).includes("controlId"),
        ),
      ).toBe(true);

      const invalidReconciliation = await handleRequest(
        controller,
        {
          kind: "web.request",
          operation: "reconcileEvents",
          input: {
            limit: 0,
          },
        },
      );
      expect(invalidReconciliation).toMatchObject({
        ok: false,
        operation: "reconcileEvents",
        error: {
          code: "invalid_request",
          field: "input.limit",
        },
        snapshot: {
          view: {
            mode: "diagnostics",
          },
        },
      });

      const unknown = await handleRequest(controller, {
        kind: "web.request",
        operation: "restartGateway",
      });
      expect(unknown).toMatchObject({
        ok: false,
        operation: "restartGateway",
        error: {
          code: "unknown_operation",
          field: "operation",
        },
      });
      expect(controller.snapshot().view.mode).toBe("diagnostics");
      expect(
        observed.some(
          (request) =>
            request.operation === "readSurfaceEvents" &&
            request.input?.limit === 20 &&
            request.input.streamId === controller.snapshot().eventStreamId,
        ),
      ).toBe(true);
    });
  });
});

async function withWebSurface(
  run: (context: {
    readonly app: Shell;
    readonly productSurface: ReturnType<typeof createSurfaceAdapter>;
    readonly client: ReturnType<typeof createHostSurfaceClient>;
    readonly surface: Awaited<ReturnType<typeof createSurface>>;
    readonly observed: SurfaceTransportRequest[];
  }) => Promise<void>,
  shellOptions: Pick<ShellOptions, "extensions" | "productCommands"> = {},
): Promise<void> {
  const storeDir = await createStoreDir();
  const app = await createShell({
    storage: {
      kind: "local-system-service",
      storeDir,
    },
    artifacts: {
      explicitPath: serviceBin,
    },
    modelEndpoint: fakeModelEndpoint(
      "web-test",
      "web-test-model",
    ),
    ...shellOptions,
  });
  try {
    const productSurface = createSurfaceAdapter(app);
    const observed: SurfaceTransportRequest[] = [];
    const client = createHostSurfaceClient({
      surface: productSurface,
      observeRequest(request) {
        observed.push(request);
      },
    });
    const surface = await createSurface({
      client,
      now: () => 11_001,
    });
    await run({ app, productSurface, client, surface, observed });
  } finally {
    await app.dispose();
  }
}

type WebCatalogSource = NonNullable<ShellOptions["extensions"]>["source"];
type WebCatalogGeneration = ReturnType<WebCatalogSource["current"]>;
type WebExecutionInvalidationSource = NonNullable<
  NonNullable<ShellOptions["productCommands"]>["executionInvalidations"]
>;

function createWebExecutionInvalidations(): {
  readonly source: WebExecutionInvalidationSource;
  publish(reference: Parameters<
    Parameters<
      WebExecutionInvalidationSource["subscribeCommandExecutionInvalidations"]
    >[0]
  >[0]): void;
} {
  const listeners = new Set<Parameters<
    WebExecutionInvalidationSource["subscribeCommandExecutionInvalidations"]
  >[0]>();
  return {
    source: {
      subscribeCommandExecutionInvalidations(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    publish(reference) {
      for (const listener of listeners) listener(reference);
    },
  };
}

function createWebCatalog(initialRevision: string): {
  readonly source: WebCatalogSource;
  publish(revision: string): boolean;
} {
  let current = emptyWebCatalogGeneration(initialRevision);
  const listeners = new Set<Parameters<WebCatalogSource["subscribe"]>[0]>();
  return {
    source: {
      current: () => current,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    publish(revision) {
      if (revision === current.revision) return false;
      current = emptyWebCatalogGeneration(revision);
      for (const listener of listeners) listener(current);
      return true;
    },
  };
}

function emptyWebCatalogGeneration(revision: string): WebCatalogGeneration {
  const domain = () => ({ all: [], byId: new Map() });
  return {
    revision,
    snapshot: {
      contributions: [],
      byDomain: {
        instruction: domain(),
        skill: domain(),
        command: domain(),
        agent: domain(),
        tool: domain(),
        provider_catalog: domain(),
        lifecycle_hook: domain(),
      },
      diagnostics: [],
    },
  };
}

async function createStoreDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-web-test-"));
  tempDirs.push(dir);
  return dir;
}

async function seedSession(
  app: Shell,
  sessionId: string,
  title = sessionId,
): Promise<void> {
  const submitted = await app.submitConversationOperation({
    sessionId,
    text: title,
  });
  if (submitted.kind !== "product.conversation-operation.found") {
    throw new Error(`session seed was rejected: ${submitted.kind}`);
  }
  await waitForAppConversationTerminal(app, sessionId);
}

async function waitForAppConversationTerminal(
  app: Shell,
  sessionId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const operation = await app.readTrackedConversationOperation({ sessionId });
    if (
      operation.kind === "product.conversation-operation.found" &&
      operation.operation.capabilities.terminal
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`conversation did not become terminal: ${sessionId}`);
}

async function waitForProductGoalTerminal(
  app: Shell,
  goalId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await app.readGoal({ goalId });
    if (
      result.kind === "product.goal.found" &&
      !["active", "paused", "blocked", "cancel_requested"].includes(
        result.goal.state,
      )
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Goal did not become terminal: ${goalId}`);
}

async function waitForConversationTerminal(
  surface: Awaited<ReturnType<typeof createSurface>>,
  sessionId: string,
): Promise<Snapshot> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const snapshot = await surface.reconcileEvents({ limit: 20 });
    if (
      snapshot.conversation.sessionId === sessionId &&
      snapshot.conversation.operation?.capabilities.terminal === true
    ) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `conversation operation did not become terminal: ${sessionId}`,
  );
}

async function waitForSideQueryTerminal(
  surface: Awaited<ReturnType<typeof createSurface>>,
): Promise<Snapshot> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const snapshot = await surface.reconcileEvents({ limit: 20 });
    if (
      snapshot.sideQuery.state === "succeeded" ||
      snapshot.sideQuery.state === "failed" ||
      snapshot.sideQuery.state === "cancelled"
    ) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("side query did not become terminal");
}

function countOccurrences(value: string, pattern: string): number {
  return value.split(pattern).length - 1;
}

function conversationRowText(row: {
  readonly parts: readonly ConversationPresentationPart[];
}): string {
  return row.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
}

function withMode(
  snapshot: Snapshot,
  mode: "chat" | "workbench" | "diagnostics",
): Snapshot {
  return {
    ...snapshot,
    view: {
      ...snapshot.view,
      mode,
      settings: {
        ...snapshot.view.settings,
        renderer: {
          ...snapshot.view.settings.renderer,
          mode,
        },
      },
    },
  };
}

function fakeModelEndpoint(
  id: string,
  modelId: string,
): NonNullable<ShellOptions["modelEndpoint"]> {
  return {
    id,
    connection: { id, providerId: "fake" },
    protocol: { id: "fake" },
    model: {
      id: modelId,
      operations: ["conversation"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: [],
      catalog: {
        source: "builtin",
        catalogId: `web.test.${id}`,
        revision: "1",
      },
    },
  };
}

function imageModelEndpoint(
  id: string,
): NonNullable<ShellOptions["modelEndpoint"]> {
  return {
    id,
    connection: { id, providerId: "openai" },
    protocol: { id: "openai-images" },
    model: {
      id: `${id}-model`,
      operations: ["image.generate"],
      inputModalities: ["text"],
      outputModalities: ["image"],
      features: [],
      catalog: {
        source: "custom",
        catalogId: `web.test.${id}`,
        revision: "1",
      },
    },
  };
}

function openAIModelEndpoint(request: {
  readonly id: string;
  readonly modelId: string;
  readonly baseUrl: string;
  readonly secretRef?: string;
}): NonNullable<ShellOptions["modelEndpoint"]> {
  return {
    id: request.id,
    connection: {
      id: request.id,
      providerId: "openai-compatible",
      baseUrl: request.baseUrl,
      ...(request.secretRef === undefined
        ? {}
        : { secretRef: request.secretRef }),
    },
    protocol: { id: "openai-chat-completions" },
    model: {
      id: request.modelId,
      operations: ["conversation"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: ["tool_calling"],
      catalog: {
        source: "custom",
        catalogId: `web.test.${request.id}`,
        revision: "1",
      },
    },
  };
}
