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
  renderTuiFrame
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

export const tuiSurfaceScenario = createEvalScenario({
  id: "assistant.app-tui-surface-contract",
  title: "TUI consumes assistant through the surface client",
  tags: ["assistant", "tui", "surface-client", "upper-app", "assistant-path"],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-tui-"
    })
    const app = await createShell({
      storage: storage.storage,
      modelEndpoint: evalFakeModelEndpoint(
        "eval-tui",
        "eval-tui-model"
      )
    })
    const surfaceAdapter = createSurfaceAdapter(app, {
      now: () => 9700
    })
    const client = createSurfaceClient(
      createInProcessSurfaceClientTransport(surfaceAdapter)
    )

    try {
      const surface = await createTuiSurface({
        client,
        now: () => 9701
      })
      const frame = renderTuiFrame(surface.snapshot())
      const conversationSettlement = storage.settlements.waitForNext({
        sessionId: "ses_eval_assistant_app_tui"
      })
      const submitted = await surface.client.submitConversationOperation({
        text: "eval application tui turn",
        sessionId: "ses_eval_assistant_app_tui"
      })
      assert(
        submitted.ok &&
          submitted.value.kind === "assistant.conversation-operation.found",
        "TUI submit should complete admission through Assistant Surface"
      )
      await conversationSettlement
      const selected = await surface.client.selectSession({
        sessionId: "ses_eval_assistant_app_tui"
      })
      const opened = await surface.client.openWorkbench()
      const operation = await surface.client.readTrackedConversationOperation({
        sessionId: "ses_eval_assistant_app_tui"
      })
      const regenerated =
        await surface.client.regenerateTrackedConversationOperation({
          sessionId: "ses_eval_assistant_app_tui"
        })
      const refreshed = await surface.refresh()
      const refreshedFrame = renderTuiFrame(refreshed)
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const assistantPackage = entryByName(footprint, "@wanex/assistant")
      const tui = entryByName(footprint, "@wanex/tui")
      const canonicalSnapshot = surface.snapshot()
      const commandCatalog = canonicalSnapshot.commandCatalog

      assert(
        commandCatalog.ok &&
          commandCatalog.value.commands.length === 14 &&
          commandCatalog.value.commands.some(
            (command) => command.id === "assistant.agent.submit"
          ) &&
          !Object.prototype.hasOwnProperty.call(canonicalSnapshot, "readModel") &&
          !Object.prototype.hasOwnProperty.call(canonicalSnapshot, "contributions"),
        "TUI should expose only the canonical dynamic command catalog"
      )
      assert(
        frame.kind === "tui.frame" &&
          frame.ready &&
          frame.assistantCommandCount === 14 &&
          frame.statusCount === 8 &&
          frame.text.includes("Workbench") &&
          frame.text.includes("assistant-commands:14") &&
          frame.text.includes("model:eval-tui") &&
          frame.text.includes("provider:ready") &&
          frame.text.includes("theme:system") &&
          !frame.text.includes("Palette"),
        "TUI should render a canonical first-screen frame"
      )
      assert(
        selected.ok &&
          submitted.ok &&
          opened.ok &&
          operation.ok &&
          regenerated.ok,
        "TUI operations should complete through the Assistant Surface client"
      )
      assert(
        refreshed.status.ok &&
          refreshed.status.value.state.selection?.kind === "session" &&
          refreshed.status.value.state.selection.sessionId ===
            "ses_eval_assistant_app_tui",
        "TUI refresh should observe selected assistant session"
      )
      assert(
        refreshed.events.ok &&
          refreshed.events.events.some(
            (event) => event.type === "assistant.surface.state_changed"
          ),
        "TUI should read assistant surface events"
      )
      assert(
        !assistantPackage.contains.pluginRuntime &&
          !assistantPackage.contains.connectorRuntime &&
          assistantPackage.contains.concreteAdapters.length === 0 &&
          assistantPackage.contains.forbiddenPackages.length === 0,
        "assistant default closure should remain slim"
      )
      assert(
        !tui.contains.pluginRuntime &&
          !tui.contains.connectorRuntime &&
          tui.contains.concreteAdapters.length === 0 &&
          tui.contains.forbiddenPackages.length === 0,
        "TUI closure should stay free of plugin/connector runtime"
      )

      const finalSnapshot = surface.snapshot()
      return {
        frameKind: frame.kind,
        frameReady: frame.ready,
        assistantCommandCount: frame.assistantCommandCount,
        hasSubmitCommand:
          finalSnapshot.commandCatalog.ok &&
          finalSnapshot.commandCatalog.value.commands.some(
            (command) => command.id === "assistant.agent.submit"
          ),
        statusCount: finalSnapshot.commandCatalog.ok ? 8 : 0,
        providerReadinessStatus: finalSnapshot.home.ok
          ? finalSnapshot.home.value.providerReadiness.status
          : "unknown",
        submittedOk: submitted.ok,
        selectedOk: selected.ok,
        openedOk: opened.ok,
        operationOk: operation.ok,
        regeneratedOk: regenerated.ok,
        selectedSessionId: refreshed.status.ok
          ? refreshed.status.value.state.selection?.kind === "session"
            ? refreshed.status.value.state.selection.sessionId
            : null
          : null,
        stateChanged: refreshed.events.ok
          ? refreshed.events.events.some(
              (event) => event.type === "assistant.surface.state_changed"
            )
          : false,
        refreshedFrameReady: refreshedFrame.ready,
        pluginRuntime: assistantPackage.contains.pluginRuntime,
        tuiPluginRuntime: tui.contains.pluginRuntime,
        tuiConnectorRuntime: tui.contains.connectorRuntime,
        tuiConcreteAdapters: tui.contains.concreteAdapters
      }
    } finally {
      await surfaceAdapter.dispose()
      await app.dispose()
      await storage.dispose()
    }
  }
})
