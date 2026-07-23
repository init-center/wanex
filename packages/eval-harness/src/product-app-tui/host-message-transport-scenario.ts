import { rm } from "node:fs/promises"
import {
  createProductAppShell,
  createProductAppSurfaceAdapter
} from "@wanex/product-app"
import {
  createProductAppTuiHostSurfaceClient,
  createProductAppTuiSurface
} from "@wanex/product-app-tui"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "../distribution-audit.js"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import { mktemp } from "../product-bootstrap/helpers.js"

export const productAppTuiHostMessageTransportScenario = createEvalScenario({
  id: "product.app-tui-host-message-transport-contract",
  title: "Product App TUI host creates its surface client through message transport",
  tags: [
    "product-app",
    "tui",
    "surface-client",
    "message-transport",
    "upper-app",
    "product-path"
  ],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-product-app-tui-host-message-")
    const app = await createProductAppShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: context.serviceBin
      },
      providerProfile: {
        id: "eval-product-app-tui-host-message",
        modelId: "eval-product-app-tui-host-message-model"
      }
    })
    const productSurface = createProductAppSurfaceAdapter(app, {
      now: () => 9900
    })
    const operations: string[] = []
    const client = createProductAppTuiHostSurfaceClient({
      surface: productSurface,
      observeRequest(request) {
        operations.push(request.operation)
      }
    })

    try {
      const surface = await createProductAppTuiSurface({
        client,
        now: () => 9901
      })
      const status = await surface.client.status({
        requestId: "eval_product_app_tui_host_status"
      })
      const events = await surface.client.readSurfaceEvents({ limit: 2 })
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const productAppTui = entryByName(footprint, "@wanex/product-app-tui")
      const snapshot = surface.snapshot()
      const descriptor = snapshot.descriptor

      assert(
        descriptor.ok && descriptor.value.commandCount === 23,
        "Product App TUI host message client should initialize the TUI surface"
      )
      assert(
        status.ok &&
          status.event.requestId === "eval_product_app_tui_host_status",
        "Product App TUI host message client should dispatch commands"
      )
      assert(
        events.ok &&
          events.events.some(
            (event) => event.type === "product-app.surface.command_completed"
          ),
        "Product App TUI host message client should read surface events"
      )
      assert(
        operations.includes("descriptor") &&
          operations.includes("dispatchSurfaceCommand") &&
          operations.includes("readSurfaceEvents"),
        "Product App TUI host should use the message transport operations"
      )
      assert(
        !productAppTui.contains.pluginRuntime &&
          !productAppTui.contains.connectorRuntime &&
          productAppTui.contains.concreteAdapters.length === 0 &&
          productAppTui.contains.forbiddenPackages.length === 0,
        "Product App TUI host message transport should not change distribution closure"
      )

      return {
        descriptorOk: descriptor.ok,
        commandCount: descriptor.ok ? descriptor.value.commandCount : null,
        statusOk: status.ok,
        eventCount: events.ok ? events.events.length : null,
        operations,
        productAppTuiPluginRuntime: productAppTui.contains.pluginRuntime,
        productAppTuiConnectorRuntime: productAppTui.contains.connectorRuntime,
        productAppTuiConcreteAdapters: productAppTui.contains.concreteAdapters
      }
    } finally {
      await app.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})
