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
  PRODUCT_APP_TUI_COMMANDS,
  createProductAppTuiSurface,
  renderProductAppTuiFrame
} from "@wanex/product-app-tui"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "../distribution-audit.js"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import { mktemp } from "../product-bootstrap/helpers.js"
import { waitForProductConversation } from "../product-app/conversation-helpers.js"
import { completedCommandId } from "./helpers.js"

export const productAppTuiSurfaceScenario = createEvalScenario({
  id: "product.app-tui-surface-contract",
  title: "Product App TUI consumes Product App through the surface client",
  tags: ["product-app", "tui", "surface-client", "upper-app", "product-path"],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-product-app-tui-")
    const app = await createProductAppShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: context.serviceBin
      },
      providerProfile: {
        id: "eval-product-app-tui",
        modelId: "eval-product-app-tui-model"
      }
    })
    const surfaceAdapter = createProductAppSurfaceAdapter(app, {
      now: () => 9700
    })
    const client = createProductAppSurfaceClient(
      createInProcessProductAppSurfaceClientTransport(surfaceAdapter)
    )

    try {
      const surface = await createProductAppTuiSurface({
        client,
        now: () => 9701
      })
      const frame = renderProductAppTuiFrame(surface.snapshot())
      const submitted = await surface.controller.executePaletteEntry({
        id: "product-app-tui.palette.conversation-submit",
        input: {
          text: "eval product app tui turn",
          sessionId: "ses_eval_product_app_tui"
        }
      })
      await waitForProductConversation(app, "ses_eval_product_app_tui")
      const selected = await surface.controller.executePaletteEntry({
        id: "product-app-tui.palette.session-select",
        input: {
          sessionId: "ses_eval_product_app_tui"
        }
      })
      const opened = await surface.controller.executePaletteEntry({
        id: "product-app-tui.palette.workbench-open"
      })
      const operation = await surface.controller.executePaletteEntry({
        id: "product-app-tui.palette.conversation-read",
        input: { sessionId: "ses_eval_product_app_tui" }
      })
      const regenerated = await surface.controller.executePaletteEntry({
        id: "product-app-tui.palette.conversation-regenerate",
        input: { sessionId: "ses_eval_product_app_tui" }
      })
      const refreshed = await surface.refresh()
      const refreshedFrame = renderProductAppTuiFrame(refreshed)
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const productApp = entryByName(footprint, "@wanex/product-app")
      const productAppTui = entryByName(footprint, "@wanex/product-app-tui")

      assert(
        surface.snapshot().readModel.palette.length === 9 &&
          surface.snapshot().readModel.palette.some(
            (entry) => entry.id === "product-app-tui.palette.conversation-submit"
          ) &&
          surface.snapshot().readModel.statusItems.length === 8 &&
          surface.snapshot().readModel.statusItems.some(
            (item) => item.label === "profile:eval-product-app-tui"
          ) &&
          surface.snapshot().readModel.statusItems.some(
            (item) => item.label === "provider:ready"
          ) &&
          surface.snapshot().readModel.statusItems.some(
            (item) => item.label === "theme:system"
          ),
        "Product App TUI should expose a compact settings-aware read model"
      )
      assert(
        frame.kind === "product-app-tui.frame" &&
          frame.ready &&
          frame.productCommandCount === 14 &&
          frame.text.includes("Wanex Product App TUI") &&
          frame.text.includes("product-commands:14") &&
          frame.text.includes("profile:eval-product-app-tui") &&
          frame.text.includes("provider:ready") &&
          frame.text.includes("theme:system"),
        "Product App TUI should render a first-screen frame"
      )
      assert(
        selected.status === "completed" &&
          submitted.status === "completed" &&
          opened.status === "completed" &&
          operation.status === "completed" &&
          regenerated.status === "completed",
        "Product App TUI commands should complete through the TUI controller"
      )
      assert(
        completedCommandId(selected.value) ===
          PRODUCT_APP_TUI_COMMANDS.selectSession &&
          completedCommandId(submitted.value) ===
            PRODUCT_APP_TUI_COMMANDS.submitConversation &&
          completedCommandId(opened.value) ===
            PRODUCT_APP_TUI_COMMANDS.openWorkbench &&
          completedCommandId(operation.value) ===
            PRODUCT_APP_TUI_COMMANDS.readConversationOperation &&
          completedCommandId(regenerated.value) ===
            PRODUCT_APP_TUI_COMMANDS.regenerateConversation,
        "TUI command values should identify Product App TUI commands"
      )
      assert(
        refreshed.status.ok &&
          refreshed.status.value.state.selectedSessionId ===
            "ses_eval_product_app_tui",
        "Product App TUI refresh should observe selected Product App session"
      )
      assert(
        refreshed.events.ok &&
          refreshed.events.events.some(
            (event) => event.type === "product-app.surface.state_changed"
          ),
        "Product App TUI should read Product App surface events"
      )
      assert(
        !productApp.contains.pluginRuntime &&
          !productApp.contains.connectorRuntime &&
          productApp.contains.concreteAdapters.length === 0 &&
          productApp.contains.forbiddenPackages.length === 0,
        "Product App default closure should remain slim"
      )
      assert(
        !productAppTui.contains.pluginRuntime &&
          !productAppTui.contains.connectorRuntime &&
          productAppTui.contains.concreteAdapters.length === 0 &&
          productAppTui.contains.forbiddenPackages.length === 0,
        "Product App TUI closure should stay free of plugin/connector runtime"
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
        paletteCount: finalSnapshot.readModel.palette.length,
        statusItemCount: finalSnapshot.readModel.statusItems.length,
        providerReadinessStatus: finalSnapshot.home.ok
          ? finalSnapshot.home.value.providerReadiness.status
          : "unknown",
        submittedStatus: submitted.status,
        selectedStatus: selected.status,
        openedStatus: opened.status,
        operationStatus: operation.status,
        regeneratedStatus: regenerated.status,
        selectedSessionId: refreshed.status.ok
          ? refreshed.status.value.state.selectedSessionId
          : null,
        stateChanged: refreshed.events.ok
          ? refreshed.events.events.some(
              (event) => event.type === "product-app.surface.state_changed"
            )
          : false,
        refreshedFrameReady: refreshedFrame.ready,
        productAppPluginRuntime: productApp.contains.pluginRuntime,
        productAppTuiPluginRuntime: productAppTui.contains.pluginRuntime,
        productAppTuiConnectorRuntime: productAppTui.contains.connectorRuntime,
        productAppTuiConcreteAdapters: productAppTui.contains.concreteAdapters
      }
    } finally {
      await surfaceAdapter.dispose()
      await app.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})
