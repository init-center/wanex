import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createProductAppShell,
  createProductAppSurfaceAdapter,
  type ProductAppShell
} from "@wanex/product-app"
import {
  type ProductAppSurfaceTransportRequest
} from "@wanex/product-app/surface-client"
import {
  createProductAppWebHostSurfaceClient,
  sendProductAppWebHostSurfaceMessage
} from "../src/host.js"
import {
  createProductAppWebController,
  createProductAppWebSurface,
  escapeHtml,
  handleProductAppWebRequest,
  parseProductAppWebActionInput,
  buildProductAppWebViewModel,
  productAppWebDiagnostics,
  renderProductAppWebHtml,
  renderProductAppWebStylesheet,
  productAppWebExecutionActivityFromResult,
  type ProductAppWebSnapshot
} from "../src/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/product-app-web", () => {
  it.each([
    ["pending", "submitted"],
    ["ready", "submitted"],
    ["running", "running"],
    ["retry_scheduled", "retrying"],
    ["succeeded", "succeeded"],
    ["failed", "failed"],
    ["cancelled", "cancelled"]
  ] as const)("projects %s execution activity as %s", (schedulerState, state) => {
    const activity = productAppWebExecutionActivityFromResult(
      {
        kind: "found",
        reference: { kind: "job", id: "job_web_projection" },
        activity: {
          kind: "app-shell.execution.job",
          jobKind: "plugin.action",
          state: schedulerState,
          attempt: 1,
          maxAttempts: 3,
          scheduledAt: 10,
          createdAt: 9,
          updatedAt: 11
        }
      },
      12
    )

    expect(activity).toMatchObject({
      state,
      reference: { kind: "job", id: "job_web_projection" },
      schedulerState,
      jobKind: "plugin.action"
    })
  })

  it("tracks command job references and refreshes them explicitly and while polling", async () => {
    await withWebSurface(async ({ app, client }) => {
      await app.startWorkbench({
        text: "seed tracked web execution",
        sessionId: "ses_web_execution_activity",
        jobId: "job_web_execution_activity"
      })
      const trackedClient = {
        ...client,
        async executeProductCommand() {
          const original = await client.executeProductCommand({
            commandId: "product.status"
          })
          if (!original.ok || original.value.kind !== "completed") {
            return original
          }
          return {
            ...original,
            value: {
              ...original.value,
              summary: {
                ...original.value.summary,
                references: [
                  { kind: "job" as const, id: "job_web_execution_activity" }
                ]
              }
            }
          }
        }
      }
      const tracked = await createProductAppWebSurface({
        client: trackedClient,
        now: () => 12_345
      })

      const executed = await tracked.dispatchAction({
        type: "execute-command",
        input: { commandId: "product.status" }
      })
      expect(executed.snapshot.executionActivity).toMatchObject({
        state: "succeeded",
        reference: { kind: "job", id: "job_web_execution_activity" },
        schedulerState: "succeeded"
      })

      const refreshed = await tracked.dispatchAction({
        type: "refresh-execution",
        input: { kind: "job", id: "job_web_execution_activity" }
      })
      expect(refreshed.snapshot.executionActivity.state).toBe("succeeded")

      const polled = await tracked.pollEvents()
      expect(polled.executionActivity.state).toBe("succeeded")
      const html = renderProductAppWebHtml(
        withProductAppWebMode(polled, "workbench")
      )
      expect(html).toContain('data-execution-activity-state="succeeded"')
      expect(html).toContain('data-action="refresh-execution"')
      expect(html).not.toContain("payload")
      expect(html).not.toContain("lastError")
      expect(html).not.toContain("leaseToken")
    })
  })

  it("projects Product App state into a safe web view model and HTML", async () => {
    await withWebSurface(async ({ surface }) => {
      const snapshot = surface.snapshot()
      const html = renderProductAppWebHtml(snapshot)

      expect(snapshot).toMatchObject({
        kind: "product-app-web.snapshot",
        descriptor: {
          ok: true,
          value: {
            commandCount: 18
          }
        },
        view: {
          title: "Wanex Product App",
          ready: true,
          mode: "chat",
          layout: "single",
          theme: "system",
          density: "comfortable",
          settings: {
            profile: {
              configuredProviderProfileId: "product-app-web-test",
              activeProviderProfileId: "product-app-web-test",
              readiness: {
                status: "ready",
                reason: "active_profile_ready",
                activeProfileId: "product-app-web-test",
                profileCount: 1,
                canRun: true,
                attentionRequired: false,
                requiresApiKey: false,
                hasApiKey: false
              },
              profileCount: 1,
              profiles: [
                expect.objectContaining({
                  id: "product-app-web-test",
                  modelId: "product-app-web-test-model",
                  active: true,
                  hasApiKey: false
                })
              ]
            },
            renderer: {
              layout: "single",
              mode: "chat",
              theme: "system",
              density: "comfortable",
              availableLayouts: ["single", "split", "diagnostics"],
              availableModes: ["chat", "workbench", "diagnostics"],
              availableThemes: ["system", "light", "dark"],
              availableDensities: ["comfortable", "compact"]
            },
            privacy: {
              exposesStorePath: false,
              exposesServiceBinaryPath: false,
              exposesSecrets: false
            },
            integration: {
              rendererCalls: "app-owned-ipc-or-api",
              rendererMayOpenStorage: false,
              rendererMayReceiveStorePath: false,
              rendererMayReceiveServiceBinaryPath: false
            }
          },
          commandCount: 18,
          productCommandCount: 15,
          commandCatalog: {
            kind: "product-app-web.command-catalog",
            state: "ready",
            message: "15 product commands available",
            rows: expect.arrayContaining([
              expect.objectContaining({
                id: "product.agent.run",
                handlerRef: "wanex.product-app.backend.runAgentTurn",
                sourceKind: "builtin",
                trust: "trusted"
              })
            ]),
            diagnostics: []
          },
          sessionCount: 0,
          recentSessions: [],
          workbenchState: "idle",
          workbenchRowCount: 0,
          workbenchCanContinue: false,
          operationStatus: {
            kind: "product-app-web.operation-status",
            state: "idle",
            message: "No operation yet"
          },
          commandPreview: {
            kind: "product-app-web.command-preview",
            state: "empty",
            message: "No command preview yet",
            inputAccepted: false
          },
          commandExecution: {
            kind: "product-app-web.command-execution",
            state: "empty",
            message: "No command execution yet",
            references: []
          },
          providerRunGate: {
            state: "ready",
            status: "ready",
            reason: "active_profile_ready",
            activeProfileId: "product-app-web-test",
            canRun: true,
            canSubmitWorkbench: true,
            attentionRequired: false,
            message: "Provider ready"
          },
          actions: expect.arrayContaining([
            expect.objectContaining({
              id: "refresh",
              mutatesState: false
            }),
            expect.objectContaining({
              id: "select-session",
              mutatesState: true
            }),
            expect.objectContaining({
              id: "set-active-provider-profile",
              mutatesState: true
            }),
            expect.objectContaining({
              id: "preview-command",
              mutatesState: false
            }),
            expect.objectContaining({
              id: "execute-command",
              mutatesState: true
            }),
            expect.objectContaining({
              id: "open-workbench",
              mutatesState: true
            }),
            expect.objectContaining({
              id: "start-workbench",
              mutatesState: true
            }),
            expect.objectContaining({
              id: "continue-workbench",
              mutatesState: true
            })
          ])
        }
      })
      expect(html).toContain('data-wanex-product-app-web="surface"')
      expect(html).toContain('data-product-layout="single"')
      expect(html).toContain('data-product-mode="chat"')
      expect(html).toContain('data-product-theme="system"')
      expect(html).toContain('data-product-density="comfortable"')
      expect(html).toContain('data-mode-navigation')
      expect(html).toContain('data-mode-tab="chat" aria-current="page"')
      expect(html).toContain('data-mode-tab="workbench"')
      expect(html).toContain('data-mode-tab="diagnostics"')
      expect(countOccurrences(html, 'data-action="set-mode"')).toBe(3)
      expect(html).toContain('data-workbench-composer-kind="start"')
      expect(html).toContain('data-workbench-empty-state')
      expect(html).toContain("Start a workbench session")
      expect(html).toContain('data-workbench-composer-status')
      expect(html).toContain('aria-live="polite"')
      expect(html).toContain("Ready to start")
      expect(html).toContain('data-product-shell-header')
      expect(html).toContain('data-region="workspace"')
      expect(html).toContain('data-region="left"')
      expect(html).toContain('data-region="main"')
      expect(html).toContain('data-panel="sessions"')
      expect(html).toContain('data-session-empty-state')
      expect(html).toContain("No recent sessions")
      expect(html).toContain('data-panel="workbench"')
      expect(html).toContain('data-panel="provider-run-gate"')
      expect(html).toContain('data-provider-run-gate-state="ready"')
      expect(html).toContain('data-provider-can-run="true"')
      expect(html).toContain("Provider ready")
      expect(html).toContain('data-workbench-state="idle"')
      expect(html).not.toContain('data-panel="summary"')
      expect(html).not.toContain('data-panel="settings"')
      expect(html).not.toContain('data-panel="actions"')
      expect(html).not.toContain('data-panel="command-preview"')
      expect(html).not.toContain('data-panel="command-execution"')
      expect(html).not.toContain('data-panel="command-catalog"')
      expect(html).not.toContain('data-panel="events"')
      expect(html).not.toContain('data-panel="diagnostics"')
      expect(html).toContain('data-workbench-composer-state="ready"')
      expect(html).not.toContain('data-workbench-composer-state="blocked"')
      expect(html).toContain("<h1>Wanex Product App</h1>")
      expect(html).not.toContain(serviceBin)

      const workbenchHtml = renderProductAppWebHtml(
        withProductAppWebMode(snapshot, "workbench")
      )
      expect(workbenchHtml).toContain('data-product-mode="workbench"')
      expect(workbenchHtml).toContain('data-panel="actions"')
      expect(workbenchHtml).toContain('data-action="preview-command"')
      expect(workbenchHtml).toContain('data-action="execute-command"')
      expect(workbenchHtml).toContain('data-panel="command-preview"')
      expect(workbenchHtml).toContain('data-panel="command-execution"')
      expect(workbenchHtml).toContain('data-panel="execution-activity"')
      expect(workbenchHtml).toContain('data-panel="command-catalog"')
      expect(workbenchHtml).toContain('data-panel="provider-run-gate"')
      expect(workbenchHtml).toContain('data-panel="workbench"')
      expect(workbenchHtml).not.toContain('data-panel="summary"')
      expect(workbenchHtml).not.toContain('data-panel="settings"')
      expect(workbenchHtml).not.toContain('data-panel="events"')
      expect(workbenchHtml).not.toContain('data-panel="diagnostics"')

      const diagnosticsHtml = renderProductAppWebHtml(
        withProductAppWebMode(snapshot, "diagnostics")
      )
      expect(diagnosticsHtml).toContain('data-product-mode="diagnostics"')
      expect(diagnosticsHtml).toContain('data-panel="summary"')
      expect(diagnosticsHtml).toContain('data-panel="settings"')
      expect(diagnosticsHtml).toContain('data-panel="events"')
      expect(diagnosticsHtml).toContain('data-panel="diagnostics"')
      expect(diagnosticsHtml).not.toContain('data-panel="actions"')
      expect(diagnosticsHtml).not.toContain('data-panel="command-preview"')
      expect(diagnosticsHtml).not.toContain('data-panel="command-execution"')
      expect(diagnosticsHtml).not.toContain('data-panel="command-catalog"')
      expect(diagnosticsHtml).not.toContain('data-panel="workbench"')

      const emptyEventsHtml = renderProductAppWebHtml({
        ...withProductAppWebMode(snapshot, "diagnostics"),
        events: {
          ok: true,
          events: []
        },
        view: {
          ...withProductAppWebMode(snapshot, "diagnostics").view,
          eventCount: 0
        }
      })
      expect(emptyEventsHtml).toContain('data-events-empty-state')
      expect(emptyEventsHtml).toContain("No events yet")

      const stylesheet = renderProductAppWebStylesheet()
      expect(stylesheet).toContain('[data-wanex-product-app-web="surface"]')
      expect(stylesheet).toContain('[data-product-layout="single"]')
      expect(stylesheet).toContain('[data-product-layout="split"]')
      expect(stylesheet).toContain('[data-product-layout="diagnostics"]')
      expect(stylesheet).toContain('[data-product-mode="workbench"]')
      expect(stylesheet).toContain('[data-product-mode="diagnostics"]')
      expect(stylesheet).toContain('[data-product-theme="light"]')
      expect(stylesheet).toContain('[data-product-theme="dark"]')
      expect(stylesheet).toContain('[data-product-density="compact"]')
      expect(stylesheet).toContain('[data-mode-navigation]')
      expect(stylesheet).toContain('[data-mode-tab][aria-current="page"]')
      expect(stylesheet).toContain('[data-region="workspace"]')
      expect(stylesheet).toContain('[data-panel="workbench"]')
      expect(stylesheet).toContain('[data-settings-controls]')
      expect(stylesheet).toContain('[data-provider-profile-list]')
      expect(stylesheet).toContain('[data-workbench-empty-state]')
      expect(stylesheet).toContain('[data-panel="provider-run-gate"]')
      expect(stylesheet).toContain('[data-panel="command-preview"]')
      expect(stylesheet).toContain('[data-panel="command-execution"]')
      expect(stylesheet).toContain('[data-command-catalog-list]')
      expect(stylesheet).toContain('[data-command-id]')
      expect(stylesheet).toContain('[data-command-preview-state="rejected"]')
      expect(stylesheet).toContain('[data-panel="operation-status"]')
      expect(stylesheet).toContain('[data-operation-state="blocked"]')
      expect(stylesheet).toContain('[data-session-empty-state]')
      expect(stylesheet).toContain('[data-events-empty-state]')
      expect(stylesheet).toContain('[data-diagnostics-empty-state]')
      expect(stylesheet).toContain('[data-workbench-composer-state="submitting"]')
      expect(stylesheet).not.toContain(serviceBin)
    })
  })

  it("dispatches actions through the Product App surface client and polls events by cursor", async () => {
    await withWebSurface(async ({ app, productSurface, surface, observed }) => {
      await app.providerProfiles.upsertProviderProfile({
        profile: {
          id: "product-app-web-second-provider",
          kind: "fake",
          providerId: "fake",
          modelId: "product-app-web-second-model"
        }
      })
      const providerSnapshot = await surface.refresh()
      expect(providerSnapshot.view.settings.profile.profiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "product-app-web-second-provider",
            active: false
          })
        ])
      )
      const switchedProvider = await surface.dispatchAction({
        type: "set-active-provider-profile",
        input: {
          profileId: "product-app-web-second-provider"
        }
      })
      expect(switchedProvider).toMatchObject({
        ok: true,
        action: "set-active-provider-profile",
        snapshot: {
          view: {
            settings: {
              profile: {
                activeProviderProfileId: "product-app-web-second-provider",
                profiles: expect.arrayContaining([
                  expect.objectContaining({
                    id: "product-app-web-second-provider",
                    active: true
                  })
                ])
              }
            }
          }
        }
      })

      const selected = await surface.dispatchAction({
        type: "select-session",
        sessionId: "ses_product_app_web"
      })
      expect(selected).toMatchObject({
        ok: true,
        action: "select-session",
        snapshot: {
          view: {
            selectedSessionId: "ses_product_app_web"
          }
        }
      })
      const cursorAfterSelect = surface.snapshot().eventCursor

      const parsedMode = parseProductAppWebActionInput({
        action: "set-mode",
        fields: {
          mode: "workbench"
        }
      })
      expect(parsedMode).toMatchObject({
        ok: true,
        action: {
          type: "set-mode",
          input: {
            mode: "workbench"
          }
        }
      })
      if (!parsedMode.ok) {
        throw new Error(parsedMode.error.message)
      }
      const mode = await surface.dispatchAction(parsedMode.action)
      expect(mode).toMatchObject({
        ok: true,
        action: "set-mode",
        snapshot: {
          view: {
            mode: "workbench"
          }
        }
      })
      expect(surface.snapshot().eventCursor).toBeGreaterThan(cursorAfterSelect)

      const preview = await surface.dispatchAction({
        type: "preview-command",
        input: {
          commandId: "product.agent.run",
          input: {
            text: "hello from Product App Web preview"
          }
        }
      })
      expect(preview).toMatchObject({
        ok: true,
        action: "preview-command",
        snapshot: {
          commandPreview: {
            kind: "product-app-web.command-preview",
            state: "runnable",
            commandId: "product.agent.run",
            inputAccepted: true,
            message: "Command is runnable"
          },
          view: {
            commandPreview: {
              state: "runnable",
              commandId: "product.agent.run",
              inputAccepted: true
            },
            operationStatus: {
              state: "succeeded",
              action: "preview-command"
            },
            workbenchState: "idle"
          }
        }
      })
      const previewHtml = renderProductAppWebHtml(
        withProductAppWebMode(preview.snapshot, "workbench")
      )
      expect(previewHtml).toContain('data-panel="command-preview"')
      expect(previewHtml).toContain('data-command-preview-state="runnable"')
      expect(previewHtml).toContain(
        'data-command-preview-command-id="product.agent.run"'
      )
      expect(previewHtml).toContain("<dt>Input</dt><dd>accepted</dd>")

      const execution = await surface.dispatchAction({
        type: "execute-command",
        input: {
          commandId: "product.status"
        }
      })
      expect(execution).toMatchObject({
        ok: true,
        action: "execute-command",
        snapshot: {
          commandExecution: {
            state: "completed",
            commandId: "product.status",
            handlerRef: "wanex.product-app.backend.status",
            message: "Command completed",
            valueKind: "object",
            references: []
          },
          view: {
            commandExecution: {
              state: "completed",
              commandId: "product.status"
            },
            operationStatus: {
              state: "succeeded",
              action: "execute-command"
            }
          }
        }
      })
      const executionHtml = renderProductAppWebHtml(
        withProductAppWebMode(execution.snapshot, "workbench")
      )
      expect(executionHtml).toContain(
        'data-command-execution-state="completed"'
      )
      expect(executionHtml).toContain("<dt>Value kind</dt><dd>object</dd>")
      expect(executionHtml).not.toContain('"value"')

      const opened = await surface.dispatchAction({
        type: "open-workbench"
      })
      expect(opened).toMatchObject({
        ok: true,
        action: "open-workbench",
        snapshot: {
          workbench: {
            state: "ready",
            sessionId: "ses_product_app_web",
            canContinue: true,
            summary: {
              rowCount: 0
            }
          },
          view: {
            workbenchState: "ready",
            workbenchCanContinue: true
          }
        }
      })

      const continued = await surface.dispatchAction({
        type: "continue-workbench",
        input: {
          text: "hello from Product App Web workbench"
        }
      })
      expect(continued.ok).toBe(true)
      expect(continued.snapshot.workbench).toMatchObject({
        state: "ready",
        sessionId: "ses_product_app_web",
        canContinue: true
      })
      expect(continued.snapshot.workbench.summary.rowCount).toBeGreaterThan(0)
      expect(continued.snapshot.workbench.summary.inputCount).toBeGreaterThan(0)
      expect(
        continued.snapshot.workbench.rows.some((row) =>
          row.text.includes("hello from Product App Web workbench")
        )
      ).toBe(true)
      expect(continued.snapshot.view).toMatchObject({
        sessionCount: 1,
        selectedSessionTitle: "hello from Product App Web workbench",
        recentSessions: [
          expect.objectContaining({
            sessionId: "ses_product_app_web",
            label: "hello from Product App Web workbench",
            selected: true,
            status: "active"
          })
        ]
      })
      const selectSessionAction = continued.snapshot.view.actions.find(
        (action) => action.id === "select-session"
      )
      expect(selectSessionAction?.fields[0]).toMatchObject({
        kind: "select",
        options: [
          {
            value: "ses_product_app_web",
            label: "hello from Product App Web workbench"
          }
        ]
      })
      const continuedHtml = renderProductAppWebHtml(continued.snapshot)
      expect(continuedHtml).toContain("data-workbench-composer")
      expect(continuedHtml).toContain('data-session-id="ses_product_app_web"')
      expect(continuedHtml).toContain('data-session-list')
      expect(continuedHtml).toContain("Ready to send")

      const polled = await surface.pollEvents({ limit: 5 })
      expect(polled.events).toMatchObject({
        ok: true,
        events: []
      })
      expect(observed.map((request) => request.operation)).toEqual(
        expect.arrayContaining([
          "descriptor",
          "dispatchSurfaceCommand",
          "readSurfaceEvents"
        ])
      )
      expect(
        observed.some(
          (request) =>
            request.operation === "readSurfaceEvents" &&
            request.input?.afterSequence === cursorAfterSelect
        )
      ).toBe(true)

      const descriptor = await sendProductAppWebHostSurfaceMessage(
        productSurface,
        {
          kind: "product-app.surface-transport.request",
          operation: "descriptor",
          requestId: "web_host_descriptor"
        }
      )
      expect(descriptor).toMatchObject({
        ok: true,
        operation: "descriptor",
        requestId: "web_host_descriptor"
      })
    })
  })

  it("renders redacted provider profile rows without leaking secrets", async () => {
    await withWebSurface(async ({ app, surface }) => {
      await app.providerProfiles.upsertProviderProfile({
        profile: {
          id: "product-app-web-secret-provider",
          kind: "openai-compatible",
          providerId: "openai-compatible",
          modelId: "product-app-web-secret-model",
          baseUrl: "https://provider.example.test/v1",
          apiKey: "product-app-web-secret-value"
        },
        makeActive: true
      })

      const snapshot = await surface.refresh()
      const html = renderProductAppWebHtml(
        withProductAppWebMode(snapshot, "diagnostics")
      )

      expect(snapshot.view.settings.profile.profiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "product-app-web-secret-provider",
            active: true,
            hasApiKey: true,
            apiKeyRedacted: "***",
            baseUrl: "https://provider.example.test/v1"
          })
        ])
      )
      expect(snapshot.view.settings.profile.readiness).toMatchObject({
        status: "ready",
        reason: "active_profile_ready",
        activeProfileId: "product-app-web-secret-provider",
        profileCount: 2,
        canRun: true,
        attentionRequired: false,
        requiresApiKey: true,
        hasApiKey: true
      })
      expect(html).toContain(
        'data-provider-profile-id="product-app-web-secret-provider"'
      )
      expect(html).toContain('data-provider-readiness-status="ready"')
      expect(html).toContain('data-provider-profile-active="true"')
      expect(html).toContain('data-provider-key-status="redacted"')
      expect(html).toContain("<dt>Provider can run</dt><dd>yes</dd>")
      expect(html).toContain("key redacted")
      expect(html).toContain("https://provider.example.test/v1")
      expect(html).not.toContain("product-app-web-secret-value")
    })
  })

  it("blocks the workbench composer when provider readiness needs host setup", async () => {
    await withWebSurface(async ({ app, surface }) => {
      await app.providerProfiles.upsertProviderProfile({
        profile: {
          id: "product-app-web-missing-key-provider",
          kind: "openai-compatible",
          providerId: "openai-compatible",
          modelId: "product-app-web-missing-key-model",
          baseUrl: "https://provider.example.test/v1"
        },
        makeActive: true
      })

      const snapshot = await surface.refresh()
      const html = renderProductAppWebHtml(snapshot)

      expect(snapshot.view.providerRunGate).toEqual({
        state: "blocked",
        status: "missing_required_api_key",
        reason: "active_profile_missing_api_key",
        activeProfileId: "product-app-web-missing-key-provider",
        canRun: false,
        canSubmitWorkbench: false,
        attentionRequired: true,
        message: "Host setup required"
      })
      expect(snapshot.view.settings.profile.readiness).toMatchObject({
        status: "missing_required_api_key",
        activeProfileId: "product-app-web-missing-key-provider",
        canRun: false,
        attentionRequired: true,
        requiresApiKey: true,
        hasApiKey: false
      })
      expect(html).toContain('data-panel="provider-run-gate"')
      expect(html).toContain('data-provider-run-gate-state="blocked"')
      expect(html).toContain('data-provider-can-run="false"')
      expect(html).toContain('data-provider-attention-required="true"')
      expect(html).toContain("Host setup required")
      expect(html).toContain('data-workbench-composer-state="blocked"')
      expect(html).toContain('<textarea name="text" required disabled>')
      expect(html).toContain('<button type="submit" disabled>Start</button>')
      expect(html).not.toContain('data-action="configureProviderProfile"')
      expect(html).not.toContain("apiKey")
      expect(html).not.toContain(serviceBin)

      const preview = await surface.dispatchAction({
        type: "preview-command",
        input: {
          commandId: "product.agent.run",
          input: {
            text: "web preview should not bypass provider setup"
          }
        }
      })
      expect(preview).toMatchObject({
        ok: true,
        action: "preview-command",
        snapshot: {
          commandPreview: {
            state: "rejected",
            commandId: "product.agent.run",
            reason: "provider_not_ready",
            inputAccepted: false,
            provider: {
              status: "missing_required_api_key",
              activeProfileId: "product-app-web-missing-key-provider",
              canRun: false,
              attentionRequired: true
            }
          },
          workbench: {
            state: "idle"
          },
          view: {
            operationStatus: {
              state: "blocked",
              action: "preview-command"
            },
            commandPreview: {
              state: "rejected",
              reason: "provider_not_ready"
            },
            providerRunGate: {
              state: "blocked",
              canSubmitWorkbench: false
            }
          }
        }
      })
      const previewHtml = renderProductAppWebHtml(
        withProductAppWebMode(preview.snapshot, "workbench")
      )
      expect(previewHtml).toContain('data-command-preview-state="rejected"')
      expect(previewHtml).toContain("<dt>Reason</dt><dd>provider_not_ready</dd>")
      expect(previewHtml).toContain(
        "<dt>Provider</dt><dd>missing_required_api_key</dd>"
      )
      expect(previewHtml).toContain("<dt>Provider can run</dt><dd>no</dd>")
      expect(previewHtml).not.toContain('data-action="configureProviderProfile"')
      expect(previewHtml).not.toContain("apiKey")

      const execution = await surface.dispatchAction({
        type: "execute-command",
        input: {
          commandId: "product.agent.run",
          input: {
            text: "web execution should not bypass provider setup"
          }
        }
      })
      expect(execution).toMatchObject({
        ok: true,
        action: "execute-command",
        snapshot: {
          commandExecution: {
            state: "rejected",
            commandId: "product.agent.run",
            reason: "provider_not_ready",
            references: [],
            provider: {
              status: "missing_required_api_key",
              canRun: false
            }
          },
          view: {
            operationStatus: {
              state: "blocked",
              action: "execute-command"
            }
          }
        }
      })
      expect(
        renderProductAppWebHtml(
          withProductAppWebMode(execution.snapshot, "workbench")
        )
      ).toContain(
        'data-command-execution-state="rejected"'
      )

      const submitted = await surface.dispatchAction({
        type: "start-workbench",
        input: {
          text: "web should not bypass provider setup"
        }
      })
      expect(submitted).toMatchObject({
        ok: true,
        action: "start-workbench",
        snapshot: {
          workbench: {
            state: "failed",
            error: {
              code: "provider_not_ready",
              category: "validation"
            }
          },
          view: {
            workbenchState: "failed",
            operationStatus: {
              state: "blocked",
              action: "start-workbench"
            },
            providerRunGate: {
              state: "blocked",
              canSubmitWorkbench: false
            }
          }
        }
      })
      expect(submitted.snapshot.view.selectedSessionId).toBeUndefined()
      expect(submitted.snapshot.view.operationStatus.message).toContain(
        "provider is not ready"
      )
      expect(JSON.stringify(submitted)).not.toContain(serviceBin)
    })
  })

  it("starts a workbench session from web action input without a selected session", async () => {
    await withWebSurface(async ({ surface }) => {
      const started = await surface.dispatchAction({
        type: "start-workbench",
        input: {
          text: "hello from Product App Web start"
        }
      })

      expect(started).toMatchObject({
        ok: true,
        action: "start-workbench",
        snapshot: {
          workbench: {
            state: "ready",
            canContinue: true,
            summary: {
              inputCount: 1,
              messageCount: 1,
              latestUserText: "hello from Product App Web start"
            }
          },
          view: {
            workbenchState: "ready",
            workbenchCanContinue: true,
            sessionCount: 1,
            selectedSessionTitle: "hello from Product App Web start"
          }
        }
      })
      expect(started.snapshot.workbench.sessionId).toMatch(/^ses_/)
      expect(started.snapshot.view.selectedSessionId).toBe(
        started.snapshot.workbench.sessionId
      )

      const html = renderProductAppWebHtml(started.snapshot)
      expect(html).toContain('data-workbench-composer-kind="continue"')
      expect(html).toContain('data-action="continue-workbench"')
      expect(html).toContain('data-workbench-composer-status')
      expect(html).not.toContain('data-workbench-empty-state')
      expect(html).toContain("hello from Product App Web start")
    })
  })

  it("escapes HTML projected from product state", async () => {
    await withWebSurface(async ({ surface }) => {
      await surface.dispatchAction({
        type: "select-session",
        sessionId: "ses_<script>alert('x')</script>"
      })
      const html = renderProductAppWebHtml(surface.snapshot())

      expect(html).toContain("ses_&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;")
      expect(html).not.toContain("<script>alert")
      expect(escapeHtml("\"<&>'")).toBe("&quot;&lt;&amp;&gt;&#39;")
    })
  })

  it("falls back to command text input when the product catalog is unavailable", async () => {
    await withWebSurface(async ({ surface }) => {
      const snapshot = surface.snapshot()
      if (!snapshot.commandCatalog.ok) {
        throw new Error("expected the fixture command catalog to be available")
      }
      const unavailable = {
        ...snapshot,
        commandCatalog: {
          ok: false as const,
          command: "readProductCommands" as const,
          error: {
            code: "command_error" as const,
            category: "runtime" as const,
            message: "catalog offline"
          },
          event: snapshot.commandCatalog.event
        },
        diagnostics: []
      }
      const base = {
        ...unavailable,
        diagnostics: productAppWebDiagnostics(unavailable)
      }
      const projected = {
        ...base,
        view: buildProductAppWebViewModel(base)
      }
      const html = renderProductAppWebHtml(
        withProductAppWebMode(projected, "workbench")
      )
      const previewAction = projected.view.actions.find(
        (action) => action.id === "preview-command"
      )

      expect(projected.view.ready).toBe(true)
      expect(projected.view.commandCatalog).toMatchObject({
        state: "unavailable",
        rows: [],
        diagnostics: []
      })
      expect(previewAction?.fields[0]).toMatchObject({
        name: "commandId",
        kind: "text"
      })
      expect(html).toContain('data-command-catalog-state="unavailable"')
      expect(html).toContain("Product command catalog unavailable")
      expect(html).toContain('<input name="commandId" type="text" required>')
    })
  })

  it("escapes command catalog metadata before rendering HTML", async () => {
    await withWebSurface(async ({ surface }) => {
      const snapshot = surface.snapshot()
      if (!snapshot.commandCatalog.ok) {
        throw new Error("expected the fixture command catalog to be available")
      }
      const base = {
        ...snapshot,
        commandCatalog: {
          ...snapshot.commandCatalog,
          value: {
            diagnostics: [],
            commands: [
              {
                id: 'evil"><script>alert(1)</script>',
                name: "evil",
                title: "<b>unsafe</b>",
                handlerRef: "handler<&>",
                sourceKind: "plugin" as const,
                sourceScope: "user" as const,
                sourceId: 'source"unsafe',
                trust: "user_enabled" as const,
                category: "test<script>"
              }
            ]
          }
        }
      }
      const projected = {
        ...base,
        view: buildProductAppWebViewModel(base)
      }
      const html = renderProductAppWebHtml(
        withProductAppWebMode(projected, "workbench")
      )

      expect(html).toContain("&lt;b&gt;unsafe&lt;/b&gt;")
      expect(html).toContain("handler&lt;&amp;&gt;")
      expect(html).toContain("source&quot;unsafe")
      expect(html).not.toContain("<script>alert(1)</script>")
      expect(html).not.toContain("<b>unsafe</b>")
    })
  })

  it("parses host action input into typed web actions and fails closed", () => {
    const rawCommandCatalog = {
      kind: "product-app-web.command-catalog" as const,
      state: "ready" as const,
      message: "1 product command available",
      rows: [{
        id: "product.agent.run",
        name: "product.agent.run",
        title: "Run agent",
        handlerRef: "wanex.product-app.backend.runAgentTurn",
        sourceKind: "builtin",
        sourceId: "wanex.product-app.backend",
        trust: "trusted",
        input: { mode: "raw" as const }
      }],
      diagnostics: []
    }
    expect(
      parseProductAppWebActionInput({
        action: "select-session",
        fields: {
          sessionId: "  ses_from_form  "
        }
      })
    ).toEqual({
      ok: true,
      action: {
        type: "select-session",
        sessionId: "ses_from_form"
      }
    })
    expect(
      parseProductAppWebActionInput({
        action: "set-layout",
        fields: {
          layout: "floating"
        }
      })
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_field",
        field: "layout",
        message: "layout must be one of: single, split, diagnostics"
      }
    })
    expect(
      parseProductAppWebActionInput({
        action: "update-preferences",
        fields: {
          theme: "dark",
          density: "compact"
        }
      })
    ).toEqual({
      ok: true,
      action: {
        type: "update-preferences",
        input: {
          preferences: {
            theme: "dark",
            density: "compact"
          }
        }
      }
    })
    expect(
      parseProductAppWebActionInput(
        {
          action: "preview-command",
          fields: {
            commandId: "  product.agent.run  ",
            inputJson: "{\"text\":\"preview from form\"}"
          }
        },
        { commandCatalog: rawCommandCatalog }
      )
    ).toEqual({
      ok: true,
      action: {
        type: "preview-command",
        input: {
          commandId: "product.agent.run",
          input: {
            text: "preview from form"
          }
        }
      }
    })
    expect(
      parseProductAppWebActionInput(
        {
          action: "preview-command",
          fields: {
            commandId: "product.agent.run",
            inputJson: "{"
          }
        },
        { commandCatalog: rawCommandCatalog }
      )
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_field",
        field: "inputJson",
        message: "inputJson must be valid JSON"
      }
    })
    expect(
      parseProductAppWebActionInput({
        action: "preview-command",
        fields: { commandId: "product.agent.run" }
      })
    ).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        field: "commandId"
      }
    })
    expect(
      parseProductAppWebActionInput({
        action: "update-preferences",
        fields: {}
      })
    ).toMatchObject({
      ok: false,
      error: {
        code: "empty_update"
      }
    })
    expect(
      parseProductAppWebActionInput({
        action: "restartGateway"
      })
    ).toMatchObject({
      ok: false,
      error: {
        code: "unknown_action"
      }
    })
    expect(
      parseProductAppWebActionInput({
        action: "continue-workbench",
        fields: {
          text: "  continue from form  "
        }
      })
    ).toEqual({
      ok: true,
      action: {
        type: "continue-workbench",
        input: {
          text: "continue from form"
        }
      }
    })
    expect(
      parseProductAppWebActionInput({
        action: "start-workbench",
        fields: {
          text: "  start from form  "
        }
      })
    ).toEqual({
      ok: true,
      action: {
        type: "start-workbench",
        input: {
          text: "start from form"
        }
      }
    })
    expect(
      parseProductAppWebActionInput({
        action: "continue-workbench",
        fields: {
          text: "   "
        }
      })
    ).toMatchObject({
      ok: false,
      error: {
        code: "invalid_field",
        field: "text"
      }
    })
  })

  it("runs a framework-free controller loop from input to dispatch, poll, and render", async () => {
    await withWebSurface(async ({ client, observed }) => {
      const controller = await createProductAppWebController({
        client,
        now: () => 11_777
      })
      const initial = controller.document()

      expect(initial).toMatchObject({
        kind: "product-app-web.document",
        snapshot: {
          kind: "product-app-web.snapshot",
          view: {
            ready: true,
            layout: "single"
          }
        }
      })
      expect(initial.html).toContain('data-product-layout="single"')

      const updated = await controller.submitActionInput(
        {
          action: "set-layout",
          fields: {
            layout: "split"
          }
        },
        {
          pollAfterAction: {
            limit: 2
          }
        }
      )

      expect(updated).toMatchObject({
        ok: true,
        parse: {
          ok: true,
          action: {
            type: "set-layout",
            input: {
              layout: "split"
            }
          }
        },
        actionResult: {
          ok: true,
          action: "set-layout"
        },
        document: {
          kind: "product-app-web.document",
          snapshot: {
            view: {
              layout: "split",
              operationStatus: {
                state: "succeeded",
                action: "set-layout"
              }
            }
          }
        }
      })
      expect(updated.document.html).toContain('data-product-layout="split"')
      expect(updated.document.html).toContain('data-operation-state="succeeded"')
      expect(updated.document.html).toContain("set-layout completed")

      const preferences = await controller.submitActionInput({
        action: "update-preferences",
        fields: {
          theme: "dark",
          density: "compact"
        }
      })
      expect(preferences).toMatchObject({
        ok: true,
        parse: {
          ok: true,
          action: {
            type: "update-preferences",
            input: {
              preferences: {
                theme: "dark",
                density: "compact"
              }
            }
          }
        },
        actionResult: {
          ok: true,
          action: "update-preferences"
        },
        document: {
          snapshot: {
            view: {
              theme: "dark",
              density: "compact"
            }
          }
        }
      })
      expect(preferences.document.html).toContain('data-product-theme="dark"')
      expect(preferences.document.html).toContain(
        'data-product-density="compact"'
      )

      const workbench = await controller.submitActionInput({
        action: "set-mode",
        fields: {
          mode: "workbench"
        }
      })
      expect(workbench).toMatchObject({
        ok: true,
        actionResult: {
          ok: true,
          action: "set-mode"
        },
        document: {
          snapshot: {
            view: {
              mode: "workbench"
            }
          }
        }
      })
      expect(workbench.document.html).toContain('data-product-mode="workbench"')

      const preview = await controller.submitActionInput({
        action: "preview-command",
        fields: {
          commandId: "product.agent.run",
          inputJson: "{\"text\":\"controller preview\"}"
        }
      })
      expect(preview).toMatchObject({
        ok: true,
        parse: {
          ok: true,
          action: {
            type: "preview-command",
            input: {
              commandId: "product.agent.run",
              input: {
                text: "controller preview"
              }
            }
          }
        },
        actionResult: {
          ok: true,
          action: "preview-command"
        },
        document: {
          snapshot: {
            commandPreview: {
              state: "runnable",
              commandId: "product.agent.run"
            },
            view: {
              commandPreview: {
                state: "runnable",
                commandId: "product.agent.run"
              }
            }
          }
        }
      })
      expect(preview.document.html).toContain(
        'data-command-preview-state="runnable"'
      )

      const invalid = await controller.submitActionInput({
        action: "set-mode",
        fields: {
          mode: "drift"
        }
      })

      expect(invalid).toMatchObject({
        ok: false,
        parse: {
          ok: false,
          error: {
            code: "invalid_field",
            field: "mode"
          }
        },
        document: {
          snapshot: {
            view: {
              mode: "workbench",
              layout: "split"
            }
          }
        }
      })
      expect("actionResult" in invalid).toBe(false)
      expect(controller.snapshot().view.layout).toBe("split")
      expect(
        observed.filter(
          (request) => request.operation === "readSurfaceEvents"
        ).length
      ).toBeGreaterThanOrEqual(3)
      expect(
        observed.some(
          (request) =>
            request.operation === "readSurfaceEvents" &&
            request.input?.limit === 2
        )
      ).toBe(true)

      await controller.submitActionInput({
        action: "select-session",
        fields: {
          sessionId: "ses_controller_workbench"
        }
      })
      const continued = await controller.submitActionInput({
        action: "continue-workbench",
        fields: {
          text: "controller workbench turn"
        }
      })
      expect(continued).toMatchObject({
        ok: true,
        actionResult: {
          ok: true,
          action: "continue-workbench"
        },
        document: {
          snapshot: {
            workbench: {
              state: "ready",
              sessionId: "ses_controller_workbench"
            },
            view: {
              workbenchState: "ready",
              workbenchCanContinue: true
            }
          }
        }
      })
      expect(continued.document.html).toContain("controller workbench turn")
    })
  })

  it("handles framework-free request envelopes for future platform hosts", async () => {
    await withWebSurface(async ({ client, observed }) => {
      const controller = await createProductAppWebController({
        client,
        now: () => 11_888
      })

      const document = await handleProductAppWebRequest(controller, {
        kind: "product-app-web.request",
        operation: "document",
        requestId: "req_document"
      })
      expect(document).toMatchObject({
        kind: "product-app-web.response",
        ok: true,
        operation: "document",
        requestId: "req_document",
        document: {
          snapshot: {
            view: {
              ready: true,
              mode: "chat"
            }
          }
        }
      })

      const submitted = await handleProductAppWebRequest(controller, {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "req_submit",
        input: {
          action: "set-mode",
          fields: {
            mode: "diagnostics"
          }
        },
        options: {
          pollAfterAction: {
            limit: 3
          }
        }
      })
      expect(submitted).toMatchObject({
        ok: true,
        operation: "submitActionInput",
        requestId: "req_submit",
        submitResult: {
          ok: true,
          actionResult: {
            ok: true,
            action: "set-mode"
          }
        },
        document: {
          snapshot: {
            view: {
              mode: "diagnostics"
            }
          }
        }
      })

      const invalidAction = await handleProductAppWebRequest(controller, {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        input: {
          action: "set-layout",
          fields: {
            layout: "floating"
          }
        }
      })
      expect(invalidAction).toMatchObject({
        ok: true,
        operation: "submitActionInput",
        submitResult: {
          ok: false,
          parse: {
            ok: false,
            error: {
              code: "invalid_field",
              field: "layout"
            }
          }
        },
        document: {
          snapshot: {
            view: {
              mode: "diagnostics",
              layout: "single"
            }
          }
        }
      })

      const startedWorkbench = await handleProductAppWebRequest(controller, {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "req_start_workbench",
        input: {
          action: "start-workbench",
          fields: {
            text: "request envelope started workbench"
          }
        }
      })
      expect(startedWorkbench).toMatchObject({
        ok: true,
        operation: "submitActionInput",
        requestId: "req_start_workbench",
        submitResult: {
          ok: true,
          actionResult: {
            ok: true,
            action: "start-workbench"
          }
        },
        document: {
          snapshot: {
            workbench: {
              state: "ready",
              summary: {
                latestUserText: "request envelope started workbench"
              }
            }
          }
        }
      })

      const selectedWorkbench = await handleProductAppWebRequest(controller, {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "req_select_workbench",
        input: {
          action: "select-session",
          fields: {
            sessionId: "ses_request_workbench"
          }
        }
      })
      expect(selectedWorkbench).toMatchObject({
        ok: true,
        operation: "submitActionInput",
        document: {
          snapshot: {
            view: {
              selectedSessionId: "ses_request_workbench"
            }
          }
        }
      })
      const continuedWorkbench = await handleProductAppWebRequest(controller, {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "req_continue_workbench",
        input: {
          action: "continue-workbench",
          fields: {
            text: "request envelope workbench turn"
          }
        }
      })
      expect(continuedWorkbench).toMatchObject({
        ok: true,
        operation: "submitActionInput",
        submitResult: {
          ok: true,
          actionResult: {
            ok: true,
            action: "continue-workbench"
          }
        },
        document: {
          snapshot: {
            workbench: {
              state: "ready",
              sessionId: "ses_request_workbench"
            }
          }
        }
      })

      const invalidPoll = await handleProductAppWebRequest(controller, {
        kind: "product-app-web.request",
        operation: "pollEvents",
        input: {
          limit: 0
        }
      })
      expect(invalidPoll).toMatchObject({
        ok: false,
        operation: "pollEvents",
        error: {
          code: "invalid_request",
          field: "input.limit"
        },
        document: {
          snapshot: {
            view: {
              mode: "diagnostics"
            }
          }
        }
      })

      const unknown = await handleProductAppWebRequest(controller, {
        kind: "product-app-web.request",
        operation: "restartGateway"
      })
      expect(unknown).toMatchObject({
        ok: false,
        operation: "restartGateway",
        error: {
          code: "unknown_operation",
          field: "operation"
        }
      })
      expect(controller.snapshot().view.mode).toBe("diagnostics")
      expect(
        observed.some(
          (request) =>
            request.operation === "readSurfaceEvents" &&
            request.input?.limit === 3
        )
      ).toBe(true)
    })
  })
})

async function withWebSurface(
  run: (context: {
    readonly app: ProductAppShell
    readonly productSurface: ReturnType<typeof createProductAppSurfaceAdapter>
    readonly client: ReturnType<typeof createProductAppWebHostSurfaceClient>
    readonly surface: Awaited<ReturnType<typeof createProductAppWebSurface>>
    readonly observed: ProductAppSurfaceTransportRequest[]
  }) => Promise<void>
): Promise<void> {
  const storeDir = await createStoreDir()
  const app = await createProductAppShell({
    storage: {
      kind: "local-system-service",
      storeDir
    },
    artifacts: {
      explicitPath: serviceBin
    },
    providerProfile: {
      id: "product-app-web-test",
      modelId: "product-app-web-test-model"
    }
  })
  try {
    const productSurface = createProductAppSurfaceAdapter(app)
    const observed: ProductAppSurfaceTransportRequest[] = []
    const client = createProductAppWebHostSurfaceClient({
      surface: productSurface,
      observeRequest(request) {
        observed.push(request)
      }
    })
    const surface = await createProductAppWebSurface({
      client,
      now: () => 11_001
    })
    await run({ app, productSurface, client, surface, observed })
  } finally {
    await app.dispose()
  }
}

async function createStoreDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-product-app-web-test-"))
  tempDirs.push(dir)
  return dir
}

function countOccurrences(value: string, pattern: string): number {
  return value.split(pattern).length - 1
}

function withProductAppWebMode(
  snapshot: ProductAppWebSnapshot,
  mode: "chat" | "workbench" | "diagnostics"
): ProductAppWebSnapshot {
  return {
    ...snapshot,
    view: {
      ...snapshot.view,
      mode,
      settings: {
        ...snapshot.view.settings,
        renderer: {
          ...snapshot.view.settings.renderer,
          mode
        }
      }
    }
  }
}
