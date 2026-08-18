import {
  createShell,
  createSurfaceAdapter
} from "@wanex/product"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient
} from "@wanex/product/surface"
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
} from "../product/conversation-helpers.js"

export const tuiSurfaceScenario = createEvalScenario({
  id: "product.app-tui-surface-contract",
  title: "TUI consumes product through the surface client",
  tags: ["product", "tui", "surface-client", "upper-app", "product-path"],
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
        sessionId: "ses_eval_product_app_tui"
      })
      const submitted = await surface.client.submitConversationOperation({
        text: "eval application tui turn",
        sessionId: "ses_eval_product_app_tui"
      })
      assert(
        submitted.ok &&
          submitted.value.kind === "product.conversation-operation.found",
        "TUI submit should complete admission through Product Surface"
      )
      await conversationSettlement
      const selected = await surface.client.selectSession({
        sessionId: "ses_eval_product_app_tui"
      })
      const opened = await surface.client.openWorkbench()
      const operation = await surface.client.readTrackedConversationOperation({
        sessionId: "ses_eval_product_app_tui"
      })
      const regenerated =
        await surface.client.regenerateTrackedConversationOperation({
          sessionId: "ses_eval_product_app_tui"
        })
      const refreshed = await surface.refresh()
      const refreshedFrame = renderTuiFrame(refreshed)
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const productPackage = entryByName(footprint, "@wanex/product")
      const tui = entryByName(footprint, "@wanex/tui")
      const canonicalSnapshot = surface.snapshot()
      const commandCatalog = canonicalSnapshot.commandCatalog

      assert(
        commandCatalog.ok &&
          commandCatalog.value.commands.length === 14 &&
          commandCatalog.value.commands.some(
            (command) => command.id === "product.agent.submit"
          ) &&
          !Object.prototype.hasOwnProperty.call(canonicalSnapshot, "readModel") &&
          !Object.prototype.hasOwnProperty.call(canonicalSnapshot, "contributions"),
        "TUI should expose only the canonical dynamic command catalog"
      )
      assert(
        frame.kind === "tui.frame" &&
          frame.ready &&
          frame.productCommandCount === 14 &&
          frame.statusCount === 8 &&
          frame.text.includes("Workbench") &&
          frame.text.includes("product-commands:14") &&
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
        "TUI operations should complete through the Product Surface client"
      )
      assert(
        refreshed.status.ok &&
          refreshed.status.value.state.selection?.kind === "session" &&
          refreshed.status.value.state.selection.sessionId ===
            "ses_eval_product_app_tui",
        "TUI refresh should observe selected product session"
      )
      assert(
        refreshed.events.ok &&
          refreshed.events.events.some(
            (event) => event.type === "product.surface.state_changed"
          ),
        "TUI should read product surface events"
      )
      assert(
        !productPackage.contains.pluginRuntime &&
          !productPackage.contains.connectorRuntime &&
          productPackage.contains.concreteAdapters.length === 0 &&
          productPackage.contains.forbiddenPackages.length === 0,
        "product default closure should remain slim"
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
        productCommandCount: frame.productCommandCount,
        hasSubmitCommand:
          finalSnapshot.commandCatalog.ok &&
          finalSnapshot.commandCatalog.value.commands.some(
            (command) => command.id === "product.agent.submit"
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
              (event) => event.type === "product.surface.state_changed"
            )
          : false,
        refreshedFrameReady: refreshedFrame.ready,
        pluginRuntime: productPackage.contains.pluginRuntime,
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
