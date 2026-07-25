import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, describe, expect, it } from "vitest"
import {
  createMemoryProductAppStateStore,
  createProductAppSurfaceAdapter,
  createProductAppShell,
  type ProductAppStateStore,
  type ProductAppShell
} from "../src/index.js"
import {
  createInProcessProductAppSurfaceClientTransport,
  createMessageProductAppSurfaceClientTransport,
  createProductAppSurfaceHostEndpoint,
  handleProductAppSurfaceTransportRequest,
  createProductAppSurfaceClient
} from "../src/surface-client.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
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

describe("@wanex/product-app", () => {
  it("opens a product backend shell without exposing storage internals", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    try {
      const home = await app.readHome({ overview: { now: 9300 } })

      expect(home).toMatchObject({
        kind: "product-app.home",
        state: {
          layout: "single",
          mode: "chat",
          preferences: {
            theme: "system",
            density: "comfortable"
          }
        },
        rendererBoundary: {
          rendererMayOpenStorage: false,
          rendererMayReceiveStorePath: false,
          rendererMayReceiveServiceBinaryPath: false,
          rendererCalls: "app-owned-ipc-or-api"
        },
        commandPort: {
          adapter: "app-owned-command-port",
          commandCount: expect.any(Number)
        },
        providerReadiness: {
          status: "ready",
          reason: "active_profile_ready",
          activeProfileId: "product-app-test",
          profileCount: 1,
          canRun: true,
          attentionRequired: false,
          requiresCredential: false,
          credentialConfigured: false,
          activeProfile: expect.objectContaining({
            id: "product-app-test",
            kind: "fake",
            capabilities: { input: ["text"], output: ["text"] },
            active: true
          })
        }
      })
      expect(home.product.provider.configuredProfileId).toBe("product-app-test")
      expect(home.commandPort.commandCount).toBeGreaterThan(10)
      expect(JSON.stringify(home)).not.toContain(storeDir)
      expect(JSON.stringify(home)).not.toContain(serviceBin)
    } finally {
      await app.dispose()
    }
  })

  it("projects provider readiness without exposing provider secrets", async () => {
    const missingCredentialStoreDir = await createStoreDir()
    const missingCredentialApp = await createTestApp(missingCredentialStoreDir, {
      providerProfile: {
        id: "product-app-openai-missing-key",
        kind: "openai-compatible",
        capabilities: { input: ["text"], output: ["text"] },
        providerId: "openai-compatible",
        modelId: "product-app-openai-missing-key-model"
      }
    })
    try {
      const home = await missingCredentialApp.readHome()
      expect(home.providerReadiness).toMatchObject({
        status: "missing_required_credential",
        reason: "active_profile_missing_credential",
        activeProfileId: "product-app-openai-missing-key",
        profileCount: 1,
        canRun: false,
        attentionRequired: true,
        requiresCredential: true,
        credentialConfigured: false,
        activeProfile: {
          id: "product-app-openai-missing-key",
          kind: "openai-compatible",
          capabilities: { input: ["text"], output: ["text"] },
          credentialConfigured: false,
          active: true
        }
      })
      expect(JSON.stringify(home)).not.toContain(missingCredentialStoreDir)
      expect(JSON.stringify(home)).not.toContain(serviceBin)
    } finally {
      await missingCredentialApp.dispose()
    }

    const readyStoreDir = await createStoreDir()
    const readySecretRef = "env://PRODUCT_APP_OPENAI_READY_SECRET"
    const readyApp = await createTestApp(readyStoreDir, {
      providerProfile: {
        id: "product-app-openai-ready",
        kind: "openai-compatible",
        capabilities: { input: ["text"], output: ["text"] },
        providerId: "openai-compatible",
        modelId: "product-app-openai-ready-model",
        secretRef: readySecretRef
      }
    })
    try {
      const home = await readyApp.readHome()
      expect(home.providerReadiness).toMatchObject({
        status: "ready",
        reason: "active_profile_ready",
        activeProfileId: "product-app-openai-ready",
        profileCount: 1,
        canRun: true,
        attentionRequired: false,
        requiresCredential: true,
        credentialConfigured: true,
        activeProfile: {
          id: "product-app-openai-ready",
          kind: "openai-compatible",
          capabilities: { input: ["text"], output: ["text"] },
          credentialConfigured: true,
          active: true
        }
      })
      const serialized = JSON.stringify(home)
      expect(serialized).not.toContain(readyStoreDir)
      expect(serialized).not.toContain(serviceBin)
      expect(serialized).not.toContain(readySecretRef)
    } finally {
      await readyApp.dispose()
    }
  })

  it("previews product command invocation through the Product App run gate", async () => {
    const readyStoreDir = await createStoreDir()
    const readyApp = await createTestApp(readyStoreDir)
    try {
      const runnable = await readyApp.previewProductCommandInvocation({
        commandId: "product.agent.submit",
        input: {
          text: "preview ready agent run"
        }
      })
      expect(runnable).toMatchObject({
        kind: "runnable",
        commandId: "product.agent.submit",
        inputAccepted: true
      })

      const readOnly = await readyApp.previewProductCommandInvocation({
        commandId: "product.status"
      })
      expect(readOnly).toMatchObject({
        kind: "runnable",
        commandId: "product.status",
        inputAccepted: true
      })

      const invalid = await readyApp.previewProductCommandInvocation({
        commandId: "product.agent.submit"
      })
      expect(invalid).toMatchObject({
        kind: "rejected",
        commandId: "product.agent.submit",
        reason: "invalid_input"
      })
    } finally {
      await readyApp.dispose()
    }

    const blockedStoreDir = await createStoreDir()
    const blockedApp = await createTestApp(blockedStoreDir, {
      providerProfile: {
        id: "product-app-preview-blocked-provider",
        kind: "openai-compatible",
        capabilities: { input: ["text"], output: ["text"] },
        providerId: "openai-compatible",
        modelId: "product-app-preview-blocked-model"
      }
    })
    try {
      const blocked = await blockedApp.previewProductCommandInvocation({
        commandId: "product.agent.submit",
        input: {
          text: "preview should not bypass provider setup"
        }
      })
      expect(blocked).toMatchObject({
        kind: "rejected",
        commandId: "product.agent.submit",
        reason: "provider_not_ready",
        providerReadiness: {
          status: "missing_required_credential",
          canRun: false,
          activeProfileId: "product-app-preview-blocked-provider"
        }
      })

      const commandPortPreview = await blockedApp.dispatchProductCommand({
        command: "previewProductCommandInvocation",
        input: {
          commandId: "product.agent.submit",
          input: {
            text: "command port preview should report provider gate"
          }
        }
      })
      expect(commandPortPreview).toMatchObject({
        ok: true,
        command: "previewProductCommandInvocation",
        value: {
          kind: "rejected",
          reason: "provider_not_ready"
        }
      })

      const jsonPreview = await blockedApp.dispatchProductCommandJson(
        JSON.stringify({
          command: "previewProductCommandInvocation",
          input: {
            commandId: "product.agent.submit",
            input: {
              text: "json preview should report provider gate"
            }
          }
        })
      )
      expect(jsonPreview).toMatchObject({
        status: "success",
        envelope: {
          ok: true,
          command: "previewProductCommandInvocation",
          value: {
            kind: "rejected",
            reason: "provider_not_ready"
          }
        }
      })

      const readOnly = await blockedApp.previewProductCommandInvocation({
        commandId: "product.status"
      })
      expect(readOnly).toMatchObject({
        kind: "runnable",
        commandId: "product.status",
        inputAccepted: true
      })
      expect(blockedApp.status().state.selectedSessionId).toBeUndefined()

      const serialized = JSON.stringify([
        blocked,
        commandPortPreview,
        jsonPreview,
        readOnly
      ])
      expect(serialized).not.toContain(blockedStoreDir)
      expect(serialized).not.toContain(serviceBin)
      expect(serialized).not.toContain("apiKey")
    } finally {
      await blockedApp.dispose()
    }
  })

  it("fails closed for conversation submits when the provider cannot run", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir, {
      providerProfile: {
        id: "product-app-blocked-provider",
        kind: "openai-compatible",
        capabilities: { input: ["text"], output: ["text"] },
        providerId: "openai-compatible",
        modelId: "product-app-blocked-model"
      }
    })
    try {
      const started = await app.submitConversationOperation({
        text: "should not start without provider setup"
      })
      expect(started).toEqual({
        kind: "product-app.conversation-operation.rejected",
        reason: "provider_not_ready",
        message:
          "provider is not ready: active profile product-app-blocked-provider is missing a required credential"
      })
      expect(app.status().state.selectedSessionId).toBeUndefined()

      await app.selectSession({ sessionId: "ses_provider_blocked" })
      const continued = await app.submitConversationOperation({
        text: "should not continue without provider setup"
      })
      expect(continued).toEqual({
        kind: "product-app.conversation-operation.rejected",
        reason: "provider_not_ready",
        sessionId: "ses_provider_blocked",
        message:
          "provider is not ready: active profile product-app-blocked-provider is missing a required credential"
      })

      const rawRun = await app.dispatchProductCommand({
        command: "submitConversationOperation",
        input: {
          text: "raw command should not bypass provider setup"
        }
      })
      expect(rawRun).toMatchObject({
        ok: false,
        command: "submitConversationOperation",
        error: {
          code: "provider_not_ready",
          category: "validation"
        }
      })

      const routedRun = await app.dispatchProductCommand({
        command: "routeInput",
        input: {
          text: "natural language route should not bypass provider setup"
        }
      })
      expect(routedRun).toMatchObject({
        ok: false,
        command: "routeInput",
        error: {
          code: "provider_not_ready",
          category: "validation"
        }
      })

      const routedStatus = await app.dispatchProductCommand({
        command: "routeInput",
        input: {
          text: "/status"
        }
      })
      expect(routedStatus).toMatchObject({
        ok: true,
        command: "routeInput",
        value: {
          kind: "read_model",
          command: "status"
        }
      })

      const workflowRun = await app.dispatchProductCommand({
        command: "routeWorkflowEnvelope",
        input: {
          kind: "interactive",
          text: "workflow route should not bypass provider setup"
        }
      })
      expect(workflowRun).toMatchObject({
        ok: false,
        command: "routeWorkflowEnvelope",
        error: {
          code: "provider_not_ready",
          category: "validation"
        }
      })

      const workflowStatus = await app.dispatchProductCommand({
        command: "routeWorkflowEnvelope",
        input: {
          kind: "interactive",
          text: "/status"
        }
      })
      expect(workflowStatus).toMatchObject({
        ok: true,
        command: "routeWorkflowEnvelope",
        value: {
          kind: "read_model",
          command: "status"
        }
      })

      const paletteRun = await app.dispatchProductCommand({
        command: "executeProductCommand",
        input: {
          commandId: "product.agent.submit",
          input: {
            text: "palette command should not bypass provider setup"
          }
        }
      })
      expect(paletteRun).toMatchObject({
        ok: false,
        command: "executeProductCommand",
        error: {
          code: "provider_not_ready",
          category: "validation"
        }
      })

      const typedPaletteRun = await app.executeProductCommand({
        commandId: "product.agent.submit",
        input: {
          text: "typed palette command should not bypass provider setup"
        }
      })
      expect(typedPaletteRun).toMatchObject({
        kind: "rejected",
        commandId: "product.agent.submit",
        reason: "provider_not_ready",
        handlerRef: "wanex.product-app.backend.submitConversationOperation",
        providerReadiness: {
          canRun: false
        }
      })

      const palettePreview = await app.dispatchProductCommand({
        command: "previewProductCommandInvocation",
        input: {
          commandId: "product.agent.submit",
          input: {
            text: "palette preview should not claim runnable"
          }
        }
      })
      expect(palettePreview).toMatchObject({
        ok: true,
        command: "previewProductCommandInvocation",
        value: {
          kind: "rejected",
          reason: "provider_not_ready"
        }
      })

      const jsonRun = await app.dispatchProductCommandJson(
        JSON.stringify({
          command: "submitConversationOperation",
          input: {
            text: "json command should not bypass provider setup"
          }
        })
      )
      expect(jsonRun).toMatchObject({
        status: "validation_error",
        envelope: {
          ok: false,
          command: "submitConversationOperation",
          error: {
            code: "provider_not_ready",
            category: "validation"
          }
        }
      })

      const serialized = JSON.stringify([
        started,
        continued,
        rawRun,
        routedRun,
        routedStatus,
        workflowRun,
        workflowStatus,
        paletteRun,
        palettePreview,
        jsonRun,
        app.readSettings()
      ])
      expect(serialized).not.toContain(storeDir)
      expect(serialized).not.toContain(serviceBin)
      expect(serialized).not.toContain("apiKey")
    } finally {
      await app.dispose()
    }
  })

  it("exposes a safe app-owned settings profile read model", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir, {
      state: {
        layout: "split",
        mode: "workbench",
        preferences: {
          theme: "dark",
          density: "compact"
        }
      }
    })
    try {
      const settings = app.readSettings()
      const commandCatalog = app.readProductCommands()
      const statusExecution = await app.executeProductCommand({
        commandId: "product.status"
      })
      const missingExecution = await app.executeProductCommand({
        commandId: "product.missing"
      })
      const agentExecution = await app.executeProductCommand({
        commandId: "product.agent.submit",
        input: {
          text: "typed execution summary",
          sessionId: "ses_typed_execution_summary",
          inputId: "inp_typed_execution_summary"
        }
      })

      expect(settings).toMatchObject({
        kind: "product-app.settings",
        state: {
          layout: "split",
          mode: "workbench",
          preferences: {
            theme: "dark",
            density: "compact"
          }
        },
        profile: {
          configuredProviderProfileId: "product-app-test",
          activeProviderProfileId: "product-app-test"
        },
        renderer: {
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
      })
      expect(commandCatalog).toMatchObject({
        commands: expect.arrayContaining([
          expect.objectContaining({
            id: "product.agent.submit",
            handlerRef: "wanex.product-app.backend.submitConversationOperation"
          }),
          expect.objectContaining({
            id: "product.status"
          })
        ]),
        diagnostics: []
      })
      expect(statusExecution).toMatchObject({
        kind: "completed",
        commandId: "product.status",
        handlerRef: "wanex.product-app.backend.status",
        summary: {
          valueKind: "object",
          message: "Command completed",
          references: []
        }
      })
      expect(statusExecution).not.toHaveProperty("value")
      expect(missingExecution).toEqual({
        kind: "rejected",
        commandId: "product.missing",
        reason: "command_not_found",
        message: "product command not found: product.missing"
      })
      expect(agentExecution).toMatchObject({
        kind: "completed",
        commandId: "product.agent.submit",
        summary: {
          valueKind: "object",
          message: "Command completed",
          references: expect.arrayContaining([
            { kind: "session", id: "ses_typed_execution_summary" }
          ])
        }
      })
      expect(JSON.stringify(agentExecution)).not.toContain("Fake response")
      expect(agentExecution).not.toHaveProperty("value")
      expect(JSON.stringify(settings)).not.toContain(storeDir)
      expect(JSON.stringify(commandCatalog)).not.toContain(storeDir)
      expect(JSON.stringify(settings)).not.toContain(serviceBin)
      expect(JSON.stringify(settings)).not.toContain("apiKey")
    } finally {
      await app.dispose()
    }
  })

  it("keeps selected session, layout, mode, and preferences as app-owned state", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir, {
      state: {
        layout: "split",
        mode: "workbench",
        preferences: {
          theme: "dark",
          density: "compact"
        }
      }
    })
    try {
      expect(app.status().state).toMatchObject({
        layout: "split",
        mode: "workbench",
        preferences: {
          theme: "dark",
          density: "compact"
        }
      })

      await app.selectSession({ sessionId: "ses_product_app_state" })
      await app.setLayout({ layout: "diagnostics" })
      await app.setMode({ mode: "diagnostics" })
      await app.updatePreferences({ preferences: { theme: "light" } })

      expect(app.status().state).toEqual({
        selectedSessionId: "ses_product_app_state",
        layout: "diagnostics",
        mode: "diagnostics",
        preferences: {
          theme: "light",
          density: "compact"
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("loads Product App state from an injected app-owned state store", async () => {
    const storeDir = await createStoreDir()
    const stateStore = createMemoryProductAppStateStore({
      selectedSessionId: "ses_stored_product_app",
      layout: "split",
      mode: "workbench",
      preferences: {
        theme: "dark",
        density: "compact"
      }
    })
    const app = await createTestApp(storeDir, { stateStore })
    try {
      expect(app.status().state).toEqual({
        selectedSessionId: "ses_stored_product_app",
        layout: "split",
        mode: "workbench",
        preferences: {
          theme: "dark",
          density: "compact"
        }
      })
      expect(app.readSettings().renderer).toMatchObject({
        layout: "split",
        mode: "workbench",
        preferences: {
          theme: "dark",
          density: "compact"
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("lets explicit initial Product App state override stored state", async () => {
    const storeDir = await createStoreDir()
    const stateStore = createMemoryProductAppStateStore({
      selectedSessionId: "ses_stored_product_app",
      layout: "split",
      mode: "workbench",
      preferences: {
        theme: "dark",
        density: "compact"
      }
    })
    const app = await createTestApp(storeDir, {
      stateStore,
      state: {
        layout: "diagnostics",
        preferences: {
          theme: "light"
        }
      }
    })
    try {
      expect(app.status().state).toEqual({
        selectedSessionId: "ses_stored_product_app",
        layout: "diagnostics",
        mode: "workbench",
        preferences: {
          theme: "light",
          density: "compact"
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("persists each Product App state mutation before reporting success", async () => {
    const storeDir = await createStoreDir()
    const stateStore = createMemoryProductAppStateStore()
    const app = await createTestApp(storeDir, { stateStore })
    try {
      await app.selectSession({ sessionId: "ses_saved_product_app" })
      await app.setLayout({ layout: "split" })
      await app.setMode({ mode: "workbench" })
      const saved = await app.updatePreferences({
        preferences: {
          density: "compact"
        }
      })

      expect(saved).toEqual({
        selectedSessionId: "ses_saved_product_app",
        layout: "split",
        mode: "workbench",
        preferences: {
          theme: "system",
          density: "compact"
        }
      })
      expect(stateStore.snapshot()).toEqual({
        ui: saved,
        trackedConversationOperations: {},
        conversationAttachmentDrafts: {}
      })
      expect(stateStore.saveCount()).toBe(4)
    } finally {
      await app.dispose()
    }
  })

  it("fails closed when the Product App state store rejects a mutation", async () => {
    const storeDir = await createStoreDir()
    const stateStore: ProductAppStateStore = {
      async load() {
        return { found: false }
      },
      async save() {
        throw new Error("state store unavailable")
      }
    }
    const app = await createTestApp(storeDir, { stateStore })
    try {
      await expect(
        app.setLayout({ layout: "split" })
      ).rejects.toThrow("state store unavailable")
      expect(app.status().state).toEqual({
        layout: "single",
        mode: "chat",
        preferences: {
          theme: "system",
          density: "comfortable"
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("uses the selected session for asynchronous conversation submits", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    try {
      const first = await app.submitConversationOperation({
        text: "product app first turn",
        sessionId: "ses_product_app_workbench"
      })
      expect(first).toMatchObject({
        kind: "product-app.conversation-operation.found",
        operation: { sessionId: "ses_product_app_workbench" }
      })
      await waitForProductConversation(app, "ses_product_app_workbench")

      const opened = await app.openWorkbench({
        sessionId: "ses_product_app_workbench"
      })
      expect(opened).toMatchObject({
        kind: "product-app.workbench.opened",
        sessionId: "ses_product_app_workbench"
      })
      expect(app.status().state.selectedSessionId).toBe(
        "ses_product_app_workbench"
      )

      const continued = await app.submitConversationOperation({
        text: "product app continued turn"
      })
      expect(continued).toMatchObject({
        kind: "product-app.conversation-operation.found",
        operation: { sessionId: "ses_product_app_workbench" }
      })
      await waitForProductConversation(app, "ses_product_app_workbench")
      const refreshed = await app.openWorkbench()
      expect(refreshed).toMatchObject({
        kind: "product-app.workbench.opened",
        workbench: { summary: { inputCount: 2, messageCount: 4 } }
      })
      if (refreshed.kind !== "product-app.workbench.opened") {
        throw new Error("expected opened workbench")
      }
      expect(refreshed.workbench.summary.latestUserText).toBe(
        "product app continued turn"
      )
    } finally {
      await app.dispose()
    }
  })

  it("starts a conversation without a preselected session", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    try {
      const started = await app.submitConversationOperation({
        text: "product app started turn"
      })
      expect(started).toMatchObject({
        kind: "product-app.conversation-operation.found",
        operation: { state: expect.stringMatching(/queued|running|succeeded/) }
      })
      if (started.kind !== "product-app.conversation-operation.found") {
        throw new Error("expected submitted conversation")
      }
      expect(app.status().state.selectedSessionId).toBe(
        started.operation.sessionId
      )
      await waitForProductConversation(app, started.operation.sessionId)

      const continued = await app.submitConversationOperation({
        text: "product app continued after start"
      })
      expect(continued).toMatchObject({
        kind: "product-app.conversation-operation.found",
        operation: { sessionId: started.operation.sessionId }
      })
    } finally {
      await app.dispose()
    }
  })

  it("adapts the product command JSON boundary and fails closed without a session", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    try {
      const missing = await app.openWorkbench()
      expect(missing).toEqual({
        kind: "product-app.workbench.no-session",
        message: "select a session before opening the workbench"
      })

      const json = await app.dispatchProductCommandJson(
        JSON.stringify({ command: "status" })
      )
      expect(json.status).toBe("success")
      expect(json.envelope.ok).toBe(true)

      const unknown = await app.dispatchProductCommandJson(
        JSON.stringify({ command: "missing.command" })
      )
      expect(unknown.status).toBe("unknown_command")
      expect(unknown.envelope.ok).toBe(false)
    } finally {
      await app.dispose()
    }
  })

  it("exposes a transport-neutral surface descriptor and safe command envelopes", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    try {
      const surface = createProductAppSurfaceAdapter(app, { now: () => 10_001 })
      const descriptor = surface.descriptor()

      expect(descriptor).toMatchObject({
        kind: "product-app.surface-descriptor",
        transport: "app-owned-ipc-or-api",
        rendererBoundary: {
          rendererMayOpenStorage: false,
          rendererMayReceiveStorePath: false,
          rendererMayReceiveServiceBinaryPath: false
        }
      })
      expect(descriptor.commands.map((command) => command.command)).toEqual([
        "status",
        "readHome",
        "readSettings",
        "selectSession",
        "setLayout",
        "setMode",
        "updatePreferences",
        "listProviderProfiles",
        "readProductCommands",
        "setActiveProviderProfile",
        "dispatchProductCommand",
        "dispatchProductCommandJson",
        "previewProductCommandInvocation",
        "executeProductCommand",
        "readExecutionReference",
        "openWorkbench",
        "prepareConversationAttachment",
        "readConversationAttachments",
        "removeConversationAttachment",
        "submitConversationOperation",
        "readTrackedConversationOperation",
        "cancelTrackedConversationOperation",
        "regenerateTrackedConversationOperation"
      ])

      const selected = await surface.dispatchSurfaceCommand({
        command: "selectSession",
        requestId: "req_select",
        input: { sessionId: "ses_product_app_surface" }
      })
      expect(selected).toMatchObject({
        ok: true,
        command: "selectSession",
        event: {
          type: "product-app.surface.command_completed",
          requestId: "req_select",
          state: {
            selectedSessionId: "ses_product_app_surface"
          }
        }
      })
      expect(surface.readSurfaceEvents()).toEqual([
        expect.objectContaining({
          type: "product-app.surface.command_completed",
          command: "selectSession"
        }),
        expect.objectContaining({
          type: "product-app.surface.state_changed",
          command: "selectSession",
          state: expect.objectContaining({
            selectedSessionId: "ses_product_app_surface"
          })
        })
      ])

      const commandCatalog = await surface.dispatchSurfaceCommand({
        command: "readProductCommands",
        requestId: "req_product_commands"
      })
      expect(commandCatalog).toMatchObject({
        ok: true,
        command: "readProductCommands",
        value: {
          commands: expect.arrayContaining([
            expect.objectContaining({
              id: "product.agent.submit"
            })
          ]),
          diagnostics: []
        },
        event: {
          type: "product-app.surface.command_completed",
          requestId: "req_product_commands"
        }
      })
      const typedExecution = await surface.dispatchSurfaceCommand({
        command: "executeProductCommand",
        requestId: "req_execute_product_status",
        input: {
          commandId: "product.status"
        }
      })
      expect(typedExecution).toMatchObject({
        ok: true,
        command: "executeProductCommand",
        value: {
          kind: "completed",
          commandId: "product.status",
          handlerRef: "wanex.product-app.backend.status"
        },
        event: {
          requestId: "req_execute_product_status"
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("dispatches asynchronous conversation flow through the surface adapter", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    try {
      const surface = createProductAppSurfaceAdapter(app, { now: () => 10_002 })

      const started = await surface.dispatchSurfaceCommand({
        command: "submitConversationOperation",
        input: {
          text: "surface started turn"
        }
      })
      expect(started).toMatchObject({
        ok: true,
        command: "submitConversationOperation",
        value: {
          kind: "product-app.conversation-operation.found"
        }
      })
      if (
        !started.ok ||
        typeof started.value !== "object" ||
        started.value === null ||
        !("operation" in started.value)
      ) {
        throw new Error("expected submitted surface conversation")
      }
      const sessionId = (started.value as {
        readonly operation: { readonly sessionId: string }
      }).operation.sessionId
      await waitForProductConversation(app, sessionId)

      const opened = await surface.dispatchSurfaceCommand({
        command: "openWorkbench",
        input: {
          sessionId
        }
      })
      expect(opened).toMatchObject({
        ok: true,
        command: "openWorkbench",
        value: {
          kind: "product-app.workbench.opened",
          sessionId
        }
      })

      const continued = await surface.dispatchSurfaceCommand({
        command: "submitConversationOperation",
        input: {
          text: "surface continued turn"
        }
      })
      expect(continued).toMatchObject({
        ok: true,
        command: "submitConversationOperation",
        value: {
          kind: "product-app.conversation-operation.found",
          operation: { sessionId }
        }
      })
      expect(surface.readSurfaceEvents({ limit: 20 })).toEqual(
        expect.arrayContaining([
        expect.objectContaining({
          type: "product-app.surface.command_completed",
          command: "submitConversationOperation"
        }),
        expect.objectContaining({
          type: "product-app.surface.state_changed",
          command: "submitConversationOperation"
        })
        ])
      )
    } finally {
      await app.dispose()
    }
  })

  it("enforces the provider run gate through the surface client boundary", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir, {
      providerProfile: {
        id: "product-app-surface-blocked-provider",
        kind: "openai-compatible",
        capabilities: { input: ["text"], output: ["text"] },
        providerId: "openai-compatible",
        modelId: "product-app-surface-blocked-model"
      }
    })
    try {
      const surface = createProductAppSurfaceAdapter(app, { now: () => 10_004 })
      const client = createProductAppSurfaceClient(
        createInProcessProductAppSurfaceClientTransport(surface)
      )

      const started = await client.submitConversationOperation({
        text: "surface should not start without provider setup"
      })
      expect(started).toMatchObject({
        ok: true,
        command: "submitConversationOperation",
        value: {
          kind: "product-app.conversation-operation.rejected",
          reason: "provider_not_ready"
        },
        event: {
          type: "product-app.surface.command_completed",
          command: "submitConversationOperation"
        }
      })

      await client.selectSession({ sessionId: "ses_surface_provider_blocked" })
      const continued = await client.submitConversationOperation({
        text: "surface should not continue without provider setup"
      })
      expect(continued).toMatchObject({
        ok: true,
        command: "submitConversationOperation",
        value: {
          kind: "product-app.conversation-operation.rejected",
          reason: "provider_not_ready",
          sessionId: "ses_surface_provider_blocked",
        }
      })

      const rawRun = await client.dispatchProductCommand({
        command: "submitConversationOperation",
        input: {
          text: "surface raw command should not bypass provider setup"
        }
      })
      expect(rawRun).toMatchObject({
        ok: true,
        command: "dispatchProductCommand",
        value: {
          ok: false,
          command: "submitConversationOperation",
          error: {
            code: "provider_not_ready",
            category: "validation"
          }
        }
      })

      const preview = await client.previewProductCommandInvocation({
        commandId: "product.agent.submit",
        input: {
          text: "surface preview should report provider gate"
        }
      })
      expect(preview).toMatchObject({
        ok: true,
        command: "previewProductCommandInvocation",
        value: {
          kind: "rejected",
          reason: "provider_not_ready"
        },
        event: {
          type: "product-app.surface.command_completed",
          command: "previewProductCommandInvocation"
        }
      })

      const serialized = JSON.stringify([started, continued, rawRun, preview])
      expect(serialized).not.toContain(storeDir)
      expect(serialized).not.toContain(serviceBin)
      expect(serialized).not.toContain("apiKey")
    } finally {
      await app.dispose()
    }
  })

  it("fails closed for invalid surface commands without leaking local paths", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    try {
      const surface = createProductAppSurfaceAdapter(app)

      const unknown = await surface.dispatchSurfaceCommand({
        command: "missing.surface.command"
      })
      expect(unknown).toMatchObject({
        ok: false,
        command: "missing.surface.command",
        error: {
          code: "unknown_command",
          category: "validation"
        }
      })

      const invalid = await surface.dispatchSurfaceCommand({
        command: "setLayout",
        input: { layout: "stacked" }
      })
      expect(invalid).toMatchObject({
        ok: false,
        command: "setLayout",
        error: {
          code: "validation_error",
          category: "validation",
          message: "setLayout input.layout is not supported"
        }
      })

      const invalidExecution = await surface.dispatchSurfaceCommand({
        command: "executeProductCommand",
        input: {}
      })
      expect(invalidExecution).toMatchObject({
        ok: false,
        command: "executeProductCommand",
        error: {
          code: "validation_error",
          category: "validation",
          message:
            "executeProductCommand input.commandId must be a non-empty string"
        }
      })

      const serialized = JSON.stringify([unknown, invalid, invalidExecution])
      expect(serialized).not.toContain(storeDir)
      expect(serialized).not.toContain(serviceBin)
      expect(serialized).not.toContain("Error:")
    } finally {
      await app.dispose()
    }
  })

  it("prepares, removes, and safely projects conversation attachment drafts", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir, {
      providerProfile: {
        id: "product-app-attachment",
        modelId: "product-app-attachment-model",
        capabilities: { input: ["text", "image"], output: ["text"] }
      }
    })
    try {
      const resource = await app.trustedResources.ingestResource({
        content: new Uint8Array([137, 80, 78, 71]),
        kind: "image",
        mediaType: "image/png",
        origin: "user_upload",
        label: "draft.png",
        source: { sourceUrl: "https://private.example/draft.png" },
        metadata: { absolutePath: "/private/draft.png", token: "secret" }
      })
      const prepared = await app.prepareConversationAttachment({
        resourceId: resource.id,
        sessionId: "ses_product_attachment_draft"
      })
      const duplicate = await app.prepareConversationAttachment({
        resourceId: resource.id,
        sessionId: "ses_product_attachment_draft"
      })

      expect(prepared.attachments.attachments).toHaveLength(1)
      expect(duplicate.attachments.attachments).toHaveLength(1)
      expect(prepared.attachment).toMatchObject({
        kind: "product-app.attachment",
        resourceId: resource.id,
        resourceKind: "image",
        previewKind: "image",
        mediaType: "image/png",
        label: "draft.png",
        sizeBytes: 4
      })
      const serialized = JSON.stringify(prepared)
      expect(serialized).not.toContain("sourceUrl")
      expect(serialized).not.toContain("metadata")
      expect(serialized).not.toContain("absolutePath")
      expect(serialized).not.toContain("secret")
      expect(serialized).not.toContain("logicalPath")
      expect(serialized).not.toContain("content")

      const removed = await app.removeConversationAttachment({
        resourceId: resource.id,
        sessionId: "ses_product_attachment_draft"
      })
      expect(removed.removed).toBe(true)
      expect(removed.attachments.attachments).toEqual([])
      const submittedAfterRemove = await app.submitConversationOperation({
        text: "text only after removing the attachment",
        sessionId: "ses_product_attachment_draft"
      })
      expect(submittedAfterRemove.kind).toBe(
        "product-app.conversation-operation.found"
      )
    } finally {
      await app.dispose()
    }
  })

  it("submits canonical resource references, clears admitted drafts, and regenerates after restart", async () => {
    const storeDir = await createStoreDir()
    const stateStore = createMemoryProductAppStateStore()
    const options = {
      stateStore,
      providerProfile: {
        id: "product-app-resource-submit",
        modelId: "product-app-resource-submit-model",
        capabilities: { input: ["text", "image"] as const, output: ["text"] as const }
      }
    }
    const first = await createTestApp(storeDir, options)
    let sessionId = ""
    try {
      const resource = await first.trustedResources.ingestResource({
        content: new Uint8Array([1, 3, 3, 7]),
        kind: "image",
        mediaType: "image/png",
        origin: "user_upload",
        label: "canonical.png"
      })
      await first.prepareConversationAttachment({ resourceId: resource.id })
      const submitted = await first.submitConversationOperation({
        text: "inspect this image"
      })
      expect(submitted.kind).toBe("product-app.conversation-operation.found")
      if (submitted.kind !== "product-app.conversation-operation.found") return
      sessionId = submitted.operation.sessionId
      expect(first.readConversationAttachments().attachments).toEqual([])
      await waitForProductConversation(first, sessionId)
    } finally {
      await first.dispose()
    }

    const restarted = await createTestApp(storeDir, options)
    try {
      const regenerated = await restarted.regenerateTrackedConversationOperation({
        sessionId
      })
      expect(regenerated.kind).toBe("product-app.conversation-operation.found")
      expect(restarted.readConversationAttachments({ sessionId }).attachments).toEqual([])
    } finally {
      await restarted.dispose()
    }
  })

  it("preserves attachment drafts when the active provider does not support them", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    try {
      const resource = await app.trustedResources.ingestResource({
        content: new Uint8Array([9, 8, 7]),
        kind: "image",
        mediaType: "image/png",
        origin: "user_upload"
      })
      await app.prepareConversationAttachment({ resourceId: resource.id })
      const result = await app.submitConversationOperation({ text: "unsupported" })
      expect(result).toMatchObject({
        kind: "product-app.conversation-operation.rejected",
        reason: "unsupported_attachment"
      })
      expect(app.readConversationAttachments().attachments).toHaveLength(1)
    } finally {
      await app.dispose()
    }
  })

  it("drives the product app surface through the renderer-side client contract", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    try {
      const surface = createProductAppSurfaceAdapter(app, { now: () => 10_003 })
      const client = createProductAppSurfaceClient(
        createInProcessProductAppSurfaceClientTransport(surface)
      )

      const descriptor = await client.descriptor()
      expect(descriptor).toMatchObject({
        ok: true,
        value: {
          kind: "product-app.surface-descriptor",
          commandCount: 23
        }
      })
      const commandCatalog = await client.readProductCommands({
        requestId: "req_client_product_commands"
      })
      expect(commandCatalog).toMatchObject({
        ok: true,
        command: "readProductCommands",
        value: {
          commands: expect.arrayContaining([
            expect.objectContaining({
              id: "product.agent.submit",
              title: "Submit Agent Turn"
            })
          ]),
          diagnostics: []
        },
        event: {
          requestId: "req_client_product_commands"
        }
      })
      const typedExecution = await client.executeProductCommand(
        { commandId: "product.status" },
        { requestId: "req_client_execute_product_status" }
      )
      expect(typedExecution).toMatchObject({
        ok: true,
        command: "executeProductCommand",
        value: {
          kind: "completed",
          commandId: "product.status",
          handlerRef: "wanex.product-app.backend.status"
        },
        event: {
          requestId: "req_client_execute_product_status"
        }
      })
      await app.providerProfiles.upsertProviderProfile({
        profile: {
          id: "surface-client-second-provider",
          kind: "fake",
          capabilities: { input: ["text"], output: ["text"] },
          providerId: "fake",
          modelId: "surface-client-second-model"
        }
      })
      const profiles = await client.listProviderProfiles({
        requestId: "req_client_profiles"
      })
      expect(profiles).toMatchObject({
        ok: true,
        command: "listProviderProfiles",
        value: {
          activeProfileId: "product-app-test",
          profiles: expect.arrayContaining([
            expect.objectContaining({
              id: "product-app-test",
              active: true,
              credentialConfigured: false
            }),
            expect.objectContaining({
              id: "surface-client-second-provider",
              active: false,
              modelId: "surface-client-second-model"
            })
          ])
        },
        event: {
          requestId: "req_client_profiles"
        }
      })
      const switched = await client.setActiveProviderProfile(
        {
          profileId: "surface-client-second-provider"
        },
        {
          requestId: "req_client_switch_provider"
        }
      )
      expect(switched).toMatchObject({
        ok: true,
        command: "setActiveProviderProfile",
        value: {
          id: "surface-client-second-provider",
          active: true,
          credentialConfigured: false
        },
        event: {
          requestId: "req_client_switch_provider"
        }
      })
      const settings = await client.readSettings({
        requestId: "req_client_settings"
      })
      expect(settings).toMatchObject({
        ok: true,
        command: "readSettings",
        value: {
          kind: "product-app.settings",
          privacy: {
            exposesStorePath: false,
            exposesServiceBinaryPath: false,
            exposesSecrets: false
          }
        },
        event: {
          requestId: "req_client_settings"
        }
      })

      const started = await client.submitConversationOperation(
        {
          text: "surface client first turn"
        },
        { requestId: "req_client_start" }
      )
      expect(started).toMatchObject({
        ok: true,
        command: "submitConversationOperation",
        value: {
          kind: "product-app.conversation-operation.found"
        }
      })
      if (
        !started.ok ||
        started.value.kind !== "product-app.conversation-operation.found"
      ) {
        throw new Error("expected client submitted conversation")
      }
      await waitForProductConversation(app, started.value.operation.sessionId)

      const continued = await client.submitConversationOperation(
        {
          text: "surface client continued turn"
        },
        { requestId: "req_client_continue" }
      )
      expect(continued).toMatchObject({
        ok: true,
        value: {
          kind: "product-app.conversation-operation.found",
          operation: { sessionId: started.value.operation.sessionId }
        },
        event: {
          requestId: "req_client_continue"
        }
      })

      const events = await client.readSurfaceEvents({ limit: 20 })
      expect(events).toMatchObject({
        ok: true,
        events: expect.arrayContaining([
          expect.objectContaining({
            type: "product-app.surface.command_completed",
            command: "submitConversationOperation"
          }),
          expect.objectContaining({
            type: "product-app.surface.state_changed",
            command: "submitConversationOperation"
          })
        ])
      })
    } finally {
      await app.dispose()
    }
  })

  it("normalizes malformed surface transport responses on the client boundary", async () => {
    const client = createProductAppSurfaceClient({
      descriptor: () => ({ broken: true }) as never,
      dispatchSurfaceCommand: () => ({ ok: true, command: "status" }) as never,
      readSurfaceEvents: () => [{ missing: "event fields" }] as never
    })

    const descriptor = await client.descriptor()
    expect(descriptor).toEqual({
      ok: false,
      error: {
        code: "invalid_transport_response",
        category: "runtime",
        message: "surface transport returned an invalid response"
      }
    })

    const status = await client.status({ requestId: "req_bad_transport" })
    expect(status).toMatchObject({
      ok: false,
      command: "status",
      error: {
        code: "invalid_transport_response",
        category: "runtime"
      },
      event: {
        type: "product-app.surface.command_rejected",
        command: "status",
        requestId: "req_bad_transport"
      }
    })

    const events = await client.readSurfaceEvents()
    expect(events).toEqual({
      ok: false,
      error: {
        code: "invalid_transport_response",
        category: "runtime",
        message: "surface transport returned an invalid response"
      }
    })
  })

  it("drives the product app surface through the message transport contract", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    try {
      const surface = createProductAppSurfaceAdapter(app, { now: () => 10_004 })
      const messages: unknown[] = []
      const client = createProductAppSurfaceClient(
        createMessageProductAppSurfaceClientTransport(async (request) => {
          messages.push(request)
          return await handleProductAppSurfaceTransportRequest(surface, request)
        })
      )

      const descriptor = await client.descriptor()
      expect(descriptor).toMatchObject({
        ok: true,
        value: {
          kind: "product-app.surface-descriptor",
          commandCount: 23
        }
      })

      const started = await client.submitConversationOperation(
        {
          text: "message transport first turn"
        },
        { requestId: "req_message_start" }
      )
      expect(started).toMatchObject({
        ok: true,
        command: "submitConversationOperation",
        value: {
          kind: "product-app.conversation-operation.found"
        }
      })
      if (
        !started.ok ||
        started.value.kind !== "product-app.conversation-operation.found"
      ) {
        throw new Error("expected message transport submitted conversation")
      }
      await waitForProductConversation(app, started.value.operation.sessionId)

      const continued = await client.submitConversationOperation(
        {
          text: "message transport continued turn"
        },
        { requestId: "req_message_continue" }
      )
      expect(continued).toMatchObject({
        ok: true,
        command: "submitConversationOperation",
        event: {
          requestId: "req_message_continue"
        },
        value: {
          kind: "product-app.conversation-operation.found"
        }
      })

      const events = await client.readSurfaceEvents({ limit: 20 })
      expect(events).toMatchObject({
        ok: true,
        events: expect.arrayContaining([
          expect.objectContaining({
            type: "product-app.surface.command_completed",
            command: "submitConversationOperation"
          }),
          expect.objectContaining({
            type: "product-app.surface.state_changed",
            command: "submitConversationOperation"
          })
        ])
      })
      expect(messages).toEqual([
        expect.objectContaining({
          kind: "product-app.surface-transport.request",
          operation: "descriptor"
        }),
        expect.objectContaining({
          kind: "product-app.surface-transport.request",
          operation: "dispatchSurfaceCommand",
          requestId: "req_message_start",
          command: expect.objectContaining({
            command: "submitConversationOperation",
            requestId: "req_message_start"
          })
        }),
        expect.objectContaining({
          kind: "product-app.surface-transport.request",
          operation: "dispatchSurfaceCommand",
          requestId: "req_message_continue",
          command: expect.objectContaining({
            command: "submitConversationOperation",
            requestId: "req_message_continue"
          })
        }),
        expect.objectContaining({
          kind: "product-app.surface-transport.request",
          operation: "readSurfaceEvents"
        })
      ])
      expect(
        JSON.stringify([descriptor, started, continued, events])
      ).not.toContain(storeDir)
      expect(
        JSON.stringify([descriptor, started, continued, events])
      ).not.toContain(serviceBin)
    } finally {
      await app.dispose()
    }
  })

  it("exposes a host endpoint for renderer-like message clients", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    try {
      const surface = createProductAppSurfaceAdapter(app, { now: () => 10_005 })
      const observed: unknown[] = []
      const endpoint = createProductAppSurfaceHostEndpoint({
        surface,
        observeRequest(request) {
          observed.push(request)
        }
      })
      const client = createProductAppSurfaceClient(
        createMessageProductAppSurfaceClientTransport((request) =>
          endpoint.send(request)
        )
      )

      const descriptor = await client.descriptor()
      const selected = await client.selectSession(
        { sessionId: "ses_product_app_host_endpoint" },
        { requestId: "req_host_endpoint_select" }
      )
      const home = await client.readHome({
        overview: {
          now: 10_006,
          recentSessionLimit: 3
        }
      })
      const events = await client.readSurfaceEvents({ limit: 3 })
      const lastSequence = events.ok
        ? Math.max(...events.events.map((event) => event.sequence))
        : 0
      const status = await client.status({
        requestId: "req_host_endpoint_status_after_cursor"
      })
      const cursorEvents = await client.readSurfaceEvents({
        afterSequence: lastSequence,
        limit: 5
      })

      expect(descriptor).toMatchObject({
        ok: true,
        value: {
          kind: "product-app.surface-descriptor",
          commandCount: 23
        }
      })
      expect(selected).toMatchObject({
        ok: true,
        command: "selectSession",
        event: {
          requestId: "req_host_endpoint_select"
        }
      })
      expect(home).toMatchObject({
        ok: true,
        value: {
          kind: "product-app.home",
          state: {
            selectedSessionId: "ses_product_app_host_endpoint"
          }
        }
      })
      expect(status).toMatchObject({
        ok: true,
        command: "status",
        event: {
          requestId: "req_host_endpoint_status_after_cursor"
        }
      })
      expect(events).toMatchObject({
        ok: true,
        events: expect.arrayContaining([
          expect.objectContaining({
            type: "product-app.surface.command_completed",
            command: "selectSession"
          }),
          expect.objectContaining({
            type: "product-app.surface.state_changed",
            command: "selectSession"
          }),
          expect.objectContaining({
            type: "product-app.surface.command_completed",
            command: "readHome"
          })
        ])
      })
      expect(cursorEvents).toMatchObject({
        ok: true,
        events: [
          {
            type: "product-app.surface.command_completed",
            command: "status",
            requestId: "req_host_endpoint_status_after_cursor"
          }
        ]
      })
      expect(observed).toEqual([
        expect.objectContaining({
          kind: "product-app.surface-transport.request",
          operation: "descriptor"
        }),
        expect.objectContaining({
          kind: "product-app.surface-transport.request",
          operation: "dispatchSurfaceCommand",
          requestId: "req_host_endpoint_select",
          command: expect.objectContaining({
            command: "selectSession",
            requestId: "req_host_endpoint_select"
          })
        }),
        expect.objectContaining({
          kind: "product-app.surface-transport.request",
          operation: "dispatchSurfaceCommand",
          command: expect.objectContaining({
            command: "readHome"
          })
        }),
        expect.objectContaining({
          kind: "product-app.surface-transport.request",
          operation: "readSurfaceEvents"
        }),
        expect.objectContaining({
          kind: "product-app.surface-transport.request",
          operation: "dispatchSurfaceCommand",
          requestId: "req_host_endpoint_status_after_cursor",
          command: expect.objectContaining({
            command: "status",
            requestId: "req_host_endpoint_status_after_cursor"
          })
        }),
        expect.objectContaining({
          kind: "product-app.surface-transport.request",
          operation: "readSurfaceEvents",
          input: {
            afterSequence: lastSequence,
            limit: 5
          }
        })
      ])

      const serialized = JSON.stringify([
        descriptor,
        selected,
        home,
        status,
        events,
        cursorEvents
      ])
      expect(serialized).not.toContain(storeDir)
      expect(serialized).not.toContain(serviceBin)
    } finally {
      await app.dispose()
    }
  })

  it("fails closed when the host endpoint boundary throws", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    try {
      const surface = createProductAppSurfaceAdapter(app)
      const endpoint = createProductAppSurfaceHostEndpoint({
        surface,
        observeRequest() {
          throw new Error(`host-only failure ${storeDir} ${serviceBin}`)
        }
      })

      const response = await endpoint.send({
        kind: "product-app.surface-transport.request",
        operation: "dispatchSurfaceCommand",
        requestId: "req_host_endpoint_failure",
        command: {
          command: "status",
          requestId: "req_host_endpoint_failure"
        }
      })

      expect(response).toEqual({
        ok: false,
        kind: "product-app.surface-transport.response",
        operation: "dispatchSurfaceCommand",
        requestId: "req_host_endpoint_failure",
        error: {
          code: "command_error",
          category: "runtime",
          message: "surface host endpoint failed"
        }
      })
      expect(JSON.stringify(response)).not.toContain(storeDir)
      expect(JSON.stringify(response)).not.toContain(serviceBin)
    } finally {
      await app.dispose()
    }
  })

  it("fails closed for malformed surface transport messages", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    try {
      const surface = createProductAppSurfaceAdapter(app)

      const malformed = await handleProductAppSurfaceTransportRequest(
        surface,
        "bad-request"
      )
      expect(malformed).toEqual({
        ok: false,
        kind: "product-app.surface-transport.response",
        operation: "unknown",
        error: {
          code: "validation_error",
          category: "validation",
          message: "request must be an object"
        }
      })

      const unsupported = await handleProductAppSurfaceTransportRequest(
        surface,
        {
          kind: "product-app.surface-transport.request",
          operation: "restartGateway",
          requestId: "req_unsupported"
        }
      )
      expect(unsupported).toEqual({
        ok: false,
        kind: "product-app.surface-transport.response",
        operation: "unknown",
        requestId: "req_unsupported",
        error: {
          code: "validation_error",
          category: "validation",
          message:
            "unsupported product app surface transport operation: restartGateway"
        }
      })

      const invalidCommand = await handleProductAppSurfaceTransportRequest(
        surface,
        {
          kind: "product-app.surface-transport.request",
          operation: "dispatchSurfaceCommand",
          requestId: "req_bad_command"
        }
      )
      expect(invalidCommand).toEqual({
        ok: false,
        kind: "product-app.surface-transport.response",
        operation: "dispatchSurfaceCommand",
        requestId: "req_bad_command",
        error: {
          code: "validation_error",
          category: "validation",
          message: "dispatchSurfaceCommand request.command must be an object"
        }
      })

      const invalidCursor = await handleProductAppSurfaceTransportRequest(
        surface,
        {
          kind: "product-app.surface-transport.request",
          operation: "readSurfaceEvents",
          requestId: "req_bad_cursor",
          input: {
            afterSequence: -1
          }
        }
      )
      expect(invalidCursor).toEqual({
        ok: false,
        kind: "product-app.surface-transport.response",
        operation: "readSurfaceEvents",
        requestId: "req_bad_cursor",
        error: {
          code: "validation_error",
          category: "validation",
          message:
            "readSurfaceEvents request.input.afterSequence must be a non-negative integer"
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("normalizes malformed message transport responses on the client boundary", async () => {
    const malformedClient = createProductAppSurfaceClient(
      createMessageProductAppSurfaceClientTransport(async () => ({
        ok: true,
        kind: "product-app.surface-transport.response",
        operation: "dispatchSurfaceCommand",
        value: { broken: true }
      }) as never)
    )
    const status = await malformedClient.status({
      requestId: "req_message_bad"
    })
    expect(status).toMatchObject({
      ok: false,
      command: "status",
      error: {
        code: "invalid_transport_response",
        category: "runtime"
      },
      event: {
        type: "product-app.surface.command_rejected",
        command: "status",
        requestId: "req_message_bad"
      }
    })

    const rejectedClient = createProductAppSurfaceClient(
      createMessageProductAppSurfaceClientTransport(async (request) => ({
        ok: false,
        kind: "product-app.surface-transport.response",
        operation: request.operation,
        error: {
          code: "validation_error",
          category: "validation",
          message: "blocked by test transport"
        }
      }))
    )
    const descriptor = await rejectedClient.descriptor()
    expect(descriptor).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        category: "validation",
        message: "blocked by test transport"
      }
    })
  })
})

async function waitForProductConversation(
  app: ProductAppShell,
  sessionId: string
): Promise<void> {
  let pollIntervalMs = 25
  for (;;) {
    const result = await app.readTrackedConversationOperation({ sessionId })
    if (
      result.kind === "product-app.conversation-operation.found" &&
      result.operation.capabilities.terminal
    ) {
      return
    }
    const status = app.status()
    if (status.disposed || !status.product.started) {
      throw new Error(
        `conversation operation processor stopped before settlement: ${sessionId}`
      )
    }
    await delay(pollIntervalMs)
    pollIntervalMs = Math.min(pollIntervalMs * 2, 500)
  }
}

async function createStoreDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-product-app-test-"))
  tempDirs.push(dir)
  return dir
}

async function createTestApp(
  storeDir: string,
  options: Partial<Parameters<typeof createProductAppShell>[0]> = {}
): Promise<ProductAppShell> {
  return await createProductAppShell({
    storage: {
      kind: "local-system-service",
      storeDir
    },
    artifacts: {
      explicitPath: serviceBin
    },
    providerProfile: {
      id: "product-app-test",
      modelId: "product-app-test-model"
    },
    ...options
  })
}
