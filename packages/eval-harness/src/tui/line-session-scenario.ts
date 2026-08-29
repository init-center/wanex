import {
  createShell,
  createSurfaceAdapter
} from "@wanex/assistant"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient
} from "@wanex/assistant/surface"
import {
  createTuiSurface,
  runTuiLineSession
} from "@wanex/tui"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "../distribution-audit.js"
import { createEvalScenario } from "../runner.js"
import { assert, evalFakeModelEndpoint } from "../scenario-utils.js"
import {
  createConversationSettlementFixture
} from "../assistant/conversation-helpers.js"
import { lines } from "./helpers.js"

export const tuiLineSessionScenario = createEvalScenario({
  id: "assistant.app-tui-line-session-contract",
  title: "TUI line session runs through the surface client",
  tags: ["assistant", "tui", "interactive", "upper-app", "assistant-path"],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-tui-line-"
    })
    const app = await createShell({
      storage: storage.storage,
      modelEndpoint: evalFakeModelEndpoint(
        "eval-tui-line",
        "eval-tui-line-model"
      )
    })
    const surfaceAdapter = createSurfaceAdapter(app, {
      now: () => 9800
    })
    const client = createSurfaceClient(
      createInProcessSurfaceClientTransport(surfaceAdapter)
    )

    try {
      const surface = await createTuiSurface({
        client,
        now: () => 9801
      })
      const trackedSettlement = storage.settlements.waitForNext({
        sessionId: "ses_eval_assistant_app_tui_execution"
      })
      const tracked = await app.submitConversationOperation({
        text: "eval application tui tracked conversation",
        sessionId: "ses_eval_assistant_app_tui_execution"
      })
      assert(
        tracked.kind === "assistant.conversation-operation.found",
        "tracked TUI conversation should be admitted before settlement"
      )
      await trackedSettlement
      const execution = await app.dispatchAssistantCommand({
        command: "submitConversationOperation",
        input: {
          text: "eval application tui tracked execution",
          sessionId: "ses_eval_assistant_app_tui_job",
          jobId: "job_eval_assistant_app_tui_execution"
        }
      })
      assert(
        execution.ok,
        "tracked TUI execution should be admitted before settlement"
      )
      await storage.settlements.waitForJob(
        "job_eval_assistant_app_tui_execution"
      )
      await surface.refresh()
      const chunks: string[] = []
      const result = await runTuiLineSession({
        surface,
        input: lines([
          "help",
          "operation",
          "workbench",
          "regenerate",
          "cancel eval application tui cancellation",
          "events 8",
          "commands",
          "palette",
          "preview assistant.agent.submit {\"text\":\"eval application tui preview\"}",
          "execute assistant.status",
          "execution job_eval_assistant_app_tui_execution",
          "refresh",
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
      const assistantPackage = entryByName(footprint, "@wanex/assistant")
      const tui = entryByName(footprint, "@wanex/tui")

      assert(
        result.kind === "tui.line-session" &&
          result.quit &&
          result.askCommandCount === 0 &&
          result.workbenchCommandCount === 1 &&
          result.operationCommandCount === 1 &&
          result.cancelCommandCount === 1 &&
          result.regenerateCommandCount === 1 &&
          result.catalogCommandCount === 1 &&
          result.previewCommandCount === 1 &&
          result.executeCommandCount === 1 &&
          result.executionCommandCount === 1 &&
          result.eventsCommandCount === 1 &&
          result.blockedCommandCount === 0 &&
          result.errorCount === 1,
        "TUI line session should execute commands and preserve safe errors"
      )
      assert(
        typeof result.activeSessionId === "string" &&
          result.activeSessionId.startsWith("ses_"),
        "TUI line session should track active session"
      )
      assert(
        output.includes("Workbench") &&
          output.includes("Type help for commands.") &&
          !output.includes("palette <index|palette-id|command-id>"),
        "TUI line session should render initial frame and help"
      )
      assert(
        output.includes("Conversation") &&
          output.includes("state:succeeded"),
        "TUI line session should read durable conversation progress"
      )
      assert(
          output.includes("Workbench") &&
          output.includes("cancel:") &&
          output.includes("Events"),
          "TUI line session should open workbench, cancel, and read events"
        )
      assert(
        output.includes("Commands") &&
          output.includes("assistant.agent.submit - Submit Agent Turn") &&
          output.includes("handler:wanex.assistant.backend.submitConversationOperation"),
        "TUI line session should render the typed command catalog"
      )
      assert(
        output.includes("Command preview") &&
          output.includes("status:runnable") &&
          output.includes("command:assistant.agent.submit") &&
          output.includes("input:accepted"),
        "TUI line session should render command invocation previews without executing them"
      )
      assert(
        output.includes("Command execution") &&
          output.includes("status:completed") &&
          output.includes("command:assistant.status") &&
          output.includes("valueKind:object"),
        "TUI line session should render bounded typed execution summaries"
      )
      assert(
        output.includes("Execution activity") &&
          output.includes("state:succeeded") &&
          output.includes("jobKind:session.turn"),
        "TUI line session should render bounded durable execution activity"
      )
      assert(
        output.includes("error: unknown command: palette") &&
          output.includes("bye"),
        "TUI line session should reject the deleted static palette command"
      )
      assert(
        !assistantPackage.contains.pluginRuntime &&
          !assistantPackage.contains.connectorRuntime &&
          assistantPackage.contains.concreteAdapters.length === 0 &&
          assistantPackage.contains.forbiddenPackages.length === 0,
        "assistant default closure should stay slim with line session present"
      )
      assert(
        !tui.contains.pluginRuntime &&
          !tui.contains.connectorRuntime &&
          tui.contains.concreteAdapters.length === 0 &&
          tui.contains.forbiddenPackages.length === 0,
        "TUI line session closure should stay free of plugin/connector runtime"
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
        catalogCommandCount: result.catalogCommandCount,
        previewCommandCount: result.previewCommandCount,
        executeCommandCount: result.executeCommandCount,
        executionCommandCount: result.executionCommandCount,
        eventsCommandCount: result.eventsCommandCount,
        blockedCommandCount: result.blockedCommandCount,
        errorCount: result.errorCount,
        activeSessionId: result.activeSessionId,
        renderedInitialFrame: output.includes("Workbench"),
        renderedHelp: output.includes("Commands:"),
        conversationRendered: output.includes("Conversation"),
        workbenchRendered: output.includes("Workbench"),
        commandCatalogRendered: output.includes("Commands"),
        previewRendered: output.includes("Command preview"),
        executionRendered: output.includes(
          "Command execution"
        ),
        executionActivityRendered: output.includes(
          "Execution activity"
        ),
        eventsRendered: output.includes("Events"),
        staticPaletteRejected: output.includes("error: unknown command: palette"),
        pluginRuntime: assistantPackage.contains.pluginRuntime,
        tuiPluginRuntime: tui.contains.pluginRuntime,
        tuiConnectorRuntime: tui.contains.connectorRuntime
      }
    } finally {
      await surfaceAdapter.dispose()
      await app.dispose()
      await storage.dispose()
    }
  }
})
