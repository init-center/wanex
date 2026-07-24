import {
  createProductAppShell,
  createProductAppSurfaceAdapter
} from "@wanex/product-app"
import {
  createInProcessProductAppSurfaceClientTransport,
  createProductAppSurfaceClient
} from "@wanex/product-app/surface-client"
import {
  createProductAppTuiSurface,
  runProductAppTuiLineSession
} from "@wanex/product-app-tui"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "../distribution-audit.js"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import {
  createConversationSettlementFixture
} from "../product-app/conversation-helpers.js"
import { lines } from "./helpers.js"

export const productAppTuiLineSessionScenario = createEvalScenario({
  id: "product.app-tui-line-session-contract",
  title: "Product App TUI line session runs through the surface client",
  tags: ["product-app", "tui", "interactive", "upper-app", "product-path"],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-product-app-tui-line-"
    })
    const app = await createProductAppShell({
      storage: storage.storage,
      providerProfile: {
        id: "eval-product-app-tui-line",
        modelId: "eval-product-app-tui-line-model"
      }
    })
    const surfaceAdapter = createProductAppSurfaceAdapter(app, {
      now: () => 9800
    })
    const client = createProductAppSurfaceClient(
      createInProcessProductAppSurfaceClientTransport(surfaceAdapter)
    )

    try {
      const surface = await createProductAppTuiSurface({
        client,
        now: () => 9801
      })
      const trackedSettlement = storage.settlements.waitForNext({
        sessionId: "ses_eval_product_app_tui_execution"
      })
      const tracked = await app.submitConversationOperation({
        text: "eval product app tui tracked conversation",
        sessionId: "ses_eval_product_app_tui_execution"
      })
      assert(
        tracked.kind === "product-app.conversation-operation.found",
        "tracked TUI conversation should be admitted before settlement"
      )
      await trackedSettlement
      const execution = await app.dispatchProductCommand({
        command: "submitConversationOperation",
        input: {
          text: "eval product app tui tracked execution",
          sessionId: "ses_eval_product_app_tui_job",
          jobId: "job_eval_product_app_tui_execution"
        }
      })
      assert(
        execution.ok,
        "tracked TUI execution should be admitted before settlement"
      )
      await storage.settlements.waitForJob(
        "job_eval_product_app_tui_execution"
      )
      await surface.refresh()
      const chunks: string[] = []
      const result = await runProductAppTuiLineSession({
        surface,
        input: lines([
          "help",
          "operation",
          "workbench",
          "regenerate",
          "cancel eval product app tui cancellation",
          "events 8",
          "commands",
          "palette",
          "palette product-app.workbench.open",
          "preview product.agent.submit {\"text\":\"eval product app tui preview\"}",
          "execute product.status",
          "execution job_eval_product_app_tui_execution",
          "refresh",
          "palette 999",
          "quit"
        ]),
        write(chunk) {
          chunks.push(chunk)
        }
      })
      const output = chunks.join("")
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const productApp = entryByName(footprint, "@wanex/product-app")
      const productAppTui = entryByName(footprint, "@wanex/product-app-tui")

      assert(
        result.kind === "product-app-tui.line-session" &&
          result.quit &&
          result.askCommandCount === 0 &&
          result.workbenchCommandCount === 1 &&
          result.operationCommandCount === 1 &&
          result.cancelCommandCount === 1 &&
          result.regenerateCommandCount === 1 &&
          result.paletteCommandCount === 1 &&
          result.catalogCommandCount === 1 &&
          result.previewCommandCount === 1 &&
          result.executeCommandCount === 1 &&
          result.executionCommandCount === 1 &&
          result.eventsCommandCount === 1 &&
          result.blockedCommandCount === 0 &&
          result.errorCount === 1,
        "Product App TUI line session should execute commands and preserve safe errors"
      )
      assert(
        typeof result.activeSessionId === "string" &&
          result.activeSessionId.startsWith("ses_"),
        "Product App TUI line session should track active session"
      )
      assert(
        output.includes("Wanex Product App TUI") &&
          output.includes("Type help for commands.") &&
          output.includes("palette <index|palette-id|command-id> [json-input]"),
        "Product App TUI line session should render initial frame and help"
      )
      assert(
        output.includes("Wanex Product App Conversation") &&
          output.includes("state:succeeded"),
        "Product App TUI line session should read durable conversation progress"
      )
      assert(
          output.includes("Wanex Product App Workbench") &&
          output.includes("cancel:") &&
          output.includes("Wanex Product App Surface Events"),
          "Product App TUI line session should open workbench, cancel, and read events"
        )
      assert(
        output.includes("Wanex Product App Commands") &&
          output.includes("product.agent.submit - Submit Agent Turn") &&
          output.includes("handler:wanex.product-app.backend.submitConversationOperation"),
        "Product App TUI line session should render the typed command catalog"
      )
      assert(
        output.includes("Wanex Product App Command Preview") &&
          output.includes("status:runnable") &&
          output.includes("command:product.agent.submit") &&
          output.includes("input:accepted"),
        "Product App TUI line session should render command invocation previews without executing them"
      )
      assert(
        output.includes("Wanex Product App Command Execution") &&
          output.includes("status:completed") &&
          output.includes("command:product.status") &&
          output.includes("valueKind:object"),
        "Product App TUI line session should render bounded typed execution summaries"
      )
      assert(
        output.includes("Wanex Product App Execution Activity") &&
          output.includes("state:succeeded") &&
          output.includes("jobKind:session.turn"),
        "Product App TUI line session should render bounded durable execution activity"
      )
      assert(
        output.includes("Palette:") &&
          output.includes("\"status\": \"completed\"") &&
          output.includes("error: palette index not found: 999") &&
          output.includes("bye"),
        "Product App TUI line session should expose palette execution and safe command errors"
      )
      assert(
        !productApp.contains.pluginRuntime &&
          !productApp.contains.connectorRuntime &&
          productApp.contains.concreteAdapters.length === 0 &&
          productApp.contains.forbiddenPackages.length === 0,
        "Product App default closure should stay slim with line session present"
      )
      assert(
        !productAppTui.contains.pluginRuntime &&
          !productAppTui.contains.connectorRuntime &&
          productAppTui.contains.concreteAdapters.length === 0 &&
          productAppTui.contains.forbiddenPackages.length === 0,
        "Product App TUI line session closure should stay free of plugin/connector runtime"
      )

      return {
        quit: result.quit,
        handledLineCount: result.handledLineCount,
        commandCount: result.commandCount,
        askCommandCount: result.askCommandCount,
        workbenchCommandCount: result.workbenchCommandCount,
        operationCommandCount: result.operationCommandCount,
        cancelCommandCount: result.cancelCommandCount,
        regenerateCommandCount: result.regenerateCommandCount,
        paletteCommandCount: result.paletteCommandCount,
        catalogCommandCount: result.catalogCommandCount,
        previewCommandCount: result.previewCommandCount,
        executeCommandCount: result.executeCommandCount,
        executionCommandCount: result.executionCommandCount,
        eventsCommandCount: result.eventsCommandCount,
        blockedCommandCount: result.blockedCommandCount,
        errorCount: result.errorCount,
        activeSessionId: result.activeSessionId,
        renderedInitialFrame: output.includes("Wanex Product App TUI"),
        renderedHelp: output.includes("Commands:"),
        conversationRendered: output.includes("Wanex Product App Conversation"),
        workbenchRendered: output.includes("Wanex Product App Workbench"),
        commandCatalogRendered: output.includes("Wanex Product App Commands"),
        previewRendered: output.includes("Wanex Product App Command Preview"),
        executionRendered: output.includes(
          "Wanex Product App Command Execution"
        ),
        executionActivityRendered: output.includes(
          "Wanex Product App Execution Activity"
        ),
        eventsRendered: output.includes("Wanex Product App Surface Events"),
        paletteDispatched: output.includes("\"status\": \"completed\""),
        safeError: output.includes("error: palette index not found: 999"),
        productAppPluginRuntime: productApp.contains.pluginRuntime,
        productAppTuiPluginRuntime: productAppTui.contains.pluginRuntime,
        productAppTuiConnectorRuntime: productAppTui.contains.connectorRuntime
      }
    } finally {
      await surfaceAdapter.dispose()
      await app.dispose()
      await storage.dispose()
    }
  }
})
