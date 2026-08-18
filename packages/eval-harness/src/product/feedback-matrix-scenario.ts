import {
  createShell,
  createSurfaceAdapter
} from "@wanex/product"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient
} from "@wanex/product/surface"
import {
  createController,
  handleRequest,
  type DispatchActionResponse,
  type Snapshot
} from "@wanex/web"
import {
  createHostSurfaceClient
} from "@wanex/web/host"
import {
  createTuiSurface,
  runTuiLineSession
} from "@wanex/tui"
import { createEvalScenario } from "../runner.js"
import {
  assert,
  evalFakeModelEndpoint,
  evalOpenAICompatibleModelEndpoint
} from "../scenario-utils.js"
import { lines } from "../tui/helpers.js"
import {
  createConversationSettlementFixture
} from "./conversation-helpers.js"

const BLOCKED_PROFILE_ID = "eval-feedback-missing-key"
const READY_PROFILE_ID = "eval-feedback-ready"
const READY_SECRET_REF = "env://EVAL_FEEDBACK_SECRET"

export const feedbackMatrixScenario = createEvalScenario({
  id: "product.app-feedback-matrix-contract",
  title: "product feedback matrix aligns Web and TUI blocked/succeeded outcomes",
  tags: [
    "product",
    "web",
    "tui",
    "feedback",
    "upper-app",
    "product-path"
  ],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-product-feedback-"
    })
    const storeDir = storage.storeDir
    const app = await createShell({
      storage: storage.storage,
      modelEndpoint: evalOpenAICompatibleModelEndpoint({
        id: BLOCKED_PROFILE_ID,
        modelId: "eval-feedback-blocked-model",
        baseUrl: "https://provider.example.test/v1"
      })
    })
    const productSurface = createSurfaceAdapter(app)
    const webClient = createHostSurfaceClient({
      surface: productSurface
    })
    const tuiClient = createSurfaceClient(
      createInProcessSurfaceClientTransport(productSurface)
    )

    try {
      const web = await createController({
        client: webClient,
        now: () => 19_001
      })
      const tui = await createTuiSurface({
        client: tuiClient,
        now: () => 19_002
      })
      const webMode = expectSubmitResponse(
        await handleRequest(web, webSetModeRequest({
          requestId: "eval_feedback_web_mode"
        }))
      )

      const blockedWeb = expectSubmitResponse(
        await handleRequest(web, webSubmitConversationRequest({
          requestId: "eval_feedback_web_blocked",
          text: "web should report blocked provider"
        }))
      )
      const blockedWebPreview = expectSubmitResponse(
        await handleRequest(web, webPreviewCommandRequest({
          requestId: "eval_feedback_web_preview_blocked",
          text: "web preview should report blocked provider"
        }))
      )
      const blockedWebExecution = expectSubmitResponse(
        await handleRequest(web, webExecuteCommandRequest({
          requestId: "eval_feedback_web_execute_blocked",
          text: "web execution should report blocked provider"
        }))
      )
      const blockedTuiChunks: string[] = []
      const blockedTui = await runTuiLineSession({
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

      const trustedEndpoint = await app.modelEndpoints.upsertModelEndpoint({
        modelEndpoint: evalFakeModelEndpoint(
          READY_PROFILE_ID,
          "eval-feedback-ready-model",
          "fake",
          { secretRef: READY_SECRET_REF }
        ),
        makeActive: true
      })
      const trustedReadiness = (await app.readHome()).providerReadiness

      const readyDocument = await web.refresh()
      await tui.refresh()

      const readyWebSettlement = storage.settlements.waitForNext()
      const readyWeb = expectSubmitResponse(
        await handleRequest(web, webSubmitConversationRequest({
          requestId: "eval_feedback_web_ready",
          text: "web should report succeeded provider"
        }))
      )
      assert(
        readyWeb.actionResult.ok,
        "ready Web conversation should be admitted before settlement"
      )
      await readyWebSettlement
      const readyWebSessionId = submitSnapshot(readyWeb).conversation.sessionId
      assert(
        typeof readyWebSessionId === "string",
        "ready Web submit should select a conversation session"
      )
      const settledReadyWeb = await web.reconcileEvents({ limit: 20 })
      const readyWebPreview = expectSubmitResponse(
        await handleRequest(web, webPreviewCommandRequest({
          requestId: "eval_feedback_web_preview_ready",
          text: "web preview should report runnable provider"
        }))
      )
      const readyWebExecutionSettlement = storage.settlements.waitForNext()
      const readyWebExecution = expectSubmitResponse(
        await handleRequest(web, webExecuteCommandRequest({
          requestId: "eval_feedback_web_execute_ready",
          text: "web execution should complete after setup"
        }))
      )
      assert(
        readyWebExecution.actionResult.ok,
        "ready Web command execution should be admitted before settlement"
      )
      await readyWebExecutionSettlement
      await tui.refresh()
      const readyTuiChunks: string[] = []
      const readyTuiSettlement = storage.settlements.waitForNext()
      const readyTui = await runTuiLineSession({
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
      await runTuiLineSession({
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
      const trustedSerialized = JSON.stringify({
        endpoint: trustedEndpoint,
        readiness: trustedReadiness
      })

      assert(
        webMode.actionResult.ok &&
          submitSnapshot(webMode).view.mode === "workbench",
        "Web feedback matrix should explicitly enter workbench mode"
      )
      assert(
        !blockedWeb.actionResult.ok &&
          submitSnapshot(blockedWeb).view.providerRunGate.state === "blocked" &&
          submitSnapshot(blockedWeb).view.providerRunGate.canSubmitConversation === false &&
          submitSnapshot(blockedWeb).view.operationStatus.state === "blocked" &&
          submitSnapshot(blockedWeb).view.operationStatus.action ===
            "submit-conversation" &&
          submitSnapshot(blockedWeb).conversation.state === "rejected",
        "Web should report blocked provider execution as operationStatus=blocked"
      )
      assert(
        !blockedWebPreview.actionResult.ok &&
          submitSnapshot(blockedWebPreview).view.commandPreview.state ===
            "rejected" &&
          submitSnapshot(blockedWebPreview).view.commandPreview.reason ===
            "provider_not_ready" &&
          submitSnapshot(blockedWebPreview).view.operationStatus.state ===
            "blocked",
        "Web should report blocked provider preview as commandPreview=rejected"
      )
      assert(
        !blockedWebExecution.actionResult.ok &&
          submitSnapshot(blockedWebExecution).view.commandExecution.state ===
            "rejected" &&
          submitSnapshot(blockedWebExecution).view.commandExecution.reason ===
            "provider_not_ready" &&
          submitSnapshot(blockedWebExecution).view.operationStatus.state ===
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
        trustedEndpoint.id === READY_PROFILE_ID &&
          trustedEndpoint.active === true &&
          trustedEndpoint.credentialConfigured === true &&
          trustedReadiness.status === "ready" &&
          trustedReadiness.activeEndpointId === READY_PROFILE_ID,
        "trusted provider setup should activate a redacted ready provider"
      )
      assert(
        readyDocument.view.providerRunGate.state === "ready" &&
          readyDocument.view.providerRunGate.canSubmitConversation === true &&
          readyDocument.view.providerRunGate.activeEndpointId ===
            READY_PROFILE_ID,
        "Web refresh should observe trusted provider setup readiness"
      )
      assert(
        readyWeb.actionResult.ok &&
          submitSnapshot(readyWeb).view.operationStatus.state === "succeeded" &&
          submitSnapshot(readyWeb).view.operationStatus.action ===
            "submit-conversation" &&
          settledReadyWeb.conversation.state === "succeeded",
        "Web should submit immediately and reconcile durable conversation success"
      )
      assert(
        readyWebPreview.actionResult.ok &&
          submitSnapshot(readyWebPreview).view.commandPreview.state ===
            "runnable" &&
          submitSnapshot(readyWebPreview).view.commandPreview.commandId ===
            "product.agent.submit",
        "Web should report runnable command preview after trusted setup"
      )
      assert(
        readyWebExecution.actionResult.ok &&
          submitSnapshot(readyWebExecution).view.commandExecution.state ===
            "completed" &&
          submitSnapshot(readyWebExecution).view.commandExecution.commandId ===
            "product.agent.submit" &&
          submitSnapshot(readyWebExecution).view.operationStatus.state ===
            "succeeded",
        "Web should report completed typed command execution after setup"
      )
      assert(
        readyTui.blockedCommandCount === 0 &&
          readyTui.previewCommandCount === 1 &&
          readyTui.executeCommandCount === 1 &&
          readyTui.errorCount === 0 &&
          typeof readyTui.activeSessionId === "string" &&
          readyTuiOutput.includes("Conversation") &&
          readyTuiOutput.includes("state:succeeded") &&
          readyTuiOutput.includes("status:runnable"),
        "TUI should complete ask and report runnable preview after trusted setup"
      )
      assert(
        !rendererSerialized.includes(READY_SECRET_REF) &&
          !rendererSerialized.includes(storeDir) &&
          !rendererSerialized.includes(context.serviceBin) &&
          !rendererSerialized.includes("configureModelEndpoint") &&
          !rendererSerialized.includes("upsertModelEndpoint") &&
          !rendererSerialized.includes("\"apiKey\":"),
        "Web-facing feedback should not expose secrets or setup APIs"
      )
      assert(
        !trustedSerialized.includes(READY_SECRET_REF) &&
          !trustedSerialized.includes(storeDir) &&
          !trustedSerialized.includes(context.serviceBin),
        "trusted setup result should redact secrets and local paths"
      )

      return {
        blockedWebOperation: submitSnapshot(blockedWeb).view.operationStatus.state,
        blockedWebPreview: submitSnapshot(blockedWebPreview).view.commandPreview.state,
        blockedWebExecution:
          submitSnapshot(blockedWebExecution).view.commandExecution.state,
        blockedTuiCommands: blockedTui.blockedCommandCount,
        blockedTuiPreviewCommands: blockedTui.previewCommandCount,
        blockedTuiExecuteCommands: blockedTui.executeCommandCount,
        trustedSetupReadiness: trustedReadiness.status,
        readyWebOperation: submitSnapshot(readyWeb).view.operationStatus.state,
        readyWebPreview: submitSnapshot(readyWebPreview).view.commandPreview.state,
        readyWebExecution:
          submitSnapshot(readyWebExecution).view.commandExecution.state,
        readyTuiBlockedCommands: readyTui.blockedCommandCount,
        readyTuiPreviewCommands: readyTui.previewCommandCount,
        readyTuiExecuteCommands: readyTui.executeCommandCount,
        readyTuiActiveSessionId: readyTui.activeSessionId,
        rendererSafe:
          !rendererSerialized.includes(READY_SECRET_REF) &&
          !rendererSerialized.includes("configureModelEndpoint") &&
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
    kind: "web.request" as const,
    operation: "dispatchAction" as const,
    requestId: request.requestId,
    action: {
      type: "submit-conversation" as const,
      input: {
        text: request.text
      }
    }
  }
}

function webSetModeRequest(request: {
  readonly requestId: string
}) {
  return {
    kind: "web.request" as const,
    operation: "dispatchAction" as const,
    requestId: request.requestId,
    action: {
      type: "set-mode" as const,
      input: {
        mode: "workbench"
      }
    }
  }
}

function webPreviewCommandRequest(request: {
  readonly requestId: string
  readonly text: string
}) {
  return {
    kind: "web.request" as const,
    operation: "dispatchAction" as const,
    requestId: request.requestId,
    action: {
      type: "preview-command" as const,
      input: {
        commandId: "product.agent.submit",
        input: {
          text: request.text
        }
      }
    }
  }
}

function webExecuteCommandRequest(request: {
  readonly requestId: string
  readonly text: string
}) {
  return {
    kind: "web.request" as const,
    operation: "dispatchAction" as const,
    requestId: request.requestId,
    action: {
      type: "execute-command" as const,
      input: {
        commandId: "product.agent.submit",
        input: { text: request.text }
      }
    }
  }
}

function expectSubmitResponse(
  response: Awaited<ReturnType<typeof handleRequest>>
): DispatchActionResponse {
  if (!response.ok || response.operation !== "dispatchAction") {
    throw new Error("expected web application dispatchAction response")
  }
  return response
}

function submitSnapshot(
  response: DispatchActionResponse
): Snapshot {
  return response.actionResult.snapshot
}
