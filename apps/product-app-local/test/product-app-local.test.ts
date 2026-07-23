import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  formatProductAppLocalCliStartupSummary,
  formatProductAppLocalCliStartupSummaryJson,
  projectProductAppLocalCliStartupSummary,
  formatProductAppLocalCliProviderSetupResult,
  formatProductAppLocalCliSmokeResult,
  runProductAppLocalCliProviderSetup,
  runProductAppLocalCliSmoke,
  startProductAppLocalWebApp,
  type ProductAppLocalProviderProfileOptions,
  type ProductAppLocalProviderProfilesOptions,
  type ProductAppLocalWebApp
} from "../src/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const apps: ProductAppLocalWebApp[] = []

afterEach(async () => {
  while (apps.length > 0) {
    await apps.pop()?.close()
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/product-app-local", () => {
  it("starts the local Product App web stack through the trusted host boundary", async () => {
    const storeDir = await tempDir("wanex-product-app-local-store-")
    const app = await startProductAppLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: profileCatalog({
        id: "product-app-local-test",
        modelId: "product-app-local-test-model"
      }),
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    apps.push(app)

    const html = await fetchText(`${app.url}/`)
    expect(html).toContain("<!doctype html>")
    expect(html).toContain("<h1>Wanex Product App</h1>")
    expect(html).toContain('data-wanex-product-app-web="surface"')
    expect(html).toContain('data-poll-interval-ms="0"')
    expect(html).not.toContain(storeDir)
    expect(html).not.toContain(serviceBin)

    const submitted = await postJson(`${app.url}/wanex/product-app-web/request`, {
      kind: "product-app-web.request",
      operation: "submitActionInput",
      requestId: "product_app_local_set_layout",
      input: {
        action: "set-layout",
        fields: {
          layout: "split"
        }
      },
      options: {
        pollAfterAction: false
      }
    })

    expect(submitted).toMatchObject({
      kind: "product-app-web.response",
      ok: true,
      operation: "submitActionInput",
      requestId: "product_app_local_set_layout",
      document: {
        snapshot: {
          view: {
            layout: "split"
          }
        }
      },
      submitResult: {
        ok: true,
        actionResult: {
          ok: true,
          action: "set-layout"
        }
      }
    })
    expect(app.settings.readSettings().state.layout).toBe("split")
    expect(app.webController.snapshot().view.layout).toBe("split")

    await app.close()
    await app.close()
    apps.pop()
  })

  it("can isolate local state by profile", async () => {
    const rootDir = await tempDir("wanex-product-app-local-profile-")
    const app = await startProductAppLocalWebApp({
      storage: {
        kind: "profile",
        rootDir,
        profileId: "work"
      },
      serviceBin,
      initialState: {
        layout: "diagnostics"
      },
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    apps.push(app)

    expect(app.settings.readSettings().state.layout).toBe("diagnostics")
    const html = await fetchText(`${app.url}/`)
    expect(html).toContain("Diagnostics")
    expect(html).not.toContain(rootDir)
    expect(html).not.toContain(serviceBin)
  })

  it("persists app settings through the trusted host facade", async () => {
    const storeDir = await tempDir("wanex-product-app-local-settings-")
    const first = await startProductAppLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: profileCatalog({
        id: "local-settings",
        modelId: "local-settings-model"
      }),
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    apps.push(first)

    expect(first.settings.readSettings()).toMatchObject({
      kind: "product-app.settings",
      state: {
        layout: "single",
        mode: "chat",
        preferences: {
          theme: "system",
          density: "comfortable"
        }
      }
    })

    await expect(first.settings.setLayout({ layout: "split" })).resolves
      .toMatchObject({
        layout: "split"
      })
    await expect(first.settings.setMode({ mode: "diagnostics" })).resolves
      .toMatchObject({
        mode: "diagnostics"
      })
    await expect(first.settings.selectSession({
      sessionId: "settings-session"
    })).resolves.toMatchObject({
      selectedSessionId: "settings-session"
    })
    await expect(first.settings.updatePreferences({
      preferences: {
        theme: "dark",
        density: "compact"
      }
    })).resolves.toMatchObject({
      preferences: {
        theme: "dark",
        density: "compact"
      }
    })

    const firstSettings = first.settings.readSettings()
    expect(firstSettings.state).toMatchObject({
      selectedSessionId: "settings-session",
      layout: "split",
      mode: "diagnostics",
      preferences: {
        theme: "dark",
        density: "compact"
      }
    })
    expect(JSON.stringify(firstSettings)).not.toContain(storeDir)
    expect(JSON.stringify(firstSettings)).not.toContain(serviceBin)

    await first.close()
    apps.pop()

    const second = await startProductAppLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: profileCatalog({
        id: "local-settings",
        modelId: "local-settings-model"
      }),
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    apps.push(second)

    expect(second.settings.readSettings().state).toMatchObject({
      selectedSessionId: "settings-session",
      layout: "split",
      mode: "diagnostics",
      preferences: {
        theme: "dark",
        density: "compact"
      }
    })
  })

  it("reads a safe refreshed startup snapshot", async () => {
    const storeDir = await tempDir("wanex-product-app-local-snapshot-")
    const app = await startProductAppLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: profileCatalog({
        id: "local-snapshot",
        modelId: "local-snapshot-model"
      }),
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    apps.push(app)

    const initial = await app.readSnapshot()
    expect(initial).toMatchObject({
      kind: "product-app-local.snapshot",
      url: app.url,
      settings: {
        kind: "product-app.settings",
        state: {
          layout: "single",
          mode: "chat"
        }
      },
      providerProfiles: {
        activeProfileId: "local-snapshot",
        profiles: [
          {
            id: "local-snapshot",
            active: true,
            modelId: "local-snapshot-model",
            credentialConfigured: false
          }
        ]
      },
      web: {
        kind: "product-app-web.snapshot",
        view: {
          layout: "single",
          mode: "chat"
        }
      },
      privacy: {
        exposesStorePath: false,
        exposesServiceBinaryPath: false,
        exposesSecrets: false,
        exposesRawStorageClient: false,
        exposesRendererMutationApi: false
      }
    })
    expect(JSON.stringify(initial)).not.toContain(storeDir)
    expect(JSON.stringify(initial)).not.toContain(serviceBin)

    await app.settings.setLayout({ layout: "diagnostics" })
    await app.settings.setMode({ mode: "diagnostics" })
    const refreshed = await app.readSnapshot()
    expect(refreshed.settings.state).toMatchObject({
      layout: "diagnostics",
      mode: "diagnostics"
    })
    expect(refreshed.web.view).toMatchObject({
      layout: "diagnostics",
      mode: "diagnostics"
    })
  })

  it("starts with a trusted full provider profile and keeps secrets out of snapshots", async () => {
    const storeDir = await tempDir("wanex-product-app-local-full-provider-")
    const app = await startProductAppLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: profileCatalog({
        id: "local-openai-compatible",
        kind: "openai-compatible",
        capabilities: { input: ["text"], output: ["text"] },
        providerId: "openai-compatible",
        modelId: "local-openai-model",
        baseUrl: "https://api.example.invalid/v1",
        secretRef: "env://LOCAL_PROVIDER_SECRET"
      }),
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    apps.push(app)

    const snapshot = await app.readSnapshot()
    expect(snapshot.providerProfiles).toMatchObject({
      activeProfileId: "local-openai-compatible",
      profiles: [
        {
          id: "local-openai-compatible",
          kind: "openai-compatible",
          capabilities: { input: ["text"], output: ["text"] },
          providerId: "openai-compatible",
          modelId: "local-openai-model",
          credentialConfigured: true,
          active: true
        }
      ]
    })
    expect(JSON.stringify(snapshot)).not.toContain(
      "https://api.example.invalid/v1"
    )
    expect(JSON.stringify(snapshot)).not.toContain("LOCAL_PROVIDER_SECRET")
    expect(JSON.stringify(await app.providerProfiles.listProviderProfiles()))
      .not.toContain("LOCAL_PROVIDER_SECRET")
  })

  it("seeds multiple trusted provider profiles and can choose the startup active profile", async () => {
    const storeDir = await tempDir("wanex-product-app-local-provider-catalog-")
    const app = await startProductAppLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: {
        profiles: [
          {
            id: "local-catalog-fake",
            modelId: "local-catalog-fake-model"
          },
          {
            id: "local-catalog-openai",
            kind: "openai-compatible",
            capabilities: { input: ["text"], output: ["text"] },
            providerId: "openai-compatible",
            modelId: "local-catalog-openai-model",
            baseUrl: "https://catalog.example.invalid/v1",
            secretRef: "env://CATALOG_PROVIDER_SECRET"
          }
        ],
        activeProfileId: "local-catalog-openai"
      },
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    apps.push(app)

    const snapshot = await app.readSnapshot()
    expect(snapshot.providerProfiles).toMatchObject({
      activeProfileId: "local-catalog-openai",
      profiles: expect.arrayContaining([
        expect.objectContaining({
          id: "local-catalog-fake",
          active: false,
          modelId: "local-catalog-fake-model",
          credentialConfigured: false
        }),
        expect.objectContaining({
          id: "local-catalog-openai",
          active: true,
          modelId: "local-catalog-openai-model",
          credentialConfigured: true,
        })
      ])
    })
    expect(snapshot.providerProfiles.profiles).toHaveLength(2)
    expect(snapshot.settings.profile.activeProviderProfileId)
      .toBe("local-catalog-openai")
    expect(JSON.stringify(snapshot)).not.toContain("CATALOG_PROVIDER_SECRET")
  })

  it("rejects invalid trusted provider profile catalogs", async () => {
    const storeDir = await tempDir("wanex-product-app-local-provider-invalid-")
    await expect(startProductAppLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: {
        profiles: [
          {
            id: "duplicate",
            modelId: "first"
          },
          {
            id: "duplicate",
            modelId: "second"
          }
        ]
      },
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })).rejects.toThrow("duplicate provider profile id: duplicate")

    await expect(startProductAppLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: {
        profiles: [
          {
            id: "only-profile",
            modelId: "only-model"
          }
        ],
        activeProfileId: "missing-profile"
      },
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })).rejects.toThrow(
      "active provider profile must be included in providerProfiles.profiles: missing-profile"
    )
  })

  it("submits a conversation through the local Web request envelope", async () => {
    const storeDir = await tempDir("wanex-product-app-local-workbench-")
    const app = await startProductAppLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: profileCatalog({
        id: "local-workbench",
        modelId: "local-workbench-model"
      }),
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    apps.push(app)

    const submitted = await postJson(`${app.url}/wanex/product-app-web/request`, {
      kind: "product-app-web.request",
      operation: "submitActionInput",
      requestId: "product_app_local_start_workbench",
      input: {
        action: "submit-conversation",
        fields: {
          text: "hello from Product App Local workbench"
        }
      },
      options: {
        pollAfterAction: false
      }
    })

    expect(submitted).toMatchObject({
      kind: "product-app-web.response",
      ok: true,
      operation: "submitActionInput",
      requestId: "product_app_local_start_workbench",
      document: {
        snapshot: {
          conversation: {
            operation: {
              kind: "product-app.conversation-operation"
            }
          },
          view: {
            sessionCount: 1,
            selectedSessionTitle: "hello from Product App Local workbench"
          }
        },
        html: expect.stringContaining('data-action="submit-conversation"')
      },
      submitResult: {
        ok: true,
        actionResult: {
          ok: true,
          action: "submit-conversation"
        }
      }
    })

    const snapshot = await waitForLocalConversationTerminal(app)
    expect(snapshot.web.conversation).toMatchObject({
      state: "succeeded",
      operation: {
        capabilities: {
          terminal: true,
          regeneratable: true
        }
      }
    })
    expect(
      snapshot.web.conversation.operation?.transcript.rows.some(
        (row) => row.text === "hello from Product App Local workbench"
      )
    ).toBe(true)
    expect(snapshot.web.view).toMatchObject({
      conversationCanSubmit: true,
      sessionCount: 1,
      selectedSessionTitle: "hello from Product App Local workbench"
    })
    expect(snapshot.web.conversation.sessionId).toMatch(/^ses_/)
    expect(snapshot.settings.state.selectedSessionId).toBe(
      snapshot.web.conversation.sessionId
    )
    expect(JSON.stringify(snapshot)).not.toContain(storeDir)
    expect(JSON.stringify(snapshot)).not.toContain(serviceBin)
  })

  it("formats CLI startup output from the safe host snapshot", async () => {
    const storeDir = await tempDir("wanex-product-app-local-cli-summary-")
    const app = await startProductAppLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: profileCatalog({
        id: "local-cli-summary",
        modelId: "local-cli-summary-model"
      }),
      initialState: {
        layout: "split",
        preferences: {
          theme: "dark"
        }
      },
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    apps.push(app)

    const snapshot = await app.readSnapshot()
    const summary = formatProductAppLocalCliStartupSummary({
      options: {
        open: false,
        smoke: false,
        setupProvider: false,
        summaryFormat: "text",
        hostname: "127.0.0.1",
        pollIntervalMs: 0,
        serviceBin,
        storage: {
          kind: "store-dir",
          storeDir
        },
        providerProfiles: profileCatalog({
          id: "launch-profile",
          modelId: "launch-model"
        })
      },
      snapshot
    })
    const jsonSummary = projectProductAppLocalCliStartupSummary({
      options: {
        open: true,
        smoke: false,
        setupProvider: false,
        summaryFormat: "json",
        hostname: "127.0.0.1",
        pollIntervalMs: 0,
        serviceBin,
        storage: {
          kind: "store-dir",
          storeDir
        },
        providerProfiles: profileCatalog({
          id: "launch-profile",
          modelId: "launch-model"
        })
      },
      snapshot
    })
    const jsonLine = formatProductAppLocalCliStartupSummaryJson({
      options: {
        open: true,
        smoke: false,
        setupProvider: false,
        summaryFormat: "json",
        hostname: "127.0.0.1",
        pollIntervalMs: 0,
        serviceBin,
        storage: {
          kind: "store-dir",
          storeDir
        },
        providerProfiles: profileCatalog({
          id: "launch-profile",
          modelId: "launch-model"
        })
      },
      snapshot
    })

    expect(summary).toContain(`URL: ${app.url}`)
    expect(summary).toContain(`Storage: store-dir ${storeDir}`)
    expect(summary).toContain(`Service binary: ${serviceBin}`)
    expect(summary).toContain("Configured provider: local-cli-summary")
    expect(summary).toContain("Active provider: local-cli-summary")
    expect(summary).toContain("Provider profiles: 1")
    expect(summary).toContain("Provider readiness: ready")
    expect(summary).toContain("Provider can run: yes")
    expect(summary).toContain("Provider run gate: ready")
    expect(summary).toContain("Conversation submit: enabled")
    expect(summary).toContain(
      "  - active local-cli-summary fake/fake model=local-cli-summary-model credential=none"
    )
    expect(summary).toContain("Layout: split")
    expect(summary).toContain("Mode: chat")
    expect(summary).toContain("Theme: dark")
    expect(summary).toContain("Density: comfortable")
    expect(summary).toContain("Web ready: yes")
    expect(summary).toContain("Last operation: idle")
    expect(summary).toContain(
      "Privacy: host-only details hidden from product snapshot"
    )
    expect(summary).toContain("Poll interval: disabled")
    expect(summary.join("\n")).not.toContain("launch-profile")
    expect(summary.join("\n")).not.toContain("launch-model")
    expect(jsonSummary).toMatchObject({
      kind: "product-app-local.cli.startup-summary",
      url: app.url,
      open: true,
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBinary: serviceBin,
      provider: {
        configuredProfileId: "local-cli-summary",
        activeProfileId: "local-cli-summary",
        profileCount: 1,
        readiness: {
          status: "ready",
          reason: "active_profile_ready",
          activeProfileId: "local-cli-summary",
          profileCount: 1,
          canRun: true,
          attentionRequired: false,
          requiresCredential: false,
          credentialConfigured: false
        },
        profiles: [
          {
            id: "local-cli-summary",
            kind: "fake",
            capabilities: { input: ["text"], output: ["text"] },
            providerId: "fake",
            modelId: "local-cli-summary-model",
            active: true,
            credentialConfigured: false
          }
        ]
      },
      product: {
        layout: "split",
        mode: "chat",
        theme: "dark",
        density: "comfortable"
      },
      web: {
        ready: true,
        workbenchState: "idle",
        conversationState: "idle",
        conversationCanSubmit: true,
        conversationCanCancel: false,
        conversationCanRegenerate: false,
        operationStatus: {
          kind: "product-app-web.operation-status",
          state: "idle",
          message: "No operation yet"
        },
        providerRunGate: {
          state: "ready",
          status: "ready",
          reason: "active_profile_ready",
          activeProfileId: "local-cli-summary",
          canRun: true,
          canSubmitConversation: true,
          attentionRequired: false,
          message: "Provider ready"
        }
      },
      privacy: {
        safe: true,
        exposesStorePath: false,
        exposesServiceBinaryPath: false,
        exposesSecrets: false,
        exposesRawStorageClient: false,
        exposesRendererMutationApi: false
      },
      pollIntervalMs: 0
    })
    expect(JSON.parse(jsonLine)).toEqual(jsonSummary)
    expect(jsonLine).not.toContain("launch-profile")
    expect(jsonLine).not.toContain("launch-model")
  })

  it("formats CLI provider readiness when the active provider needs attention", async () => {
    const storeDir = await tempDir("wanex-product-app-local-cli-readiness-")
    const app = await startProductAppLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: profileCatalog({
        id: "local-cli-readiness-initial",
        modelId: "local-cli-readiness-initial-model"
      }),
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    apps.push(app)

    await app.providerProfiles.upsertProviderProfile({
      profile: {
        id: "local-cli-openai-missing-key",
        kind: "openai-compatible",
        capabilities: { input: ["text"], output: ["text"] },
        providerId: "openai-compatible",
        modelId: "local-cli-openai-missing-key-model",
        baseUrl: "https://provider.example.test/v1"
      },
      makeActive: true
    })
    const snapshot = await app.readSnapshot()
    const options = {
      open: false,
      smoke: false,
      setupProvider: false,
      summaryFormat: "text" as const,
      hostname: "127.0.0.1",
      pollIntervalMs: 0,
      serviceBin,
      storage: {
        kind: "store-dir" as const,
        storeDir
      },
      providerProfiles: profileCatalog({
        id: "launch-profile",
        modelId: "launch-model"
      })
    }
    const summary = formatProductAppLocalCliStartupSummary({
      options,
      snapshot
    })
    const jsonSummary = projectProductAppLocalCliStartupSummary({
      options,
      snapshot
    })

    expect(summary).toContain("Provider readiness: missing_required_credential")
    expect(summary).toContain("Provider can run: no")
    expect(summary).toContain("Provider run gate: blocked")
    expect(summary).toContain("Conversation submit: blocked")
    expect(summary).toContain("Last operation: idle")
    expect(jsonSummary.provider.readiness).toEqual({
      status: "missing_required_credential",
      reason: "active_profile_missing_credential",
      activeProfileId: "local-cli-openai-missing-key",
      profileCount: 2,
      canRun: false,
      attentionRequired: true,
      requiresCredential: true,
      credentialConfigured: false
    })
    expect(jsonSummary.web.providerRunGate).toEqual({
      state: "blocked",
      status: "missing_required_credential",
      reason: "active_profile_missing_credential",
      activeProfileId: "local-cli-openai-missing-key",
      canRun: false,
      canSubmitConversation: false,
      attentionRequired: true,
      message: "Host setup required"
    })
    expect(jsonSummary.web.operationStatus).toEqual({
      kind: "product-app-web.operation-status",
      state: "idle",
      message: "No operation yet"
    })
    expect(JSON.stringify(jsonSummary)).toContain(serviceBin)
  })

  it("runs a bounded CLI smoke check through the local product path", async () => {
    const storeDir = await tempDir("wanex-product-app-local-cli-smoke-")
    const app = await startProductAppLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: profileCatalog({
        id: "local-cli-smoke",
        modelId: "local-cli-smoke-model"
      }),
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    apps.push(app)

    const result = await runProductAppLocalCliSmoke({
      app,
      options: {
        open: false,
        smoke: true,
        setupProvider: false,
        summaryFormat: "json",
        hostname: "127.0.0.1",
        pollIntervalMs: 0,
        serviceBin,
        storage: {
          kind: "store-dir",
          storeDir
        },
        providerProfiles: profileCatalog({
          id: "local-cli-smoke",
          modelId: "local-cli-smoke-model"
        })
      }
    })

    expect(result).toMatchObject({
      kind: "product-app-local.cli.smoke-result",
      ok: true,
      checks: {
        document: {
          ok: true
        },
        layoutAction: {
          ok: true
        },
        conversationAction: {
          ok: true
        },
        privacy: {
          ok: true
        }
      },
      startup: {
        kind: "product-app-local.cli.startup-summary",
        provider: {
          configuredProfileId: "local-cli-smoke",
          activeProfileId: "local-cli-smoke",
          readiness: {
            status: "ready",
            canRun: true
          }
        },
        product: {
          layout: "split",
          selectedSessionId: expect.stringMatching(/^ses_/)
        },
        web: {
          ready: true,
          workbenchState: "idle",
          conversationState: "succeeded",
          conversationCanSubmit: true,
          operationStatus: {
            state: "succeeded",
            action: "submit-conversation"
          },
          providerRunGate: {
            state: "ready",
            canSubmitConversation: true
          }
        },
        privacy: {
          safe: true
        },
        pollIntervalMs: 0
      }
    })
    const json = formatProductAppLocalCliSmokeResult(result)
    expect(JSON.parse(json)).toEqual(result)
    expect(json).toContain(storeDir)
    expect(json).toContain(serviceBin)
  })

  it("runs a bounded CLI provider setup through the trusted host facade", async () => {
    const storeDir = await tempDir("wanex-product-app-local-cli-setup-")
    const app = await startProductAppLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: profileCatalog({
        id: "local-cli-setup-initial",
        modelId: "local-cli-setup-initial-model"
      }),
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    apps.push(app)

    const result = await runProductAppLocalCliProviderSetup({
      app,
      options: {
        open: false,
        smoke: false,
        setupProvider: true,
        summaryFormat: "json",
        hostname: "127.0.0.1",
        pollIntervalMs: 0,
        serviceBin,
        storage: {
          kind: "store-dir",
          storeDir
        },
        providerProfiles: {
          profiles: [
            {
              id: "local-cli-setup-openai",
              kind: "openai-compatible",
              capabilities: { input: ["text"], output: ["text"] },
              providerId: "openai-compatible",
              modelId: "local-cli-setup-openai-model",
              baseUrl: "https://provider.example.test/v1",
              secretRef: "env://LOCAL_CLI_SETUP_SECRET"
            }
          ],
          activeProfileId: "local-cli-setup-openai"
        }
      }
    })

    expect(result).toMatchObject({
      kind: "product-app-local.cli.provider-setup-result",
      ok: true,
      configuredProfiles: [
        {
          kind: "product-app-local.provider-setup.configured",
          profile: {
            id: "local-cli-setup-openai",
            active: true,
            credentialConfigured: true,
          },
          readiness: {
            status: "ready",
            activeProfileId: "local-cli-setup-openai",
            canRun: true
          }
        }
      ],
      startup: {
        kind: "product-app-local.cli.startup-summary",
        provider: {
          activeProfileId: "local-cli-setup-openai",
          readiness: {
            status: "ready",
            canRun: true
          }
        }
      }
    })
    const json = formatProductAppLocalCliProviderSetupResult(result)
    expect(JSON.parse(json)).toEqual(result)
    expect(json).not.toContain("LOCAL_CLI_SETUP_SECRET")
    expect(json).toContain(storeDir)
    expect(json).toContain(serviceBin)
  })

  it("manages provider profiles through the trusted host facade", async () => {
    const storeDir = await tempDir("wanex-product-app-local-provider-")
    const first = await startProductAppLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: profileCatalog({
        id: "local-initial",
        modelId: "local-initial-model"
      }),
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    apps.push(first)

    await expect(first.providerProfiles.listProviderProfiles()).resolves
      .toMatchObject({
        activeProfileId: "local-initial",
        profiles: [
          {
            id: "local-initial",
            active: true,
            modelId: "local-initial-model",
            credentialConfigured: false
          }
        ]
      })

    await expect(
      first.providerProfiles.upsertProviderProfile({
        profile: {
          id: "local-second",
          kind: "openai-compatible",
          capabilities: { input: ["text"], output: ["text"] },
          providerId: "openai-compatible",
          modelId: "local-second-model",
          baseUrl: "https://provider.example.test/v1",
          secretRef: "env://LOCAL_SECOND_SECRET"
        },
        makeActive: true
      })
    ).resolves.toMatchObject({
      id: "local-second",
      active: true,
      modelId: "local-second-model",
      credentialConfigured: true,
    })
    expect(first.settings.readSettings().profile.activeProviderProfileId)
      .toBe("local-second")
    const firstSnapshot = await first.readSnapshot()
    expect(firstSnapshot.providerProfiles.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "local-second",
          active: true,
          credentialConfigured: true,
        })
      ])
    )
    expect(firstSnapshot.web.view.settings.profile.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "local-second",
          active: true,
          credentialConfigured: true
        })
      ])
    )
    const firstSerialized = JSON.stringify(firstSnapshot)
    expect(firstSerialized).not.toContain("https://provider.example.test/v1")
    expect(firstSerialized).not.toContain("LOCAL_SECOND_SECRET")
    expect(firstSerialized).not.toContain(storeDir)
    expect(firstSerialized).not.toContain(serviceBin)

    await first.close()
    apps.pop()

    const second = await startProductAppLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: profileCatalog({
        id: "local-initial",
        modelId: "local-initial-model"
      }),
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    apps.push(second)

    expect(second.settings.readSettings().profile.activeProviderProfileId)
      .toBe("local-second")
    await expect(second.providerProfiles.readActiveProviderProfile()).resolves
      .toMatchObject({
        id: "local-second",
        active: true,
        modelId: "local-second-model",
        credentialConfigured: true,
      })
  })

  it("configures provider profiles through the host-owned setup facade", async () => {
    const storeDir = await tempDir("wanex-product-app-local-provider-setup-")
    const app = await startProductAppLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: profileCatalog({
        id: "local-setup-initial",
        modelId: "local-setup-initial-model"
      }),
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    apps.push(app)

    const result = await app.providerSetup.configureProviderProfile({
      id: "local-setup-openai",
      kind: "openai-compatible",
      capabilities: { input: ["text"], output: ["text"] },
      providerId: "openai-compatible",
      modelId: "local-setup-openai-model",
      baseUrl: "https://provider.example.test/v1",
      secretRef: "env://LOCAL_SETUP_SECRET",
      makeActive: true
    })

    expect(result).toMatchObject({
      kind: "product-app-local.provider-setup.configured",
      profile: {
        id: "local-setup-openai",
        kind: "openai-compatible",
        capabilities: { input: ["text"], output: ["text"] },
        providerId: "openai-compatible",
        modelId: "local-setup-openai-model",
        baseUrl: "https://provider.example.test/v1",
        active: true,
        credentialConfigured: true,
      },
      readiness: {
        status: "ready",
        reason: "active_profile_ready",
        activeProfileId: "local-setup-openai",
        profileCount: 2,
        canRun: true,
        attentionRequired: false,
        requiresCredential: true,
        credentialConfigured: true
      }
    })
    expect(JSON.stringify(result)).not.toContain("LOCAL_SETUP_SECRET")

    const snapshot = await app.readSnapshot()
    expect(snapshot.web.view.settings.profile.readiness).toMatchObject({
      status: "ready",
      activeProfileId: "local-setup-openai",
      canRun: true
    })
    expect(JSON.stringify(snapshot)).not.toContain("LOCAL_SETUP_SECRET")
    expect(JSON.stringify(snapshot)).not.toContain(storeDir)
    expect(JSON.stringify(snapshot)).not.toContain(serviceBin)
  })
})

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function waitForLocalConversationTerminal(
  app: ProductAppLocalWebApp
): Promise<Awaited<ReturnType<ProductAppLocalWebApp["readSnapshot"]>>> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const snapshot = await app.readSnapshot()
    if (snapshot.web.conversation.operation?.capabilities.terminal) {
      return snapshot
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Product App Local conversation did not finish")
}

function profileCatalog(
  ...profiles: readonly ProductAppLocalProviderProfileOptions[]
): ProductAppLocalProviderProfilesOptions {
  return { profiles }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  expect(response.status).toBe(200)
  return await response.text()
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  })
  expect(response.status).toBe(200)
  return await response.json()
}
