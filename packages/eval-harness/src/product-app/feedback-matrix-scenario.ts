import {
  createProductAppShell,
  createProductAppSurfaceAdapter
} from "@wanex/product-app"
import {
  createInProcessProductAppSurfaceClientTransport,
  createProductAppSurfaceClient
} from "@wanex/product-app/surface-client"
import {
  createProductAppLocalProviderSetupCommands
} from "@wanex/product-app-local"
import {
  createProductAppWebController,
  handleProductAppWebRequest,
  type ProductAppWebSubmitActionInputResponse
} from "@wanex/product-app-web"
import {
  createProductAppWebHostSurfaceClient
} from "@wanex/product-app-web/host"
import {
  createProductAppTuiSurface,
  runProductAppTuiLineSession
} from "@wanex/product-app-tui"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import { lines } from "../product-app-tui/helpers.js"
import {
  createConversationSettlementFixture
} from "./conversation-helpers.js"

const BLOCKED_PROFILE_ID = "eval-feedback-missing-key"
const READY_PROFILE_ID = "eval-feedback-ready"
const READY_SECRET_REF = "env://EVAL_FEEDBACK_SECRET"

export const productAppFeedbackMatrixScenario = createEvalScenario({
  id: "product.app-feedback-matrix-contract",
  title: "Product App feedback matrix aligns Web and TUI blocked/succeeded outcomes",
  tags: [
    "product-app",
    "product-app-web",
    "product-app-tui",
    "feedback",
    "upper-app",
    "product-path"
  ],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-product-app-feedback-"
    })
    const storeDir = storage.storeDir
    const app = await createProductAppShell({
      storage: storage.storage,
      providerProfile: {
        id: BLOCKED_PROFILE_ID,
        kind: "openai-compatible",
        capabilities: { input: ["text"], output: ["text"] },
        providerId: "openai-compatible",
        modelId: "eval-feedback-blocked-model",
        baseUrl: "https://provider.example.test/v1"
      }
    })
    const productSurface = createProductAppSurfaceAdapter(app)
    const webClient = createProductAppWebHostSurfaceClient({
      surface: productSurface
    })
    const tuiClient = createProductAppSurfaceClient(
      createInProcessProductAppSurfaceClientTransport(productSurface)
    )

    try {
      const providerSetup = createProductAppLocalProviderSetupCommands(app)
      const web = await createProductAppWebController({
        client: webClient,
        now: () => 19_001
      })
      const tui = await createProductAppTuiSurface({
        client: tuiClient,
        now: () => 19_002
      })
      const webMode = expectSubmitResponse(
        await handleProductAppWebRequest(web, webSetModeRequest({
          requestId: "eval_feedback_web_mode"
        }))
      )

      const blockedWeb = expectSubmitResponse(
        await handleProductAppWebRequest(web, webSubmitConversationRequest({
          requestId: "eval_feedback_web_blocked",
          text: "web should report blocked provider"
        }))
      )
      const blockedWebPreview = expectSubmitResponse(
        await handleProductAppWebRequest(web, webPreviewCommandRequest({
          requestId: "eval_feedback_web_preview_blocked",
          text: "web preview should report blocked provider"
        }))
      )
      const blockedWebExecution = expectSubmitResponse(
        await handleProductAppWebRequest(web, webExecuteCommandRequest({
          requestId: "eval_feedback_web_execute_blocked",
          text: "web execution should report blocked provider"
        }))
      )
      const blockedTuiChunks: string[] = []
      const blockedTui = await runProductAppTuiLineSession({
        surface: tui,
        input: lines([
          "ask tui should report blocked provider",
          "preview product.agent.submit {\"text\":\"tui preview should report blocked provider\"}",
          "execute product.agent.submit {\"text\":\"tui execution should report blocked provider\"}",
          "quit"
        ]),
        write(chunk) {
          blockedTuiChunks.push(chunk)
        }
      })
      const blockedTuiOutput = blockedTuiChunks.join("")

      const trustedSetup = await providerSetup.configureProviderProfile({
        id: READY_PROFILE_ID,
        kind: "fake",
        capabilities: { input: ["text"], output: ["text"] },
        providerId: "fake",
        modelId: "eval-feedback-ready-model",
        secretRef: READY_SECRET_REF,
        makeActive: true
      })

      const readyDocument = await web.refresh()
      await tui.refresh()

      const readyWebSettlement = storage.settlements.waitForNext()
      const readyWeb = expectSubmitResponse(
        await handleProductAppWebRequest(web, webSubmitConversationRequest({
          requestId: "eval_feedback_web_ready",
          text: "web should report succeeded provider"
        }))
      )
      assert(
        readyWeb.submitResult.ok,
        "ready Web conversation should be admitted before settlement"
      )
      await readyWebSettlement
      const readyWebSessionId = readyWeb.document.snapshot.conversation.sessionId
      assert(
        typeof readyWebSessionId === "string",
        "ready Web submit should select a conversation session"
      )
      const settledReadyWeb = (await web.pollEvents({ limit: 20 })).snapshot
      const readyWebPreview = expectSubmitResponse(
        await handleProductAppWebRequest(web, webPreviewCommandRequest({
          requestId: "eval_feedback_web_preview_ready",
          text: "web preview should report runnable provider"
        }))
      )
      const readyWebExecutionSettlement = storage.settlements.waitForNext()
      const readyWebExecution = expectSubmitResponse(
        await handleProductAppWebRequest(web, webExecuteCommandRequest({
          requestId: "eval_feedback_web_execute_ready",
          text: "web execution should complete after setup"
        }))
      )
      assert(
        readyWebExecution.submitResult.ok,
        "ready Web command execution should be admitted before settlement"
      )
      await readyWebExecutionSettlement
      await tui.refresh()
      const readyTuiChunks: string[] = []
      const readyTuiSettlement = storage.settlements.waitForNext()
      const readyTui = await runProductAppTuiLineSession({
        surface: tui,
        input: lines([
          "ask tui should complete after setup",
          "preview product.agent.submit {\"text\":\"tui preview should report runnable provider\"}",
          "execute product.status",
          "quit"
        ]),
        write(chunk) {
          readyTuiChunks.push(chunk)
        }
      })
      assert(
        readyTui.blockedCommandCount === 0,
        "ready TUI conversation should be admitted before settlement"
      )
      await readyTuiSettlement
      assert(
        typeof readyTui.activeSessionId === "string",
        "ready TUI submit should select a conversation session"
      )
      const settledTuiChunks: string[] = []
      await runProductAppTuiLineSession({
        surface: tui,
        input: lines(["operation", "quit"]),
        write(chunk) {
          settledTuiChunks.push(chunk)
        }
      })
      const readyTuiOutput = `${readyTuiChunks.join("")}\n${settledTuiChunks.join("")}`

      const rendererSerialized = JSON.stringify([
        blockedWeb,
        blockedWebPreview,
        blockedWebExecution,
        blockedTuiOutput,
        readyDocument,
        readyWeb,
        readyWebPreview,
        readyWebExecution,
        readyTuiOutput
      ])
      const trustedSerialized = JSON.stringify(trustedSetup)

      assert(
        webMode.submitResult.ok &&
          webMode.document.snapshot.view.mode === "workbench",
        "Web feedback matrix should explicitly enter workbench mode"
      )
      assert(
        blockedWeb.submitResult.ok &&
          blockedWeb.document.snapshot.view.providerRunGate.state === "blocked" &&
          blockedWeb.document.snapshot.view.providerRunGate.canSubmitConversation === false &&
          blockedWeb.document.snapshot.view.operationStatus.state === "blocked" &&
          blockedWeb.document.snapshot.view.operationStatus.action ===
            "submit-conversation" &&
          blockedWeb.document.snapshot.conversation.state === "rejected" &&
          blockedWeb.document.html.includes('data-operation-state="blocked"'),
        "Web should report blocked provider execution as operationStatus=blocked"
      )
      assert(
        blockedWebPreview.submitResult.ok &&
          blockedWebPreview.document.snapshot.view.commandPreview.state ===
            "rejected" &&
          blockedWebPreview.document.snapshot.view.commandPreview.reason ===
            "provider_not_ready" &&
          blockedWebPreview.document.snapshot.view.operationStatus.state ===
            "blocked" &&
          blockedWebPreview.document.html.includes(
            'data-command-preview-state="rejected"'
          ),
        "Web should report blocked provider preview as commandPreview=rejected"
      )
      assert(
        blockedWebExecution.submitResult.ok &&
          blockedWebExecution.document.snapshot.view.commandExecution.state ===
            "rejected" &&
          blockedWebExecution.document.snapshot.view.commandExecution.reason ===
            "provider_not_ready" &&
          blockedWebExecution.document.snapshot.view.operationStatus.state ===
            "blocked",
        "Web should report blocked typed command execution"
      )
      assert(
        blockedTui.blockedCommandCount === 2 &&
          blockedTui.previewCommandCount === 1 &&
          blockedTui.executeCommandCount === 1 &&
          blockedTui.errorCount === 0 &&
          blockedTuiOutput.includes("state:rejected") &&
          blockedTuiOutput.includes("reason:provider_not_ready"),
        "TUI should report blocked provider execution and preview as blocked outcomes"
      )
      assert(
        trustedSetup.kind === "product-app-local.provider-setup.configured" &&
          trustedSetup.profile.id === READY_PROFILE_ID &&
          trustedSetup.profile.active === true &&
          trustedSetup.profile.credentialConfigured === true &&
          trustedSetup.readiness.status === "ready" &&
          trustedSetup.readiness.activeProfileId === READY_PROFILE_ID,
        "trusted provider setup should activate a redacted ready provider"
      )
      assert(
        readyDocument.snapshot.view.providerRunGate.state === "ready" &&
          readyDocument.snapshot.view.providerRunGate.canSubmitConversation === true &&
          readyDocument.snapshot.view.providerRunGate.activeProfileId ===
            READY_PROFILE_ID,
        "Web refresh should observe trusted provider setup readiness"
      )
      assert(
        readyWeb.submitResult.ok &&
          readyWeb.document.snapshot.view.operationStatus.state === "succeeded" &&
          readyWeb.document.snapshot.view.operationStatus.action ===
            "submit-conversation" &&
          settledReadyWeb.conversation.state === "succeeded" &&
          readyWeb.document.html.includes('data-operation-state="succeeded"'),
        "Web should submit immediately and reconcile durable conversation success"
      )
      assert(
        readyWebPreview.submitResult.ok &&
          readyWebPreview.document.snapshot.view.commandPreview.state ===
            "runnable" &&
          readyWebPreview.document.snapshot.view.commandPreview.commandId ===
            "product.agent.submit" &&
          readyWebPreview.document.html.includes(
            'data-command-preview-state="runnable"'
          ),
        "Web should report runnable command preview after trusted setup"
      )
      assert(
        readyWebExecution.submitResult.ok &&
          readyWebExecution.document.snapshot.view.commandExecution.state ===
            "completed" &&
          readyWebExecution.document.snapshot.view.commandExecution.commandId ===
            "product.agent.submit" &&
          readyWebExecution.document.snapshot.view.operationStatus.state ===
            "succeeded",
        "Web should report completed typed command execution after setup"
      )
      assert(
        readyTui.blockedCommandCount === 0 &&
          readyTui.previewCommandCount === 1 &&
          readyTui.executeCommandCount === 1 &&
          readyTui.errorCount === 0 &&
          typeof readyTui.activeSessionId === "string" &&
          readyTuiOutput.includes("Wanex Product App Conversation") &&
          readyTuiOutput.includes("state:succeeded") &&
          readyTuiOutput.includes("status:runnable"),
        "TUI should complete ask and report runnable preview after trusted setup"
      )
      assert(
        !rendererSerialized.includes(READY_SECRET_REF) &&
          !rendererSerialized.includes(storeDir) &&
          !rendererSerialized.includes(context.serviceBin) &&
          !rendererSerialized.includes("configureProviderProfile") &&
          !rendererSerialized.includes("upsertProviderProfile") &&
          !rendererSerialized.includes("\"apiKey\":"),
        "renderer-facing feedback should not expose secrets or setup APIs"
      )
      assert(
        !trustedSerialized.includes(READY_SECRET_REF) &&
          !trustedSerialized.includes(storeDir) &&
          !trustedSerialized.includes(context.serviceBin),
        "trusted setup result should redact secrets and local paths"
      )

      return {
        blockedWebOperation: blockedWeb.document.snapshot.view.operationStatus.state,
        blockedWebPreview: blockedWebPreview.document.snapshot.view.commandPreview.state,
        blockedWebExecution:
          blockedWebExecution.document.snapshot.view.commandExecution.state,
        blockedTuiCommands: blockedTui.blockedCommandCount,
        blockedTuiPreviewCommands: blockedTui.previewCommandCount,
        blockedTuiExecuteCommands: blockedTui.executeCommandCount,
        trustedSetupReadiness: trustedSetup.readiness.status,
        readyWebOperation: readyWeb.document.snapshot.view.operationStatus.state,
        readyWebPreview: readyWebPreview.document.snapshot.view.commandPreview.state,
        readyWebExecution:
          readyWebExecution.document.snapshot.view.commandExecution.state,
        readyTuiBlockedCommands: readyTui.blockedCommandCount,
        readyTuiPreviewCommands: readyTui.previewCommandCount,
        readyTuiExecuteCommands: readyTui.executeCommandCount,
        readyTuiActiveSessionId: readyTui.activeSessionId,
        rendererSafe:
          !rendererSerialized.includes(READY_SECRET_REF) &&
          !rendererSerialized.includes("configureProviderProfile") &&
          !rendererSerialized.includes("\"apiKey\":")
      }
    } finally {
      await productSurface.dispose()
      await app.dispose()
      await storage.dispose()
    }
  }
})

function webSubmitConversationRequest(request: {
  readonly requestId: string
  readonly text: string
}) {
  return {
    kind: "product-app-web.request" as const,
    operation: "submitActionInput" as const,
    requestId: request.requestId,
    input: {
      action: "submit-conversation",
      fields: {
        text: request.text
      }
    },
    options: {
      pollAfterAction: false
    }
  }
}

function webSetModeRequest(request: {
  readonly requestId: string
}) {
  return {
    kind: "product-app-web.request" as const,
    operation: "submitActionInput" as const,
    requestId: request.requestId,
    input: {
      action: "set-mode",
      fields: {
        mode: "workbench"
      }
    },
    options: {
      pollAfterAction: false
    }
  }
}

function webPreviewCommandRequest(request: {
  readonly requestId: string
  readonly text: string
}) {
  return {
    kind: "product-app-web.request" as const,
    operation: "submitActionInput" as const,
    requestId: request.requestId,
    input: {
      action: "preview-command",
      fields: {
        commandId: "product.agent.submit",
        inputJson: JSON.stringify({
          text: request.text
        })
      }
    },
    options: {
      pollAfterAction: false
    }
  }
}

function webExecuteCommandRequest(request: {
  readonly requestId: string
  readonly text: string
}) {
  return {
    kind: "product-app-web.request" as const,
    operation: "submitActionInput" as const,
    requestId: request.requestId,
    input: {
      action: "execute-command",
      fields: {
        commandId: "product.agent.submit",
        inputJson: JSON.stringify({ text: request.text })
      }
    },
    options: { pollAfterAction: false }
  }
}

function expectSubmitResponse(
  response: Awaited<ReturnType<typeof handleProductAppWebRequest>>
): ProductAppWebSubmitActionInputResponse {
  if (!response.ok || response.operation !== "submitActionInput") {
    throw new Error("expected Product App Web submitActionInput response")
  }
  return response
}
