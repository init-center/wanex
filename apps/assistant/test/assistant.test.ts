import { createHash } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, describe, expect, it } from "vitest"
import {
  createMemoryStateStore,
  createSurfaceAdapter,
  createShell,
  type ConversationHistoryRow,
  type StateStore,
  type Shell
} from "../src/index.js"
import {
  createInProcessSurfaceClientTransport,
  createMessageSurfaceClientTransport,
  createSurfaceHostEndpoint,
  handleSurfaceTransportRequest,
  createSurfaceClient
} from "../src/surface/client.js"
import {
  createStorageTestStore,
  createTestTurnExecutionBinding
} from "@wanex/storage/testing"
import { EnvSecretProvider, SecretResolver } from "@wanex/runtime/secrets"
import {
  AllowAllToolsPolicy,
  createToolRuntimeBinding,
  ToolRegistry,
  type ToolDefinition
} from "@wanex/runtime/tools"
import {
  createStaticAppExtensionCatalogSource,
  resolveAppExtensionContributions,
  type AppCommandContribution
} from "@wanex/extension"
import { assistantTestModelEndpoint } from "./model-endpoint-fixture.js"

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

describe("@wanex/assistant", () => {
  it("opens a assistant backend shell without exposing storage internals", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    try {
      const home = await app.readHome({ overview: { now: 9300 } })

      expect(home).toMatchObject({
        kind: "assistant.home",
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
          reason: "active_endpoint_ready",
          activeEndpointId: "assistant-test",
          endpointCount: 1,
          canRun: true,
          attentionRequired: false,
          requiresCredential: false,
          credentialConfigured: false,
          activeEndpoint: expect.objectContaining({
            id: "assistant-test",
            protocol: { id: "fake" },
            model: expect.objectContaining({
              inputModalities: ["text"],
              outputModalities: ["text"]
            }),
            active: true
          })
        }
      })
      expect(home.assistant.provider.activeEndpointId).toBe("assistant-test")
      expect(home.commandPort.commandCount).toBeGreaterThan(10)
      expect(JSON.stringify(home)).not.toContain(storeDir)
      expect(JSON.stringify(home)).not.toContain(serviceBin)
    } finally {
      await app.dispose()
    }
  })

  it("opens a clean store in setup-required state and blocks conversation admission", async () => {
    const storeDir = await createStoreDir()
    const app = await createShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: { explicitPath: serviceBin }
    })

    try {
      await expect(app.readHome()).resolves.toMatchObject({
        providerReadiness: {
          status: "missing_active_endpoint",
          reason: "active_endpoint_missing",
          endpointCount: 0,
          canRun: false,
          attentionRequired: true,
          requiresCredential: false,
          credentialConfigured: false
        }
      })
      expect(app.readSettings().profile).not.toHaveProperty(
        "activeModelEndpointId"
      )
      await expect(
        app.submitConversationOperation({ text: "blocked until setup" })
      ).resolves.toEqual({
        kind: "assistant.conversation-operation.rejected",
        reason: "provider_not_ready",
        message: "provider is not ready: no active model endpoint is configured"
      })
    } finally {
      await app.dispose()
    }
  })

  it("projects provider readiness without exposing provider secrets", async () => {
    const missingCredentialStoreDir = await createStoreDir()
    const missingCredentialApp = await createTestApp(
      missingCredentialStoreDir,
      {
        modelEndpoint: assistantTestModelEndpoint({
          endpointId: "assistant-openai-missing-key",
          protocolId: "openai-chat-completions",
          providerId: "openai-compatible",
          modelId: "assistant-openai-missing-key-model"
        })
      }
    )
    try {
      const home = await missingCredentialApp.readHome()
      expect(home.providerReadiness).toMatchObject({
        status: "missing_required_credential",
        reason: "active_endpoint_missing_credential",
        activeEndpointId: "assistant-openai-missing-key",
        endpointCount: 1,
        canRun: false,
        attentionRequired: true,
        requiresCredential: true,
        credentialConfigured: false,
        activeEndpoint: {
          id: "assistant-openai-missing-key",
          connection: expect.objectContaining({
            providerId: "openai-compatible"
          }),
          protocol: { id: "openai-chat-completions" },
          model: expect.objectContaining({
            inputModalities: ["text"],
            outputModalities: ["text"]
          }),
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
    const readySecretRef = "env://OPENAI_READY_SECRET"
    const readyApp = await createTestApp(readyStoreDir, {
      modelEndpoint: assistantTestModelEndpoint({
        endpointId: "assistant-openai-ready",
        protocolId: "openai-chat-completions",
        providerId: "openai-compatible",
        modelId: "assistant-openai-ready-model",
        secretRef: readySecretRef
      })
    })
    try {
      const home = await readyApp.readHome()
      expect(home.providerReadiness).toMatchObject({
        status: "ready",
        reason: "active_endpoint_ready",
        activeEndpointId: "assistant-openai-ready",
        endpointCount: 1,
        canRun: true,
        attentionRequired: false,
        requiresCredential: true,
        credentialConfigured: true,
        activeEndpoint: {
          id: "assistant-openai-ready",
          connection: expect.objectContaining({
            providerId: "openai-compatible"
          }),
          protocol: { id: "openai-chat-completions" },
          model: expect.objectContaining({
            inputModalities: ["text"],
            outputModalities: ["text"]
          }),
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

  it("previews assistant command invocation through the assistant run gate", async () => {
    const readyStoreDir = await createStoreDir()
    const readyApp = await createTestApp(readyStoreDir)
    try {
      const runnable = await readyApp.previewAssistantCommandInvocation({
        commandId: "assistant.agent.submit",
        input: {
          text: "preview ready agent run"
        }
      })
      expect(runnable).toMatchObject({
        kind: "runnable",
        commandId: "assistant.agent.submit",
        inputAccepted: true
      })

      const readOnly = await readyApp.previewAssistantCommandInvocation({
        commandId: "assistant.status"
      })
      expect(readOnly).toMatchObject({
        kind: "runnable",
        commandId: "assistant.status",
        inputAccepted: true
      })

      const invalid = await readyApp.previewAssistantCommandInvocation({
        commandId: "assistant.agent.submit"
      })
      expect(invalid).toMatchObject({
        kind: "rejected",
        commandId: "assistant.agent.submit",
        reason: "invalid_input"
      })
    } finally {
      await readyApp.dispose()
    }

    const blockedStoreDir = await createStoreDir()
    const blockedApp = await createTestApp(blockedStoreDir, {
      modelEndpoint: assistantTestModelEndpoint({
        endpointId: "assistant-preview-blocked-provider",
        protocolId: "openai-chat-completions",
        providerId: "openai-compatible",
        modelId: "assistant-preview-blocked-model"
      })
    })
    try {
      const blocked = await blockedApp.previewAssistantCommandInvocation({
        commandId: "assistant.agent.submit",
        input: {
          text: "preview should not bypass provider setup"
        }
      })
      expect(blocked).toMatchObject({
        kind: "rejected",
        commandId: "assistant.agent.submit",
        reason: "provider_not_ready",
        providerReadiness: {
          status: "missing_required_credential",
          canRun: false,
          activeEndpointId: "assistant-preview-blocked-provider"
        }
      })

      const commandPortPreview = await blockedApp.dispatchAssistantCommand({
        command: "previewAssistantCommandInvocation",
        input: {
          commandId: "assistant.agent.submit",
          input: {
            text: "command port preview should report provider gate"
          }
        }
      })
      expect(commandPortPreview).toMatchObject({
        ok: true,
        command: "previewAssistantCommandInvocation",
        value: {
          kind: "rejected",
          reason: "provider_not_ready"
        }
      })

      const jsonPreview = await blockedApp.dispatchAssistantCommandJson(
        JSON.stringify({
          command: "previewAssistantCommandInvocation",
          input: {
            commandId: "assistant.agent.submit",
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
          command: "previewAssistantCommandInvocation",
          value: {
            kind: "rejected",
            reason: "provider_not_ready"
          }
        }
      })

      const readOnly = await blockedApp.previewAssistantCommandInvocation({
        commandId: "assistant.status"
      })
      expect(readOnly).toMatchObject({
        kind: "runnable",
        commandId: "assistant.status",
        inputAccepted: true
      })
      expect(blockedApp.status().state.selection).toBeUndefined()

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
    await seedSession(storeDir, "ses_provider_blocked")
    const app = await createTestApp(storeDir, {
      modelEndpoint: assistantTestModelEndpoint({
        endpointId: "assistant-blocked-provider",
        protocolId: "openai-chat-completions",
        providerId: "openai-compatible",
        modelId: "assistant-blocked-model"
      })
    })
    try {
      const started = await app.submitConversationOperation({
        text: "should not start without provider setup"
      })
      expect(started).toEqual({
        kind: "assistant.conversation-operation.rejected",
        reason: "provider_not_ready",
        message:
          "provider is not ready: active model endpoint assistant-blocked-provider is missing a required credential"
      })
      expect(app.status().state.selection).toBeUndefined()

      await app.selectSession({ sessionId: "ses_provider_blocked" })
      const continued = await app.submitConversationOperation({
        text: "should not continue without provider setup"
      })
      expect(continued).toEqual({
        kind: "assistant.conversation-operation.rejected",
        reason: "provider_not_ready",
        sessionId: "ses_provider_blocked",
        message:
          "provider is not ready: active model endpoint assistant-blocked-provider is missing a required credential"
      })

      const rawRun = await app.dispatchAssistantCommand({
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

      const routedRun = await app.dispatchAssistantCommand({
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

      const routedStatus = await app.dispatchAssistantCommand({
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

      const workflowRun = await app.dispatchAssistantCommand({
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

      const workflowStatus = await app.dispatchAssistantCommand({
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

      const paletteRun = await app.dispatchAssistantCommand({
        command: "executeAssistantCommand",
        input: {
          commandId: "assistant.agent.submit",
          input: {
            text: "palette command should not bypass provider setup"
          }
        }
      })
      expect(paletteRun).toMatchObject({
        ok: false,
        command: "executeAssistantCommand",
        error: {
          code: "provider_not_ready",
          category: "validation"
        }
      })

      const typedPaletteRun = await app.executeAssistantCommand({
        commandId: "assistant.agent.submit",
        input: {
          text: "typed palette command should not bypass provider setup"
        }
      })
      expect(typedPaletteRun).toMatchObject({
        kind: "rejected",
        commandId: "assistant.agent.submit",
        reason: "provider_not_ready",
        handlerRef: "wanex.assistant.backend.submitConversationOperation",
        providerReadiness: {
          canRun: false
        }
      })

      const palettePreview = await app.dispatchAssistantCommand({
        command: "previewAssistantCommandInvocation",
        input: {
          commandId: "assistant.agent.submit",
          input: {
            text: "palette preview should not claim runnable"
          }
        }
      })
      expect(palettePreview).toMatchObject({
        ok: true,
        command: "previewAssistantCommandInvocation",
        value: {
          kind: "rejected",
          reason: "provider_not_ready"
        }
      })

      const jsonRun = await app.dispatchAssistantCommandJson(
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
      const commandCatalog = app.readAssistantCommands()
      const statusExecution = await app.executeAssistantCommand({
        commandId: "assistant.status"
      })
      const missingExecution = await app.executeAssistantCommand({
        commandId: "assistant.missing"
      })
      const agentExecution = await app.executeAssistantCommand({
        commandId: "assistant.agent.submit",
        input: {
          text: "typed execution summary",
          sessionId: "ses_typed_execution_summary",
          inputId: "inp_typed_execution_summary"
        }
      })

      expect(settings).toMatchObject({
        kind: "assistant.settings",
        state: {
          layout: "split",
          mode: "workbench",
          preferences: {
            theme: "dark",
            density: "compact"
          }
        },
        profile: {
          activeModelEndpointId: "assistant-test"
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
            id: "assistant.agent.submit",
            handlerRef: "wanex.assistant.backend.submitConversationOperation"
          }),
          expect.objectContaining({
            id: "assistant.status"
          })
        ]),
        diagnostics: []
      })
      expect(statusExecution).toMatchObject({
        kind: "completed",
        commandId: "assistant.status",
        handlerRef: "wanex.assistant.backend.status",
        summary: {
          valueKind: "object",
          message: "Command completed",
          references: []
        }
      })
      expect(statusExecution).not.toHaveProperty("value")
      expect(missingExecution).toEqual({
        kind: "rejected",
        commandId: "assistant.missing",
        reason: "command_not_found",
        message: "assistant command not found: assistant.missing"
      })
      expect(agentExecution).toMatchObject({
        kind: "submitted",
        commandId: "assistant.agent.submit",
        summary: {
          valueKind: "object",
          message: "Command submitted",
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

  it("uses explicit command completion instead of inferring it from references", async () => {
    const storeDir = await createStoreDir()
    const contribution = {
      id: "extension.history",
      domain: "command",
      value: {
        name: "extension.history",
        title: "Extension history",
        paletteVisibility: "visible",
        handlerRef: "wanex.extension:history"
      },
      provenance: {
        source: {
          kind: "plugin",
          scope: "user",
          id: "extension.history"
        },
        trust: "user_enabled"
      },
      privileged: true
    } satisfies AppCommandContribution
    const app = await createTestApp(storeDir, {
      extensions: {
        source: createStaticAppExtensionCatalogSource({
          revision: "extension-history-v1",
          snapshot: resolveAppExtensionContributions([contribution])
        })
      },
      assistantCommands: {
        extensionExecutor: {
          supports: (handlerRef) => handlerRef === contribution.value.handlerRef,
          preview: () => ({ ok: true }),
          async execute() {
            return {
              kind: "completed",
              value: {
                kind: "history.lookup",
                jobId: "job_historical"
              }
            }
          }
        }
      }
    })

    try {
      await expect(
        app.executeAssistantCommand({ commandId: contribution.id })
      ).resolves.toEqual({
        kind: "completed",
        commandId: contribution.id,
        handlerRef: contribution.value.handlerRef,
        summary: {
          valueKind: "history.lookup",
          message: "Command completed",
          references: [{ kind: "job", id: "job_historical" }]
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("keeps selected session, layout, mode, and preferences as app-owned state", async () => {
    const storeDir = await createStoreDir()
    await seedSession(storeDir, "ses_assistant_app_state")
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

      await app.selectSession({ sessionId: "ses_assistant_app_state" })
      await app.setLayout({ layout: "diagnostics" })
      await app.setMode({ mode: "diagnostics" })
      await app.updatePreferences({ preferences: { theme: "light" } })

      expect(app.status().state).toEqual({
        selection: {
          kind: "session",
          sessionId: "ses_assistant_app_state"
        },
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

  it("loads assistant state from an injected app-owned state store", async () => {
    const storeDir = await createStoreDir()
    const stateStore = createMemoryStateStore({
      selection: {
        kind: "session",
        sessionId: "ses_stored_assistant_app"
      },
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
        selection: {
          kind: "session",
          sessionId: "ses_stored_assistant_app"
        },
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

  it("lets explicit initial assistant state override stored state", async () => {
    const storeDir = await createStoreDir()
    const stateStore = createMemoryStateStore({
      selection: {
        kind: "session",
        sessionId: "ses_stored_assistant_app"
      },
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
        selection: {
          kind: "session",
          sessionId: "ses_stored_assistant_app"
        },
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

  it("persists each assistant state mutation before reporting success", async () => {
    const storeDir = await createStoreDir()
    await seedSession(storeDir, "ses_saved_assistant_app")
    const stateStore = createMemoryStateStore()
    const app = await createTestApp(storeDir, { stateStore })
    try {
      await app.selectSession({ sessionId: "ses_saved_assistant_app" })
      await app.setLayout({ layout: "split" })
      await app.setMode({ mode: "workbench" })
      const saved = await app.updatePreferences({
        preferences: {
          density: "compact"
        }
      })

      expect(saved).toEqual({
        selection: {
          kind: "session",
          sessionId: "ses_saved_assistant_app"
        },
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
        pendingGuidedFollowUps: {},
        conversationAttachmentDrafts: {}
      })
      expect(stateStore.saveCount()).toBe(4)
    } finally {
      await app.dispose()
    }
  })

  it("fails closed when the assistant state store rejects a mutation", async () => {
    const storeDir = await createStoreDir()
    const stateStore: StateStore = {
      async load() {
        return { found: false }
      },
      async save() {
        throw new Error("state store unavailable")
      }
    }
    const app = await createTestApp(storeDir, { stateStore })
    try {
      await expect(app.setLayout({ layout: "split" })).rejects.toThrow(
        "state store unavailable"
      )
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
        text: "application first turn",
        sessionId: "ses_assistant_app_workbench"
      })
      expect(first).toMatchObject({
        kind: "assistant.conversation-operation.found",
        operation: { sessionId: "ses_assistant_app_workbench" }
      })
      await waitForAssistantConversation(app, "ses_assistant_app_workbench")

      const opened = await app.openWorkbench({
        sessionId: "ses_assistant_app_workbench"
      })
      expect(opened).toMatchObject({
        kind: "assistant.workbench.opened",
        sessionId: "ses_assistant_app_workbench"
      })
      expect(app.status().state.selection).toEqual({
        kind: "session",
        sessionId: "ses_assistant_app_workbench"
      })

      const continued = await app.submitConversationOperation({
        text: "application continued turn"
      })
      expect(continued).toMatchObject({
        kind: "assistant.conversation-operation.found",
        operation: { sessionId: "ses_assistant_app_workbench" }
      })
      await waitForAssistantConversation(app, "ses_assistant_app_workbench")
      const stateBeforeTranscriptRead = app.status().state
      const transcript = await app.readSessionTranscript()
      expect(transcript).toMatchObject({
        kind: "assistant.session-transcript.found",
        sessionId: "ses_assistant_app_workbench"
      })
      if (transcript.kind !== "assistant.session-transcript.found") {
        throw new Error("expected canonical session transcript")
      }
      expect(
        transcript.transcript.rows
          .filter((row) => row.role === "user")
          .map((row) =>
            row.parts
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("\n")
          )
      ).toEqual(["application first turn", "application continued turn"])
      const latestPage = await app.readSessionTranscript({
        sessionId: "ses_assistant_app_workbench",
        limit: 1
      })
      if (latestPage.kind !== "assistant.session-transcript.found") {
        throw new Error("expected latest transcript page")
      }
      expect(latestPage.transcript.rows.map(conversationRowText)).toEqual([
        "application continued turn",
        "Fake response from assistant-test-model"
      ])
      expect(latestPage.transcript.page).toMatchObject({
        limit: 1,
        hasMore: true,
        nextCursor: expect.any(String)
      })
      const cursor = latestPage.transcript.page.nextCursor
      if (cursor === undefined) throw new Error("expected transcript cursor")
      const earlierPage = await app.readSessionTranscript({
        sessionId: "ses_assistant_app_workbench",
        cursor,
        limit: 1
      })
      if (earlierPage.kind !== "assistant.session-transcript.found") {
        throw new Error("expected earlier transcript page")
      }
      expect(earlierPage.transcript.rows.map(conversationRowText)).toEqual([
        "application first turn",
        "Fake response from assistant-test-model"
      ])
      expect(earlierPage.transcript.page.hasMore).toBe(false)
      const decodedCursor = Buffer.from(cursor, "base64url").toString("utf8")
      const tamperedCursor = Buffer.from(
        `${decodedCursor.slice(0, -1)}${decodedCursor.endsWith("0") ? "1" : "0"}`,
        "utf8"
      ).toString("base64url")
      await expect(app.readSessionTranscript({
        sessionId: "ses_assistant_app_workbench",
        cursor: tamperedCursor,
        limit: 1
      })).rejects.toThrow(/cursor/u)
      await expect(app.readSessionTranscript({
        sessionId: "ses_assistant_cursor_other",
        cursor,
        limit: 1
      })).rejects.toThrow(/does not belong to this session/u)
      expect(app.status().state).toEqual(stateBeforeTranscriptRead)
      const refreshed = await app.openWorkbench()
      expect(refreshed).toMatchObject({
        kind: "assistant.workbench.opened",
        workbench: { summary: { inputCount: 2, messageCount: 4 } }
      })
      if (refreshed.kind !== "assistant.workbench.opened") {
        throw new Error("expected opened workbench")
      }
      expect(refreshed.workbench.summary.latestUserText).toBe(
        "application continued turn"
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
        text: "application started turn"
      })
      expect(started).toMatchObject({
        kind: "assistant.conversation-operation.found",
        operation: { state: expect.stringMatching(/queued|running|succeeded/) }
      })
      if (started.kind !== "assistant.conversation-operation.found") {
        throw new Error("expected submitted conversation")
      }
      expect(app.status().state.selection).toEqual({
        kind: "session",
        sessionId: started.operation.sessionId
      })
      await waitForAssistantConversation(app, started.operation.sessionId)

      await app.setMode({ mode: "workbench" })
      const newChat = await app.startNewConversation()
      expect(newChat).toMatchObject({ mode: "chat" })
      expect(newChat).not.toHaveProperty("selection")
      expect(app.status().state.selection).toBeUndefined()
      await expect(
        app.readTrackedConversationOperation({
          sessionId: started.operation.sessionId
        })
      ).resolves.toMatchObject({
        kind: "assistant.conversation-operation.found",
        operation: { sessionId: started.operation.sessionId }
      })

      const continued = await app.submitConversationOperation({
        text: "application continued after start"
      })
      expect(continued).toMatchObject({
        kind: "assistant.conversation-operation.found"
      })
      if (continued.kind !== "assistant.conversation-operation.found") {
        throw new Error("expected a new conversation operation")
      }
      expect(continued.operation.sessionId).not.toBe(
        started.operation.sessionId
      )
    } finally {
      await app.dispose()
    }
  })

  it("persists one opaque guided follow-up and promotes it after parent settlement", async () => {
    const storeDir = await createStoreDir()
    const sessionId = "ses_assistant_guided_follow_up"
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    let app: Shell | undefined
    let surface: ReturnType<typeof createSurfaceAdapter> | undefined

    try {
      await storage.createSession({
        id: sessionId,
        title: "guided follow-up",
        kind: "agent"
      })
      const submitted = await storage.submitSessionTurn({
        id: "inp_assistant_guided_parent",
        turnId: "turn_assistant_guided_parent",
        sessionId,
        jobId: "job_assistant_guided_parent",
        principalId: "principal_assistant_guided",
        idempotencyKey: "assistant-guided-parent-input",
        jobIdempotencyKey: "assistant-guided-parent-job",
        content: [
          {
            type: "text",
            id: "assistant_guided_parent_text",
            text: "complete the current task"
          }
        ],
        executionBinding: createTestTurnExecutionBinding(
          assistantTestModelEndpoint({
            endpointId: "assistant-test",
            modelId: "assistant-test-model"
          })
        ),
        maxSteps: 1
      })
      const workerId = "worker_assistant_guided_parent"
      const claimed = await storage.claimJob({
        workerId,
        leaseMs: 60_000,
        kinds: ["session.turn"]
      })
      if (claimed?.leaseToken === undefined) {
        throw new Error("expected guided parent job claim")
      }
      const started = await storage.startSessionTurnAttempt({
        sessionId,
        turnId: submitted.turn.id,
        inputId: submitted.admission.inputId,
        jobId: submitted.job.id,
        workerId,
        leaseToken: claimed.leaseToken
      })
      const currentReference = {
        sessionId,
        inputId: submitted.admission.inputId,
        turnId: submitted.turn.id,
        jobId: submitted.job.id
      }
      const stateStore = createMemoryStateStore({
        ui: {
          selection: { kind: "session", sessionId },
          layout: "single",
          mode: "chat",
          preferences: { theme: "system", density: "comfortable" }
        },
        trackedConversationOperations: {
          [sessionId]: currentReference
        },
        pendingGuidedFollowUps: {},
        conversationAttachmentDrafts: {}
      })
      let rejectPendingSave = true
      const durableStateStore: StateStore = {
        load: () => stateStore.load(),
        async save(snapshot) {
          if (
            rejectPendingSave &&
            Object.keys(snapshot.pendingGuidedFollowUps).length > 0
          ) {
            rejectPendingSave = false
            throw new Error("guided state persistence unavailable")
          }
          await stateStore.save(snapshot)
        }
      }
      app = await createTestApp(storeDir, { stateStore: durableStateStore })
      surface = createSurfaceAdapter(app)
      const client = createSurfaceClient(
        createInProcessSurfaceClientTransport(surface)
      )
      const current = await app.readTrackedConversationOperation({ sessionId })
      if (current.kind !== "assistant.conversation-operation.found") {
        throw new Error("expected tracked guided parent")
      }

      await expect(
        client.queueGuidedFollowUp({
          sessionId,
          operationId: `${current.operation.operationId}_forged`,
          text: "forged follow-up"
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "queueGuidedFollowUp",
        value: {
          kind: "assistant.conversation-operation.rejected",
          reason: "operation_identity_mismatch"
        }
      })

      await expect(
        client.queueGuidedFollowUp({
          sessionId,
          operationId: current.operation.operationId,
          text: "after this, summarize the risks"
        })
      ).resolves.toMatchObject({
        ok: false,
        command: "queueGuidedFollowUp",
        error: {
          code: "command_error",
          category: "runtime"
        }
      })
      expect(
        (await storage.listSessionInputs({ sessionId })).filter(
          (input) => input.intent === "follow_up"
        )
      ).toHaveLength(1)

      const queued = await app.queueGuidedFollowUp({
        sessionId,
        operationId: current.operation.operationId,
        text: "replacement draft must not duplicate admission"
      })
      expect(queued).toMatchObject({
        kind: "assistant.conversation-operation.found",
        operation: {
          operationId: current.operation.operationId,
          state: "running"
        },
        pendingFollowUp: {
          kind: "assistant.conversation-guided-follow-up.pending",
          sessionId,
          state: "queued",
          text: "after this, summarize the risks"
        }
      })
      if (
        queued.kind !== "assistant.conversation-operation.found" ||
        queued.pendingFollowUp === undefined
      ) {
        throw new Error("expected queued guided follow-up")
      }
      const pendingOperationId = queued.pendingFollowUp.operationId
      await expect(
        app.queueGuidedFollowUp({
          sessionId,
          operationId: current.operation.operationId,
          text: "duplicate follow-up"
        })
      ).resolves.toMatchObject({
        kind: "assistant.conversation-operation.rejected",
        reason: "guided_follow_up_pending"
      })
      expect(
        (await storage.listSessionInputs({ sessionId })).filter(
          (input) => input.intent === "follow_up"
        )
      ).toEqual([
        expect.objectContaining({
          runControlPolicy: "queue_after_current",
          expectedTurnId: submitted.turn.id,
          origin: expect.objectContaining({
            kind: "interactive",
            sourceRef: "assistant.guided-follow-up",
            parentRef: submitted.turn.id
          })
        })
      ])
      expect(
        stateStore.snapshot()?.pendingGuidedFollowUps[sessionId]
      ).toMatchObject({
        sessionId,
        turnId: expect.not.stringMatching(submitted.turn.id)
      })

      await surface.dispose()
      surface = undefined
      await app.dispose()
      app = await createTestApp(storeDir, { stateStore: durableStateStore })
      await expect(
        app.readTrackedConversationOperation({ sessionId })
      ).resolves.toMatchObject({
        kind: "assistant.conversation-operation.found",
        operation: { operationId: current.operation.operationId },
        pendingFollowUp: { operationId: pendingOperationId }
      })

      const invocation = await storage.beginProviderInvocation({
        sessionId,
        turnId: submitted.turn.id,
        attemptId: started.attempt.id,
        inputId: submitted.admission.inputId,
        jobId: submitted.job.id,
        workerId,
        leaseToken: claimed.leaseToken,
        step: 1,
        invocationNumber: 1,
        requestDigest: "assistant-guided-parent-provider"
      })
      await storage.settleSessionTurn({
        sessionId,
        turnId: submitted.turn.id,
        attemptId: started.attempt.id,
        inputId: submitted.admission.inputId,
        jobId: submitted.job.id,
        workerId,
        leaseToken: claimed.leaseToken,
        outcome: "succeeded",
        providerInvocationId: invocation.id,
        assistantMessage: [
          {
            type: "text",
            id: "assistant_guided_parent_answer",
            text: "current task complete"
          }
        ]
      })

      const promoted = await app.readTrackedConversationOperation({ sessionId })
      expect(promoted).toMatchObject({
        kind: "assistant.conversation-operation.found",
        operation: {
          operationId: pendingOperationId,
          sessionId
        }
      })
      expect(promoted).not.toHaveProperty("pendingFollowUp")
      expect(stateStore.snapshot()?.pendingGuidedFollowUps).toEqual({})
      expect(
        stateStore.snapshot()?.trackedConversationOperations[sessionId]
      ).toMatchObject({
        sessionId,
        turnId: expect.not.stringMatching(submitted.turn.id)
      })
    } finally {
      await surface?.dispose()
      await app?.dispose()
      await storage.dispose()
    }
  })

  it("admits one opaque current-Turn guidance and reconstructs its durable pending state", async () => {
    const storeDir = await createStoreDir()
    const sessionId = "ses_assistant_steering"
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    let app: Shell | undefined
    let surface: ReturnType<typeof createSurfaceAdapter> | undefined

    try {
      await storage.createSession({
        id: sessionId,
        title: "assistant steering",
        kind: "agent"
      })
      const submitted = await storage.submitSessionTurn({
        id: "inp_assistant_steering",
        turnId: "turn_assistant_steering",
        sessionId,
        jobId: "job_assistant_steering",
        principalId: "principal_assistant_steering",
        idempotencyKey: "assistant-steering-input",
        jobIdempotencyKey: "assistant-steering-job",
        content: [
          {
            type: "text",
            id: "part_assistant_steering_input",
            text: "start the long response"
          }
        ],
        executionBinding: createTestTurnExecutionBinding(
          assistantTestModelEndpoint({
            endpointId: "assistant-test",
            modelId: "assistant-test-model"
          })
        ),
        maxSteps: 2
      })
      const workerId = "worker_assistant_steering"
      const claimed = await storage.claimJob({
        workerId,
        leaseMs: 60_000,
        kinds: ["session.turn"]
      })
      if (claimed?.leaseToken === undefined) {
        throw new Error("expected steering parent job claim")
      }
      const started = await storage.startSessionTurnAttempt({
        sessionId,
        turnId: submitted.turn.id,
        inputId: submitted.admission.inputId,
        jobId: submitted.job.id,
        workerId,
        leaseToken: claimed.leaseToken
      })
      const stateStore = createMemoryStateStore({
        ui: {
          selection: { kind: "session", sessionId },
          layout: "single",
          mode: "chat",
          preferences: { theme: "system", density: "comfortable" }
        },
        trackedConversationOperations: {
          [sessionId]: {
            sessionId,
            inputId: submitted.admission.inputId,
            turnId: submitted.turn.id,
            jobId: submitted.job.id
          }
        },
        pendingGuidedFollowUps: {},
        conversationAttachmentDrafts: {}
      })
      app = await createTestApp(storeDir, { stateStore })
      const current = await app.readTrackedConversationOperation({ sessionId })
      if (current.kind !== "assistant.conversation-operation.found") {
        throw new Error("expected tracked steering parent")
      }
      expect(current.operation).toMatchObject({
        state: "running",
        capabilities: { steerable: true }
      })
      expect(JSON.stringify(current)).not.toContain(started.attempt.id)

      await expect(
        app.steerTrackedConversationOperation({
          sessionId,
          operationId: `${current.operation.operationId}_forged`,
          text: "forged guidance",
          requestId: "surface-steer-forged"
        })
      ).resolves.toMatchObject({
        kind: "assistant.conversation-operation.rejected",
        reason: "operation_identity_mismatch"
      })
      expect(
        await storage.listSessionTurnControls({
          sessionId,
          turnId: submitted.turn.id,
          kind: "steer"
        })
      ).toEqual([])

      surface = createSurfaceAdapter(app)
      const client = createSurfaceClient(
        createInProcessSurfaceClientTransport(surface)
      )
      for (const [field, value] of [
        ["attemptId", started.attempt.id],
        ["controlId", "control_forged"],
        ["idempotencyKey", "renderer-owned"],
        ["principalId", "renderer-owned-principal"]
      ] as const) {
        await expect(
          surface.dispatchSurfaceCommand({
            command: "steerTrackedConversationOperation",
            requestId: `surface-steer-forged-${field}`,
            input: {
              sessionId,
              operationId: current.operation.operationId,
              text: "forged guidance",
              [field]: value
            }
          })
        ).resolves.toMatchObject({
          ok: false,
          error: { code: "validation_error", category: "validation" }
        })
      }
      await expect(
        surface.dispatchSurfaceCommand({
          command: "steerTrackedConversationOperation",
          input: {
            sessionId,
            operationId: current.operation.operationId,
            text: "guidance without request identity"
          }
        })
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "validation_error", category: "validation" }
      })

      const acceptedEnvelope = await client.steerTrackedConversationOperation(
        {
          sessionId,
          operationId: current.operation.operationId,
          text: "focus the answer on failure handling"
        },
        { requestId: "surface-steer-1" }
      )
      if (!acceptedEnvelope.ok) {
        throw new Error("expected Surface steering acceptance")
      }
      const accepted = acceptedEnvelope.value
      expect(accepted).toMatchObject({
        kind: "assistant.conversation-operation.found",
        operation: {
          operationId: current.operation.operationId,
          sessionId,
          state: "running",
          capabilities: { steerable: false },
          steering: {
            truncated: false,
            pending: [
              {
                steeringId: expect.stringMatching(
                  /^assistant_conversation_steering_/
                ),
                text: "focus the answer on failure handling",
                textTruncated: false
              }
            ]
          }
        }
      })
      const serialized = JSON.stringify(accepted)
      expect(serialized).not.toContain(started.attempt.id)
      expect(serialized).not.toContain(submitted.turn.id)
      expect(serialized).not.toContain(submitted.job.id)

      const controls = await storage.listSessionTurnControls({
        sessionId,
        turnId: submitted.turn.id,
        kind: "steer"
      })
      expect(controls).toHaveLength(1)
      const expectedIdempotencyDigest = createHash("sha256")
        .update(
          JSON.stringify([
            "surface-steer-1",
            sessionId,
            submitted.admission.inputId,
            submitted.turn.id,
            submitted.job.id
          ]),
          "utf8"
        )
        .digest("hex")
      expect(controls[0]).toMatchObject({
        attemptId: started.attempt.id,
        principalId: "assistant-user",
        idempotencyKey: `assistant:steer:${expectedIdempotencyDigest}`,
        status: "pending",
        origin: {
          kind: "interactive",
          sourceRef: "assistant.steer",
          metadata: { operationId: current.operation.operationId }
        }
      })
      expect(serialized).not.toContain(controls[0]!.id)

      const replayed = await app.steerTrackedConversationOperation({
        sessionId,
        operationId: current.operation.operationId,
        text: "a transport retry must not replace durable guidance",
        requestId: "surface-steer-1"
      })
      expect(replayed).toMatchObject({
        kind: "assistant.conversation-operation.found",
        operation: {
          steering: {
            pending: [
              { text: "focus the answer on failure handling" }
            ]
          }
        }
      })
      await expect(
        app.steerTrackedConversationOperation({
          sessionId,
          operationId: current.operation.operationId,
          text: "second pending guidance",
          requestId: "surface-steer-2"
        })
      ).resolves.toMatchObject({
        kind: "assistant.conversation-operation.rejected",
        reason: "steering_pending"
      })
      expect(
        await storage.listSessionTurnControls({
          sessionId,
          turnId: submitted.turn.id,
          kind: "steer"
        })
      ).toHaveLength(1)

      await app.dispose()
      app = await createTestApp(storeDir, { stateStore })
      await expect(
        app.readTrackedConversationOperation({ sessionId })
      ).resolves.toMatchObject({
        kind: "assistant.conversation-operation.found",
        operation: {
          operationId: current.operation.operationId,
          state: "running",
          capabilities: { steerable: false },
          steering: {
            pending: [
              { text: "focus the answer on failure handling" }
            ]
          }
        }
      })
    } finally {
      await surface?.dispose()
      await app?.dispose()
      await storage.dispose()
    }
  })

  it("renames, archives, and restores sessions while reconciling selection", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    const sessionId = "ses_assistant_lifecycle"
    try {
      await app.submitConversationOperation({
        sessionId,
        text: "durable lifecycle"
      })
      await waitForAssistantConversation(app, sessionId)
      const initial = await app.readHome()
      const row = initial.assistant.sessions.recent.find(
        (session) => session.sessionId === sessionId
      )
      expect(row).toMatchObject({ status: "active", revision: 1 })
      if (row === undefined) throw new Error("expected active session row")

      const renamed = await app.renameSession({
        sessionId,
        title: "Renamed assistant chat",
        expectedRevision: row.revision
      })
      expect(renamed).toMatchObject({
        title: "Renamed assistant chat",
        revision: 2
      })
      await app.selectSession({ sessionId })
      const archived = await app.archiveSession({
        sessionId,
        expectedRevision: renamed.revision
      })
      expect(archived).toMatchObject({ status: "archived", revision: 3 })
      expect(app.status().state.selection).toBeUndefined()

      const archivedHome = await app.readHome()
      expect(
        archivedHome.assistant.sessions.recent.some(
          (session) => session.sessionId === sessionId
        )
      ).toBe(false)
      expect(archivedHome.assistant.sessions.archived).toContainEqual(
        expect.objectContaining({
          sessionId,
          title: "Renamed assistant chat",
          revision: 3
        })
      )
      await expect(app.selectSession({ sessionId })).rejects.toThrow(
        /session is archived/
      )

      const restored = await app.restoreSession({
        sessionId,
        expectedRevision: archived.revision
      })
      expect(restored).toMatchObject({ status: "active", revision: 4 })
      expect(app.status().state.selection).toBeUndefined()
      const restoredHome = await app.readHome()
      expect(restoredHome.assistant.sessions.recent).toContainEqual(
        expect.objectContaining({ sessionId, revision: 4 })
      )
    } finally {
      await app.dispose()
    }
  })

  it("adapts the assistant command JSON boundary and fails closed without a session", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    try {
      const missing = await app.openWorkbench()
      expect(missing).toEqual({
        kind: "assistant.workbench.no-session",
        message: "select a session before opening the workbench"
      })

      const json = await app.dispatchAssistantCommandJson(
        JSON.stringify({ command: "status" })
      )
      expect(json.status).toBe("success")
      expect(json.envelope.ok).toBe(true)

      const unknown = await app.dispatchAssistantCommandJson(
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
    await seedSession(storeDir, "ses_assistant_app_surface")
    const app = await createTestApp(storeDir)
    try {
      const surface = createSurfaceAdapter(app, { now: () => 10_001 })
      const descriptor = surface.descriptor()

      expect(descriptor).toMatchObject({
        kind: "assistant.surface-descriptor",
        transport: "app-owned-ipc-or-api",
        rendererBoundary: {
          rendererMayOpenStorage: false,
          rendererMayReceiveStorePath: false,
          rendererMayReceiveServiceBinaryPath: false
        }
      })
      expect(JSON.stringify(descriptor)).not.toContain("readResourceContent")
      expect(descriptor.commands.map((command) => command.command)).toEqual([
        "status",
        "readHome",
        "readSettings",
        "selectSession",
        "renameSession",
        "archiveSession",
        "restoreSession",
        "startNewConversation",
        "setLayout",
        "setMode",
        "updatePreferences",
        "listModelEndpoints",
        "readAssistantCommands",
        "setActiveModelEndpoint",
        "dispatchAssistantCommand",
        "dispatchAssistantCommandJson",
        "previewAssistantCommandInvocation",
        "executeAssistantCommand",
        "readExecutionReference",
        "listSchedules",
        "readSchedule",
        "createSchedule",
        "replaceSchedule",
        "setScheduleEnabled",
        "removeSchedule",
        "openWorkbench",
        "readSessionTranscript",
        "prepareConversationAttachment",
        "readConversationAttachments",
        "removeConversationAttachment",
        "submitConversationOperation",
        "queueGuidedFollowUp",
        "steerTrackedConversationOperation",
        "startSideQuery",
        "readSideQuery",
        "cancelSideQuery",
        "dismissSideQuery",
        "startPlanGeneration",
        "readPlanGeneration",
        "cancelPlanGeneration",
        "dismissPlanGeneration",
        "selectPlanProposal",
        "clearPlanProposalSelection",
        "readPlanProposal",
        "listPlanProposals",
        "revisePlanProposal",
        "decidePlanProposal",
        "executePlanProposal",
        "readGoal",
        "startGoal",
        "pauseGoal",
        "resumeGoal",
        "cancelGoal",
        "readTrackedConversationOperation",
        "cancelTrackedConversationOperation",
        "regenerateTrackedConversationOperation",
        "resolveTrackedConversationApproval",
        "resolveTrackedConversationRecovery",
        "listTeamConversations",
        "readTeamConversation",
        "selectTeamConversation",
        "createTeamConversation",
        "closeTeamConversation",
        "addTeamParticipant",
        "updateTeamParticipant",
        "setTeamCoordinator",
        "submitTeamRound",
        "readPluginManagement",
        "requestLocalPluginReview",
        "approveLocalPluginReview",
        "cancelLocalPluginReview",
        "setPluginInstallState",
        "retryPluginRefresh"
      ])

      const selected = await surface.dispatchSurfaceCommand({
        command: "selectSession",
        requestId: "req_select",
        input: { sessionId: "ses_assistant_app_surface" }
      })
      expect(selected).toMatchObject({
        ok: true,
        command: "selectSession",
        event: {
          type: "assistant.surface.command_completed",
          requestId: "req_select",
          state: {
            selection: {
              kind: "session",
              sessionId: "ses_assistant_app_surface"
            }
          }
        }
      })

      const newConversation = await surface.dispatchSurfaceCommand({
        command: "startNewConversation",
        requestId: "req_new_conversation"
      })
      expect(newConversation).toMatchObject({
        ok: true,
        command: "startNewConversation",
        value: { mode: "chat" },
        event: { type: "assistant.surface.command_completed" }
      })
      if (newConversation.ok) {
        expect(newConversation.value).not.toHaveProperty("selection")
      }
      expect(surface.readSurfaceEvents().events).toEqual([
        expect.objectContaining({
          type: "assistant.surface.command_completed",
          command: "selectSession"
        }),
        expect.objectContaining({
          type: "assistant.surface.state_changed",
          command: "selectSession",
          state: expect.objectContaining({
            selection: {
              kind: "session",
              sessionId: "ses_assistant_app_surface"
            }
          })
        }),
        expect.objectContaining({
          type: "assistant.surface.command_completed",
          command: "startNewConversation"
        }),
        expect.objectContaining({
          type: "assistant.surface.state_changed",
          command: "startNewConversation",
          state: expect.not.objectContaining({
            selection: expect.anything()
          })
        })
      ])

      const commandCatalog = await surface.dispatchSurfaceCommand({
        command: "readAssistantCommands",
        requestId: "req_assistant_commands"
      })
      expect(commandCatalog).toMatchObject({
        ok: true,
        command: "readAssistantCommands",
        value: {
          commands: expect.arrayContaining([
            expect.objectContaining({
              id: "assistant.agent.submit"
            })
          ]),
          diagnostics: []
        },
        event: {
          type: "assistant.surface.command_completed",
          requestId: "req_assistant_commands"
        }
      })
      const typedExecution = await surface.dispatchSurfaceCommand({
        command: "executeAssistantCommand",
        requestId: "req_execute_assistant_status",
        input: {
          commandId: "assistant.status"
        }
      })
      expect(typedExecution).toMatchObject({
        ok: true,
        command: "executeAssistantCommand",
        value: {
          kind: "completed",
          commandId: "assistant.status",
          handlerRef: "wanex.assistant.backend.status"
        },
        event: {
          requestId: "req_execute_assistant_status"
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
      const surface = createSurfaceAdapter(app, { now: () => 10_002 })

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
          kind: "assistant.conversation-operation.found"
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
      const sessionId = (
        started.value as {
          readonly operation: { readonly sessionId: string }
        }
      ).operation.sessionId
      await waitForAssistantConversation(app, sessionId)

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
          kind: "assistant.workbench.opened",
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
          kind: "assistant.conversation-operation.found",
          operation: { sessionId }
        }
      })
      expect(surface.readSurfaceEvents({ limit: 20 }).events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "assistant.surface.command_completed",
            command: "submitConversationOperation"
          }),
          expect.objectContaining({
            type: "assistant.surface.state_changed",
            command: "submitConversationOperation"
          })
        ])
      )
    } finally {
      await app.dispose()
    }
  })

  it("bounds surface replay and reports cursor gaps without silent loss", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    const surface = createSurfaceAdapter(app, {
      now: () => 10_002,
      eventBufferCapacity: 3,
      streamId: "surface_stream_bounded"
    })
    const observed: number[] = []
    surface.subscribeSurfaceEvents(() => {
      throw new Error("isolated surface listener")
    })
    const unsubscribe = surface.subscribeSurfaceEvents((event) => {
      observed.push(event.sequence)
    })

    try {
      for (let index = 0; index < 4; index += 1) {
        await surface.dispatchSurfaceCommand({ command: "status" })
      }

      expect(observed).toEqual([1, 2, 3, 4])
      expect(surface.readSurfaceEvents({ limit: 2 })).toEqual({
        streamId: "surface_stream_bounded",
        earliestSequence: 2,
        latestSequence: 4,
        gap: true,
        hasMore: false,
        events: []
      })
      expect(
        surface.readSurfaceEvents({
          streamId: "surface_stream_bounded",
          afterSequence: 1,
          limit: 2
        })
      ).toMatchObject({
        gap: false,
        hasMore: true,
        events: [{ sequence: 2 }, { sequence: 3 }]
      })
      expect(
        surface.readSurfaceEvents({
          streamId: "surface_stream_bounded",
          afterSequence: 3,
          limit: 3
        })
      ).toMatchObject({
        gap: false,
        hasMore: false,
        events: [{ sequence: 4 }]
      })
      expect(
        surface.readSurfaceEvents({
          streamId: "another_stream",
          afterSequence: 3
        })
      ).toMatchObject({ gap: true, events: [] })
      expect(
        surface.readSurfaceEvents({
          streamId: "surface_stream_bounded",
          afterSequence: 99
        })
      ).toMatchObject({ gap: true, events: [] })

      unsubscribe()
      await surface.dispatchSurfaceCommand({ command: "status" })
      expect(observed).toEqual([1, 2, 3, 4])
    } finally {
      unsubscribe()
      await surface.dispose()
      await app.dispose()
    }
  })

  it("enforces the provider run gate through the surface client boundary", async () => {
    const storeDir = await createStoreDir()
    await seedSession(storeDir, "ses_surface_provider_blocked")
    const app = await createTestApp(storeDir, {
      modelEndpoint: assistantTestModelEndpoint({
        endpointId: "assistant-surface-blocked-provider",
        protocolId: "openai-chat-completions",
        providerId: "openai-compatible",
        modelId: "assistant-surface-blocked-model"
      })
    })
    try {
      const surface = createSurfaceAdapter(app, { now: () => 10_004 })
      const client = createSurfaceClient(
        createInProcessSurfaceClientTransport(surface)
      )

      const started = await client.submitConversationOperation({
        text: "surface should not start without provider setup"
      })
      expect(started).toMatchObject({
        ok: true,
        command: "submitConversationOperation",
        value: {
          kind: "assistant.conversation-operation.rejected",
          reason: "provider_not_ready"
        },
        event: {
          type: "assistant.surface.command_completed",
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
          kind: "assistant.conversation-operation.rejected",
          reason: "provider_not_ready",
          sessionId: "ses_surface_provider_blocked"
        }
      })

      const rawRun = await client.dispatchAssistantCommand({
        command: "submitConversationOperation",
        input: {
          text: "surface raw command should not bypass provider setup"
        }
      })
      expect(rawRun).toMatchObject({
        ok: true,
        command: "dispatchAssistantCommand",
        value: {
          ok: false,
          command: "submitConversationOperation",
          error: {
            code: "provider_not_ready",
            category: "validation"
          }
        }
      })

      const preview = await client.previewAssistantCommandInvocation({
        commandId: "assistant.agent.submit",
        input: {
          text: "surface preview should report provider gate"
        }
      })
      expect(preview).toMatchObject({
        ok: true,
        command: "previewAssistantCommandInvocation",
        value: {
          kind: "rejected",
          reason: "provider_not_ready"
        },
        event: {
          type: "assistant.surface.command_completed",
          command: "previewAssistantCommandInvocation"
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
      const surface = createSurfaceAdapter(app)

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
        command: "executeAssistantCommand",
        input: {}
      })
      expect(invalidExecution).toMatchObject({
        ok: false,
        command: "executeAssistantCommand",
        error: {
          code: "validation_error",
          category: "validation",
          message:
            "executeAssistantCommand input.commandId must be a non-empty string"
        }
      })

      const invalidRecovery = await surface.dispatchSurfaceCommand({
        command: "resolveTrackedConversationRecovery",
        input: {
          recoveryId: "recovery_invalid",
          expectedRecoveryRevision: 0,
          decision: "retry",
          reason: "invalid recovery"
        }
      })
      expect(invalidRecovery).toMatchObject({
        ok: false,
        command: "resolveTrackedConversationRecovery",
        error: {
          code: "validation_error",
          category: "validation",
          message:
            "resolveTrackedConversationRecovery input.expectedRecoveryRevision must be a positive integer"
        }
      })
      const invalidApproval = await surface.dispatchSurfaceCommand({
        command: "resolveTrackedConversationApproval",
        input: {
          approvalId: "approval_invalid",
          expectedApprovalRevision: -1,
          decision: "deny",
          reason: "invalid approval"
        }
      })
      expect(invalidApproval).toMatchObject({
        ok: false,
        command: "resolveTrackedConversationApproval",
        error: {
          code: "validation_error",
          category: "validation",
          message:
            "resolveTrackedConversationApproval input.expectedApprovalRevision must be a non-negative integer"
        }
      })
      const unsupportedRecoveryDecision = await surface.dispatchSurfaceCommand({
        command: "resolveTrackedConversationRecovery",
        input: {
          recoveryId: "recovery_invalid",
          expectedRecoveryRevision: 1,
          decision: "not-supported",
          reason: "invalid recovery"
        }
      })
      expect(unsupportedRecoveryDecision).toMatchObject({
        ok: false,
        command: "resolveTrackedConversationRecovery",
        error: {
          code: "validation_error",
          category: "validation",
          message:
            "resolveTrackedConversationRecovery input.decision is not supported"
        }
      })
      const invalidRecoveryPayload = await surface.dispatchSurfaceCommand({
        command: "resolveTrackedConversationRecovery",
        input: {
          recoveryId: "recovery_invalid",
          expectedRecoveryRevision: 1,
          decision: "retry",
          reason: "invalid recovery payload",
          content: [{ type: "json", value: { unexpected: true } }]
        }
      })
      expect(invalidRecoveryPayload).toMatchObject({
        ok: false,
        command: "resolveTrackedConversationRecovery",
        error: {
          code: "validation_error",
          message:
            "resolveTrackedConversationRecovery input.content and error are not allowed for retry or abandon"
        }
      })

      const serialized = JSON.stringify([
        unknown,
        invalid,
        invalidExecution,
        invalidRecovery,
        unsupportedRecoveryDecision,
        invalidRecoveryPayload
      ])
      expect(serialized).not.toContain(storeDir)
      expect(serialized).not.toContain(serviceBin)
      expect(serialized).not.toContain("Error:")
    } finally {
      await app.dispose()
    }
  })

  it("prepares, removes, and safely projects conversation attachment drafts", async () => {
    const storeDir = await createStoreDir()
    await seedSession(storeDir, "ses_assistant_attachment_draft")
    const app = await createTestApp(storeDir, {
      modelEndpoint: assistantTestModelEndpoint({
        endpointId: "assistant-attachment",
        modelId: "assistant-attachment-model",
        inputModalities: ["text", "image"]
      })
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
        sessionId: "ses_assistant_attachment_draft"
      })
      const duplicate = await app.prepareConversationAttachment({
        resourceId: resource.id,
        sessionId: "ses_assistant_attachment_draft"
      })

      expect(prepared.attachments.attachments).toHaveLength(1)
      expect(duplicate.attachments.attachments).toHaveLength(1)
      expect(prepared.attachment).toMatchObject({
        kind: "assistant.attachment",
        resourceId: resource.id,
        resourceKind: "image",
        previewKind: "image",
        mediaType: "image/png",
        label: "draft.png",
        sizeBytes: 4
      })
      await app.selectSession({ sessionId: "ses_assistant_attachment_draft" })
      await app.startNewConversation()
      expect(app.readConversationAttachments().attachments).toEqual([])
      expect(
        app.readConversationAttachments({
          sessionId: "ses_assistant_attachment_draft"
        }).attachments
      ).toHaveLength(1)
      const serialized = JSON.stringify(prepared)
      expect(serialized).not.toContain("sourceUrl")
      expect(serialized).not.toContain("metadata")
      expect(serialized).not.toContain("absolutePath")
      expect(serialized).not.toContain("secret")
      expect(serialized).not.toContain("logicalPath")
      expect(serialized).not.toContain("content")

      const removed = await app.removeConversationAttachment({
        resourceId: resource.id,
        sessionId: "ses_assistant_attachment_draft"
      })
      expect(removed.removed).toBe(true)
      expect(removed.attachments.attachments).toEqual([])
      const submittedAfterRemove = await app.submitConversationOperation({
        text: "text only after removing the attachment",
        sessionId: "ses_assistant_attachment_draft"
      })
      expect(submittedAfterRemove.kind).toBe(
        "assistant.conversation-operation.found"
      )
    } finally {
      await app.dispose()
    }
  })

  it("submits canonical resource references, clears admitted drafts, and regenerates after restart", async () => {
    const storeDir = await createStoreDir()
    const stateStore = createMemoryStateStore()
    const options = {
      stateStore,
      modelEndpoint: assistantTestModelEndpoint({
        endpointId: "assistant-resource-submit",
        modelId: "assistant-resource-submit-model",
        inputModalities: ["text", "image"]
      })
    }
    const first = await createTestApp(storeDir, options)
    let sessionId = ""
    let durableTranscript: unknown
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
      expect(submitted.kind).toBe("assistant.conversation-operation.found")
      if (submitted.kind !== "assistant.conversation-operation.found") return
      sessionId = submitted.operation.sessionId
      expect(first.readConversationAttachments().attachments).toEqual([])
      await waitForAssistantConversation(first, sessionId)
      durableTranscript = await first.readSessionTranscript({ sessionId })
    } finally {
      await first.dispose()
    }

    const restarted = await createTestApp(storeDir, options)
    try {
      await expect(
        restarted.readSessionTranscript({ sessionId })
      ).resolves.toEqual(durableTranscript)
      const regenerated =
        await restarted.regenerateTrackedConversationOperation({
          sessionId
        })
      expect(regenerated.kind).toBe("assistant.conversation-operation.found")
      expect(
        restarted.readConversationAttachments({ sessionId }).attachments
      ).toEqual([])
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
      const result = await app.submitConversationOperation({
        text: "unsupported"
      })
      expect(result).toMatchObject({
        kind: "assistant.conversation-operation.rejected",
        reason: "unsupported_attachment"
      })
      expect(app.readConversationAttachments().attachments).toHaveLength(1)
    } finally {
      await app.dispose()
    }
  })

  it("reviews Assistant recovery with opaque identities and disables retry for non-idempotent tools", async () => {
    const storeDir = await createStoreDir()
    const secretRef = "env://WANEX_ASSISTANT_RECOVERY_KEY"
    const secretValue = "wanex-assistant-recovery-secret"
    let providerCalls = 0
    let toolCalls = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      providerCalls += 1
      return providerCalls === 1
        ? openAIToolCallResponse(
            "ambiguous_assistant_remote",
            "call_assistant_recovery",
            { remoteSecret: "assistant-input-must-not-escape" }
          )
        : openAIResponse("assistant recovery completed")
    }) as unknown as typeof globalThis.fetch
    const tools = new ToolRegistry()
    tools.register({
      name: "ambiguous_assistant_remote",
      description: "Lose the response after a remote operation was dispatched.",
      inputSchema: { type: "object", additionalProperties: true },
      risk: "external",
      idempotent: false,
      concurrency: "exclusive",
      resultMode: "immediate",
      annotations: { title: "Assistant ambiguous remote operation" },
      runtimeBinding: createToolRuntimeBinding({
        implementationId: "wanex.test.assistant.ambiguous-remote",
        implementationRevision: "1"
      }),
      async invoke(invocation) {
        toolCalls += 1
        expect(invocation.input).toEqual({
          remoteSecret: "assistant-input-must-not-escape"
        })
        return {
          outcome: "ambiguous",
          toolCallId: invocation.toolCallId,
          message: "remote assistant response was lost",
          reconciliationRef: "remote-assistant-operation-1"
        }
      }
    } satisfies ToolDefinition)
    const app = await createShell({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: assistantTestModelEndpoint({
        endpointId: "assistant-recovery-provider",
        protocolId: "openai-chat-completions",
        providerId: "openai-compatible",
        modelId: "assistant-recovery-model",
        baseUrl: "https://provider.assistant-recovery.example/v1",
        secretRef
      }),
      secretResolver: new SecretResolver([
        new EnvSecretProvider({ WANEX_ASSISTANT_RECOVERY_KEY: secretValue })
      ]),
      runtimeContext: {
        tools,
        toolPermissionPolicy: new AllowAllToolsPolicy()
      }
    })

    try {
      const submitted = await app.submitConversationOperation({
        text: "review this remote operation",
        sessionId: "ses_assistant_recovery_review"
      })
      expect(submitted.kind).toBe("assistant.conversation-operation.found")
      const recovery = await eventuallyAssistant(async () => {
        const result = await app.readTrackedConversationOperation({
          sessionId: "ses_assistant_recovery_review"
        })
        expect(result).toMatchObject({
          kind: "assistant.conversation-operation.found",
          operation: {
            state: "recovery_required",
            capabilities: {
              terminal: false,
              regeneratable: false,
              cancellable: false
            },
            recovery: {
              items: [
                {
                  tool: {
                    name: "ambiguous_assistant_remote",
                    risk: "external",
                    idempotent: false
                  },
                  availableDecisions: [
                    "confirm_succeeded",
                    "confirm_failed",
                    "abandon_turn"
                  ]
                }
              ]
            }
          }
        })
        return result
      })
      if (
        recovery.kind !== "assistant.conversation-operation.found" ||
        recovery.operation.recovery === undefined
      ) {
        throw new Error("expected Assistant recovery review")
      }
      const item = recovery.operation.recovery.items[0]
      if (item === undefined) throw new Error("expected Assistant recovery item")
      const trusted = createStorageTestStore({
        kind: "local-system-service",
        mode: "oneshot",
        storeDir,
        serviceBin
      })
      let trustedExecutionId: string | undefined
      try {
        const executions = await trusted.listToolExecutions({
          sessionId: "ses_assistant_recovery_review",
          state: "recovery_required"
        })
        trustedExecutionId = executions[0]?.id
      } finally {
        await trusted.dispose()
      }
      expect(trustedExecutionId).toBeDefined()
      expect(item.recoveryId).not.toBe(trustedExecutionId)

      const rendererJson = JSON.stringify(recovery)
      expect(rendererJson).not.toContain(trustedExecutionId!)
      expect(rendererJson).not.toContain("assistant-input-must-not-escape")
      expect(rendererJson).not.toContain("remote-assistant-operation-1")

      const resolved = await app.resolveTrackedConversationRecovery({
        sessionId: "ses_assistant_recovery_review",
        recoveryId: item.recoveryId,
        expectedRecoveryRevision: item.recoveryRevision,
        decision: "confirm_succeeded",
        reason: "verified in the remote operation log",
        content: [{
          type: "json",
          value: { remoteOperationId: "remote-assistant-operation-1" }
        }]
      })
      expect(resolved).toMatchObject({
        kind: "assistant.conversation-recovery.resolved",
        decision: "confirm_succeeded",
        operation: {
          kind: "assistant.conversation-operation.found",
          operation: {
            state: expect.stringMatching(/^(queued|running|succeeded)$/)
          }
        }
      })
      await waitForAssistantConversation(app, "ses_assistant_recovery_review")
      const completed = await app.readTrackedConversationOperation({
        sessionId: "ses_assistant_recovery_review"
      })
      expect(completed).toMatchObject({
        kind: "assistant.conversation-operation.found",
        operation: {
          state: "succeeded",
          capabilities: { terminal: true, regeneratable: true }
        }
      })
      expect(providerCalls).toBe(2)
      expect(toolCalls).toBe(1)
    } finally {
      await app.dispose()
      globalThis.fetch = originalFetch
    }
  })

  it("drives the application surface through the renderer-side client contract", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    try {
      const surface = createSurfaceAdapter(app, { now: () => 10_003 })
      const client = createSurfaceClient(
        createInProcessSurfaceClientTransport(surface)
      )

      const descriptor = await client.descriptor()
      expect(descriptor).toMatchObject({
        ok: true,
        value: {
          kind: "assistant.surface-descriptor",
          commandCount: 73
        }
      })
      const commandCatalog = await client.readAssistantCommands({
        requestId: "req_client_assistant_commands"
      })
      expect(commandCatalog).toMatchObject({
        ok: true,
        command: "readAssistantCommands",
        value: {
          commands: expect.arrayContaining([
            expect.objectContaining({
              id: "assistant.agent.submit",
              title: "Submit Agent Turn"
            })
          ]),
          diagnostics: []
        },
        event: {
          requestId: "req_client_assistant_commands"
        }
      })
      const typedExecution = await client.executeAssistantCommand(
        { commandId: "assistant.status" },
        { requestId: "req_client_execute_assistant_status" }
      )
      expect(typedExecution).toMatchObject({
        ok: true,
        command: "executeAssistantCommand",
        value: {
          kind: "completed",
          commandId: "assistant.status",
          handlerRef: "wanex.assistant.backend.status"
        },
        event: {
          requestId: "req_client_execute_assistant_status"
        }
      })
      await app.modelEndpoints.upsertModelEndpoint({
        modelEndpoint: assistantTestModelEndpoint({
          endpointId: "surface-client-second-provider",
          modelId: "surface-client-second-model"
        })
      })
      const endpoints = await client.listModelEndpoints({
        requestId: "req_client_endpoints"
      })
      expect(endpoints).toMatchObject({
        ok: true,
        command: "listModelEndpoints",
        value: {
          activeEndpointId: "assistant-test",
          endpoints: expect.arrayContaining([
            expect.objectContaining({
              id: "assistant-test",
              active: true,
              credentialConfigured: false
            }),
            expect.objectContaining({
              id: "surface-client-second-provider",
              active: false,
              model: expect.objectContaining({
                id: "surface-client-second-model"
              })
            })
          ])
        },
        event: {
          requestId: "req_client_endpoints"
        }
      })
      const switched = await client.setActiveModelEndpoint(
        {
          endpointId: "surface-client-second-provider"
        },
        {
          requestId: "req_client_switch_provider"
        }
      )
      expect(switched).toMatchObject({
        ok: true,
        command: "setActiveModelEndpoint",
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
          kind: "assistant.settings",
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
          kind: "assistant.conversation-operation.found"
        }
      })
      if (
        !started.ok ||
        started.value.kind !== "assistant.conversation-operation.found"
      ) {
        throw new Error("expected client submitted conversation")
      }
      await waitForAssistantConversation(app, started.value.operation.sessionId)

      const continued = await client.submitConversationOperation(
        {
          text: "surface client continued turn"
        },
        { requestId: "req_client_continue" }
      )
      expect(continued).toMatchObject({
        ok: true,
        value: {
          kind: "assistant.conversation-operation.found",
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
            type: "assistant.surface.command_completed",
            command: "submitConversationOperation"
          }),
          expect.objectContaining({
            type: "assistant.surface.state_changed",
            command: "submitConversationOperation"
          })
        ])
      })
    } finally {
      await app.dispose()
    }
  })

  it("normalizes malformed surface transport responses on the client boundary", async () => {
    const client = createSurfaceClient({
      descriptor: () => ({ broken: true }) as never,
      dispatchSurfaceCommand: () => ({ ok: true, command: "status" }) as never,
      readSurfaceEvents: () => [{ missing: "event fields" }] as never,
      subscribeSurfaceEvents: () => () => {}
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
        type: "assistant.surface.command_rejected",
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

  it("drives the application surface through the message transport contract", async () => {
    const storeDir = await createStoreDir()
    const app = await createTestApp(storeDir)
    try {
      const surface = createSurfaceAdapter(app, { now: () => 10_004 })
      const messages: unknown[] = []
      const client = createSurfaceClient(
        createMessageSurfaceClientTransport({
          async send(request) {
            messages.push(request)
            return await handleSurfaceTransportRequest(
              surface,
              request
            )
          },
          subscribe(listener) {
            return surface.subscribeSurfaceEvents(listener)
          }
        })
      )

      const descriptor = await client.descriptor()
      expect(descriptor).toMatchObject({
        ok: true,
        value: {
          kind: "assistant.surface-descriptor",
          commandCount: 73
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
          kind: "assistant.conversation-operation.found"
        }
      })
      if (
        !started.ok ||
        started.value.kind !== "assistant.conversation-operation.found"
      ) {
        throw new Error("expected message transport submitted conversation")
      }
      await waitForAssistantConversation(app, started.value.operation.sessionId)

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
          kind: "assistant.conversation-operation.found"
        }
      })

      const events = await client.readSurfaceEvents({ limit: 20 })
      expect(events).toMatchObject({
        ok: true,
        events: expect.arrayContaining([
          expect.objectContaining({
            type: "assistant.surface.command_completed",
            command: "submitConversationOperation"
          }),
          expect.objectContaining({
            type: "assistant.surface.state_changed",
            command: "submitConversationOperation"
          })
        ])
      })
      expect(messages).toEqual([
        expect.objectContaining({
          kind: "assistant.surface-transport.request",
          operation: "descriptor"
        }),
        expect.objectContaining({
          kind: "assistant.surface-transport.request",
          operation: "dispatchSurfaceCommand",
          requestId: "req_message_start",
          command: expect.objectContaining({
            command: "submitConversationOperation",
            requestId: "req_message_start"
          })
        }),
        expect.objectContaining({
          kind: "assistant.surface-transport.request",
          operation: "dispatchSurfaceCommand",
          requestId: "req_message_continue",
          command: expect.objectContaining({
            command: "submitConversationOperation",
            requestId: "req_message_continue"
          })
        }),
        expect.objectContaining({
          kind: "assistant.surface-transport.request",
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
    await seedSession(storeDir, "ses_assistant_app_host_endpoint")
    const app = await createTestApp(storeDir)
    try {
      const surface = createSurfaceAdapter(app, { now: () => 10_005 })
      const observed: unknown[] = []
      const endpoint = createSurfaceHostEndpoint({
        surface,
        observeRequest(request) {
          observed.push(request)
        }
      })
      const client = createSurfaceClient(
        createMessageSurfaceClientTransport({
          send: (request) => endpoint.send(request),
          subscribe: (listener) => endpoint.subscribe(listener)
        })
      )

      const descriptor = await client.descriptor()
      const selected = await client.selectSession(
        { sessionId: "ses_assistant_app_host_endpoint" },
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
        ...(events.ok ? { streamId: events.streamId } : {}),
        limit: 5
      })

      expect(descriptor).toMatchObject({
        ok: true,
        value: {
          kind: "assistant.surface-descriptor",
          commandCount: 73
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
          kind: "assistant.home",
          state: {
            selection: {
              kind: "session",
              sessionId: "ses_assistant_app_host_endpoint"
            }
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
            type: "assistant.surface.command_completed",
            command: "selectSession"
          }),
          expect.objectContaining({
            type: "assistant.surface.state_changed",
            command: "selectSession"
          }),
          expect.objectContaining({
            type: "assistant.surface.command_completed",
            command: "readHome"
          })
        ])
      })
      expect(cursorEvents).toMatchObject({
        ok: true,
        events: [
          {
            type: "assistant.surface.command_completed",
            command: "status",
            requestId: "req_host_endpoint_status_after_cursor"
          }
        ]
      })
      expect(observed).toEqual([
        expect.objectContaining({
          kind: "assistant.surface-transport.request",
          operation: "descriptor"
        }),
        expect.objectContaining({
          kind: "assistant.surface-transport.request",
          operation: "dispatchSurfaceCommand",
          requestId: "req_host_endpoint_select",
          command: expect.objectContaining({
            command: "selectSession",
            requestId: "req_host_endpoint_select"
          })
        }),
        expect.objectContaining({
          kind: "assistant.surface-transport.request",
          operation: "dispatchSurfaceCommand",
          command: expect.objectContaining({
            command: "readHome"
          })
        }),
        expect.objectContaining({
          kind: "assistant.surface-transport.request",
          operation: "readSurfaceEvents"
        }),
        expect.objectContaining({
          kind: "assistant.surface-transport.request",
          operation: "dispatchSurfaceCommand",
          requestId: "req_host_endpoint_status_after_cursor",
          command: expect.objectContaining({
            command: "status",
            requestId: "req_host_endpoint_status_after_cursor"
          })
        }),
        expect.objectContaining({
          kind: "assistant.surface-transport.request",
          operation: "readSurfaceEvents",
          input: {
            afterSequence: lastSequence,
            streamId: events.ok ? events.streamId : "",
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
      const surface = createSurfaceAdapter(app)
      const endpoint = createSurfaceHostEndpoint({
        surface,
        observeRequest() {
          throw new Error(`host-only failure ${storeDir} ${serviceBin}`)
        }
      })

      const response = await endpoint.send({
        kind: "assistant.surface-transport.request",
        operation: "dispatchSurfaceCommand",
        requestId: "req_host_endpoint_failure",
        command: {
          command: "status",
          requestId: "req_host_endpoint_failure"
        }
      })

      expect(response).toEqual({
        ok: false,
        kind: "assistant.surface-transport.response",
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
      const surface = createSurfaceAdapter(app)

      const malformed = await handleSurfaceTransportRequest(
        surface,
        "bad-request"
      )
      expect(malformed).toEqual({
        ok: false,
        kind: "assistant.surface-transport.response",
        operation: "unknown",
        error: {
          code: "validation_error",
          category: "validation",
          message: "request must be an object"
        }
      })

      const unsupported = await handleSurfaceTransportRequest(
        surface,
        {
          kind: "assistant.surface-transport.request",
          operation: "restartGateway",
          requestId: "req_unsupported"
        }
      )
      expect(unsupported).toEqual({
        ok: false,
        kind: "assistant.surface-transport.response",
        operation: "unknown",
        requestId: "req_unsupported",
        error: {
          code: "validation_error",
          category: "validation",
          message:
            "unsupported surface transport operation: restartGateway"
        }
      })

      const invalidCommand = await handleSurfaceTransportRequest(
        surface,
        {
          kind: "assistant.surface-transport.request",
          operation: "dispatchSurfaceCommand",
          requestId: "req_bad_command"
        }
      )
      expect(invalidCommand).toEqual({
        ok: false,
        kind: "assistant.surface-transport.response",
        operation: "dispatchSurfaceCommand",
        requestId: "req_bad_command",
        error: {
          code: "validation_error",
          category: "validation",
          message: "dispatchSurfaceCommand request.command must be an object"
        }
      })

      const invalidCursor = await handleSurfaceTransportRequest(
        surface,
        {
          kind: "assistant.surface-transport.request",
          operation: "readSurfaceEvents",
          requestId: "req_bad_cursor",
          input: {
            afterSequence: -1
          }
        }
      )
      expect(invalidCursor).toEqual({
        ok: false,
        kind: "assistant.surface-transport.response",
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
    const malformedClient = createSurfaceClient(
      createMessageSurfaceClientTransport({
        send: async () =>
          ({
            ok: true,
            kind: "assistant.surface-transport.response",
            operation: "dispatchSurfaceCommand",
            value: { broken: true }
          }) as never,
        subscribe: () => () => {}
      })
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
        type: "assistant.surface.command_rejected",
        command: "status",
        requestId: "req_message_bad"
      }
    })

    const rejectedClient = createSurfaceClient(
      createMessageSurfaceClientTransport({
        send: async (request) => ({
          ok: false,
          kind: "assistant.surface-transport.response",
          operation: request.operation,
          error: {
            code: "validation_error",
            category: "validation",
            message: "blocked by test transport"
          }
        }),
        subscribe: () => () => {}
      })
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

async function waitForAssistantConversation(
  app: Shell,
  sessionId: string
): Promise<void> {
  let retryDelayMs = 25
  for (;;) {
    const result = await app.readTrackedConversationOperation({ sessionId })
    if (
      result.kind === "assistant.conversation-operation.found" &&
      result.operation.capabilities.terminal
    ) {
      return
    }
    const status = app.status()
    if (status.disposed || !status.assistant.started) {
      throw new Error(
        `conversation operation processor stopped before settlement: ${sessionId}`
      )
    }
    await delay(retryDelayMs)
    retryDelayMs = Math.min(retryDelayMs * 2, 500)
  }
}

function conversationRowText(row: ConversationHistoryRow): string {
  return row.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

async function createStoreDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-assistant-test-"))
  tempDirs.push(dir)
  return dir
}

async function eventuallyAssistant<T>(run: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      await delay(10)
    }
  }
  throw lastError
}

function openAIResponse(text: string) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: (async function* () {
      yield `data: ${JSON.stringify({
        choices: [{ delta: { content: text }, finish_reason: "stop" }]
      })}\n\n`
      yield "data: [DONE]\n\n"
    })(),
    async text() {
      return ""
    }
  }
}

function openAIToolCallResponse(
  toolName: string,
  toolCallId: string,
  input: Record<string, unknown>
) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: (async function* () {
      yield `data: ${JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: toolCallId,
                  function: {
                    name: toolName,
                    arguments: JSON.stringify(input)
                  }
                }
              ]
            },
            finish_reason: "tool_calls"
          }
        ]
      })}\n\n`
      yield "data: [DONE]\n\n"
    })(),
    async text() {
      return ""
    }
  }
}

async function seedSession(storeDir: string, sessionId: string): Promise<void> {
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "oneshot",
    storeDir,
    serviceBin
  })
  try {
    await storage.createSession({
      id: sessionId,
      title: sessionId,
      kind: "agent"
    })
  } finally {
    await storage.dispose()
  }
}

async function createTestApp(
  storeDir: string,
  options: Partial<Parameters<typeof createShell>[0]> = {}
): Promise<Shell> {
  return await createShell({
    storage: {
      kind: "local-system-service",
      storeDir
    },
    artifacts: {
      explicitPath: serviceBin
    },
    modelEndpoint: assistantTestModelEndpoint({
      endpointId: "assistant-test",
      modelId: "assistant-test-model"
    }),
    ...options
  })
}
