import { rm } from "node:fs/promises"
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
import { mktemp } from "../product-bootstrap/helpers.js"
import { lines } from "../product-app-tui/helpers.js"

const BLOCKED_PROFILE_ID = "eval-feedback-missing-key"
const READY_PROFILE_ID = "eval-feedback-ready"
const READY_SECRET = "eval-feedback-secret"

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
    const storeDir = await mktemp("wanex-eval-product-app-feedback-")
    const app = await createProductAppShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: context.serviceBin
      },
      providerProfile: {
        id: BLOCKED_PROFILE_ID,
        kind: "openai-compatible",
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

      const blockedWeb = expectSubmitResponse(
        await handleProductAppWebRequest(web, webStartWorkbenchRequest({
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
          "preview product.agent.run {\"text\":\"tui preview should report blocked provider\"}",
          "execute product.agent.run {\"text\":\"tui execution should report blocked provider\"}",
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
        providerId: "fake",
        modelId: "eval-feedback-ready-model",
        apiKey: READY_SECRET,
        makeActive: true
      })

      const readyDocument = await web.refresh()
      await tui.refresh()

      const readyWeb = expectSubmitResponse(
        await handleProductAppWebRequest(web, webStartWorkbenchRequest({
          requestId: "eval_feedback_web_ready",
          text: "web should report succeeded provider"
        }))
      )
      const readyWebPreview = expectSubmitResponse(
        await handleProductAppWebRequest(web, webPreviewCommandRequest({
          requestId: "eval_feedback_web_preview_ready",
          text: "web preview should report runnable provider"
        }))
      )
      const readyWebExecution = expectSubmitResponse(
        await handleProductAppWebRequest(web, webExecuteCommandRequest({
          requestId: "eval_feedback_web_execute_ready",
          text: "web execution should complete after setup"
        }))
      )
      await tui.refresh()
      const readyTuiChunks: string[] = []
      const readyTui = await runProductAppTuiLineSession({
        surface: tui,
        input: lines([
          "ask tui should complete after setup",
          "preview product.agent.run {\"text\":\"tui preview should report runnable provider\"}",
          "execute product.agent.run {\"text\":\"tui execution should complete after setup\"}",
          "quit"
        ]),
        write(chunk) {
          readyTuiChunks.push(chunk)
        }
      })
      const readyTuiOutput = readyTuiChunks.join("")

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
        blockedWeb.submitResult.ok &&
          blockedWeb.document.snapshot.view.providerRunGate.state === "blocked" &&
          blockedWeb.document.snapshot.view.providerRunGate.canSubmitWorkbench === false &&
          blockedWeb.document.snapshot.view.operationStatus.state === "blocked" &&
          blockedWeb.document.snapshot.view.operationStatus.action ===
            "start-workbench" &&
          blockedWeb.document.snapshot.workbench.state === "failed" &&
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
          blockedTuiOutput.includes("status:blocked") &&
          blockedTuiOutput.includes("code:provider_not_ready") &&
          blockedTuiOutput.includes("reason:provider_not_ready"),
        "TUI should report blocked provider execution and preview as blocked outcomes"
      )
      assert(
        trustedSetup.kind === "product-app-local.provider-setup.configured" &&
          trustedSetup.profile.id === READY_PROFILE_ID &&
          trustedSetup.profile.active === true &&
          trustedSetup.profile.hasApiKey === true &&
          trustedSetup.profile.apiKeyRedacted === "***" &&
          trustedSetup.readiness.status === "ready" &&
          trustedSetup.readiness.activeProfileId === READY_PROFILE_ID,
        "trusted provider setup should activate a redacted ready provider"
      )
      assert(
        readyDocument.snapshot.view.providerRunGate.state === "ready" &&
          readyDocument.snapshot.view.providerRunGate.canSubmitWorkbench === true &&
          readyDocument.snapshot.view.providerRunGate.activeProfileId ===
            READY_PROFILE_ID,
        "Web refresh should observe trusted provider setup readiness"
      )
      assert(
        readyWeb.submitResult.ok &&
          readyWeb.document.snapshot.view.operationStatus.state === "succeeded" &&
          readyWeb.document.snapshot.view.operationStatus.action ===
            "start-workbench" &&
          readyWeb.document.snapshot.workbench.state === "ready" &&
          readyWeb.document.html.includes('data-operation-state="succeeded"'),
        "Web should report a successful workbench start after trusted setup"
      )
      assert(
        readyWebPreview.submitResult.ok &&
          readyWebPreview.document.snapshot.view.commandPreview.state ===
            "runnable" &&
          readyWebPreview.document.snapshot.view.commandPreview.commandId ===
            "product.agent.run" &&
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
            "product.agent.run" &&
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
          readyTuiOutput.includes("Wanex Product App Agent Turn") &&
          readyTuiOutput.includes("Fake response from eval-feedback-ready-model") &&
          readyTuiOutput.includes("status:runnable"),
        "TUI should complete ask and report runnable preview after trusted setup"
      )
      assert(
        !rendererSerialized.includes(READY_SECRET) &&
          !rendererSerialized.includes(storeDir) &&
          !rendererSerialized.includes(context.serviceBin) &&
          !rendererSerialized.includes("configureProviderProfile") &&
          !rendererSerialized.includes("upsertProviderProfile") &&
          !rendererSerialized.includes("\"apiKey\":"),
        "renderer-facing feedback should not expose secrets or setup APIs"
      )
      assert(
        !trustedSerialized.includes(READY_SECRET) &&
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
          !rendererSerialized.includes(READY_SECRET) &&
          !rendererSerialized.includes("configureProviderProfile") &&
          !rendererSerialized.includes("\"apiKey\":")
      }
    } finally {
      await app.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})

function webStartWorkbenchRequest(request: {
  readonly requestId: string
  readonly text: string
}) {
  return {
    kind: "product-app-web.request" as const,
    operation: "submitActionInput" as const,
    requestId: request.requestId,
    input: {
      action: "start-workbench",
      fields: {
        text: request.text
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
        commandId: "product.agent.run",
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
        commandId: "product.agent.run",
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
