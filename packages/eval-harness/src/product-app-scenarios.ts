import { rm } from "node:fs/promises"
import {
  createProductAppShell,
  createProductAppSurfaceAdapter
} from "@wanex/product-app"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "./distribution-audit.js"
import { createEvalScenario } from "./runner.js"
import { assert, isRecord } from "./scenario-utils.js"
import { mktemp } from "./product-bootstrap/helpers.js"

export {
  productAppHostEndpointContractScenario
} from "./product-app/host-endpoint-scenario.js"
export {
  productAppSurfaceClientContractScenario
} from "./product-app/surface-client-scenario.js"
export {
  productAppSurfaceMessageTransportScenario
} from "./product-app/surface-message-transport-scenario.js"
export {
  productAppWebSurfaceContractScenario
} from "./product-app/web-surface-scenario.js"
export {
  productAppLocalHostContractScenario
} from "./product-app/local-host-scenario.js"
export {
  productAppLocalDesktopHostContractScenario
} from "./product-app/local-desktop-host-scenario.js"
export {
  productAppFeedbackMatrixScenario
} from "./product-app/feedback-matrix-scenario.js"
export {
  declarativeCommandInputProductScenario
} from "./product-app/declarative-input-scenario.js"

export const productAppShellContractScenario = createEvalScenario({
  id: "product.app-shell-contract",
  title: "Product App consumes the frozen upper app integration contract",
  tags: ["product-app", "upper-app", "product-path"],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-product-app-")
    const app = await createProductAppShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: context.serviceBin
      },
      providerProfile: {
        id: "eval-product-app",
        modelId: "eval-product-app-model"
      },
      state: {
        layout: "split",
        mode: "workbench",
        preferences: {
          theme: "dark"
        }
      }
    })

    try {
      const home = await app.readHome({ overview: { now: 9400 } })
      const settings = app.readSettings()
      const run = await app.dispatchProductCommand({
        command: "runAgentTurn",
        input: {
          text: "eval product app turn",
          sessionId: "ses_eval_product_app"
        }
      })
      assert(run.ok, "product app should dispatch agent turn through product port")
      const selected = await app.selectSession({
        sessionId: "ses_eval_product_app"
      })
      const opened = await app.openWorkbench()
      const continued = await app.continueWorkbench({
        text: "eval product app continued"
      })
      const started = await app.startWorkbench({
        text: "eval product app started"
      })
      const json = await app.dispatchProductCommandJson(
        JSON.stringify({ command: "status" })
      )
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const productApp = entryByName(footprint, "@wanex/product-app")

      assert(home.kind === "product-app.home", "home should be product app state")
      assert(
        settings.kind === "product-app.settings" &&
          settings.profile.activeProviderProfileId === "eval-product-app" &&
          !settings.privacy.exposesStorePath &&
          !settings.privacy.exposesServiceBinaryPath &&
          !settings.privacy.exposesSecrets,
        "settings should expose safe product-owned profile state"
      )
      assert(
        home.integration.recommendedEntryPoint === "@wanex/product-app",
        "product app should advertise its Product App facade"
      )
      assert(
        !home.rendererBoundary.rendererMayOpenStorage &&
          !home.rendererBoundary.rendererMayReceiveStorePath &&
          !home.rendererBoundary.rendererMayReceiveServiceBinaryPath,
        "renderer boundary should hide storage internals"
      )
      assert(
        selected.selectedSessionId === "ses_eval_product_app",
        "selected session should be app-owned state"
      )
      assert(
        opened.kind === "product-app.workbench.opened" &&
          continued.kind === "product-app.workbench.continued",
        "workbench should open and continue through the selected session"
      )
      assert(
        started.kind === "product-app.workbench.started",
        "workbench should start without a preselected session"
      )
      assert(
        json.status === "success" && json.envelope.ok,
        "JSON adapter should dispatch through the product command port"
      )
      assert(
        !productApp.contains.pluginRuntime &&
          !productApp.contains.connectorRuntime &&
          productApp.contains.concreteAdapters.length === 0 &&
          productApp.contains.forbiddenPackages.length === 0,
        "product app closure should stay slim"
      )

      return {
        entry: "@wanex/product-app",
        layout: home.state.layout,
        mode: home.state.mode,
        activeProviderProfileId: settings.profile.activeProviderProfileId,
        settingsPrivacySafe:
          !settings.privacy.exposesStorePath &&
          !settings.privacy.exposesServiceBinaryPath &&
          !settings.privacy.exposesSecrets,
        selectedSessionId: selected.selectedSessionId,
        rendererCalls: home.rendererBoundary.rendererCalls,
        openedKind: opened.kind,
        continuedKind: continued.kind,
        startedKind: started.kind,
        jsonStatus: json.status,
        pluginRuntime: productApp.contains.pluginRuntime,
        connectorRuntime: productApp.contains.connectorRuntime,
        concreteAdapters: productApp.contains.concreteAdapters,
        forbiddenPackages: productApp.contains.forbiddenPackages
      }
    } finally {
      await app.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})

export const productAppSurfaceContractScenario = createEvalScenario({
  id: "product.app-surface-contract",
  title: "Product App exposes a transport-neutral surface adapter",
  tags: ["product-app", "surface", "upper-app", "product-path"],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-product-app-surface-")
    const app = await createProductAppShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: context.serviceBin
      },
      providerProfile: {
        id: "eval-product-app-surface",
        modelId: "eval-product-app-surface-model"
      }
    })
    const surface = createProductAppSurfaceAdapter(app, {
      now: () => 9500
    })

    try {
      const descriptor = surface.descriptor()
      const started = await surface.dispatchSurfaceCommand({
        command: "startWorkbench",
        requestId: "eval_surface_start",
        input: {
          text: "eval surface started"
        }
      })
      const run = await surface.dispatchSurfaceCommand({
        command: "dispatchProductCommand",
        requestId: "eval_surface_run",
        input: {
          command: "runAgentTurn",
          input: {
            text: "eval surface turn",
            sessionId: "ses_eval_product_app_surface"
          }
        }
      })
      const opened = await surface.dispatchSurfaceCommand({
        command: "openWorkbench",
        requestId: "eval_surface_open",
        input: {
          sessionId: "ses_eval_product_app_surface"
        }
      })
      const continued = await surface.dispatchSurfaceCommand({
        command: "continueWorkbench",
        requestId: "eval_surface_continue",
        input: {
          text: "eval surface continued"
        }
      })
      const invalid = await surface.dispatchSurfaceCommand({
        command: "setLayout",
        input: {
          layout: "floating"
        }
      })
      const events = surface.readSurfaceEvents()
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const productApp = entryByName(footprint, "@wanex/product-app")

      assert(
        descriptor.transport === "app-owned-ipc-or-api" &&
          descriptor.commandCount === 18,
        "surface descriptor should be transport-neutral and complete"
      )
      assert(
        started.ok &&
          isRecord(started.value) &&
          started.value.kind === "product-app.workbench.started",
        "surface should start workbench without a preselected session"
      )
      assert(
        !descriptor.rendererBoundary.rendererMayOpenStorage &&
          !descriptor.rendererBoundary.rendererMayReceiveStorePath &&
          !descriptor.rendererBoundary.rendererMayReceiveServiceBinaryPath,
        "surface descriptor should preserve renderer isolation"
      )
      assert(run.ok, "surface should dispatch product command")
      assert(
        opened.ok &&
          isRecord(opened.value) &&
          opened.value.kind === "product-app.workbench.opened",
        "surface should open workbench"
      )
      assert(
        continued.ok &&
          isRecord(continued.value) &&
          continued.value.kind === "product-app.workbench.continued",
        "surface should continue workbench through selected session"
      )
      assert(
        !invalid.ok &&
          invalid.error.code === "validation_error" &&
          invalid.error.category === "validation",
        "surface should fail closed for invalid input"
      )
      assert(
        events.some(
          (event) => event.type === "product-app.surface.state_changed"
        ),
        "surface should record app state change events"
      )
      assert(
        !productApp.contains.pluginRuntime &&
          !productApp.contains.connectorRuntime &&
          productApp.contains.concreteAdapters.length === 0,
        "product app surface should not change distribution closure"
      )

      return {
        descriptorKind: descriptor.kind,
        transport: descriptor.transport,
        commandCount: descriptor.commandCount,
        rendererCalls: descriptor.rendererBoundary.rendererCalls,
        startedKind: isRecord(started.value) ? started.value.kind : null,
        openedKind: isRecord(opened.value) ? opened.value.kind : null,
        continuedKind: isRecord(continued.value) ? continued.value.kind : null,
        invalidCode: invalid.ok ? null : invalid.error.code,
        eventCount: events.length,
        stateChanged: events.some(
          (event) => event.type === "product-app.surface.state_changed"
        ),
        pluginRuntime: productApp.contains.pluginRuntime,
        connectorRuntime: productApp.contains.connectorRuntime,
        concreteAdapters: productApp.contains.concreteAdapters
      }
    } finally {
      await app.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})
