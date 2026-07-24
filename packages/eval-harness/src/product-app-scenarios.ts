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
import {
  createConversationSettlementFixture
} from "./product-app/conversation-helpers.js"

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
  productAppConversationLifecycleScenario
} from "./product-app/conversation-lifecycle-scenario.js"
export {
  declarativeCommandInputProductScenario
} from "./product-app/declarative-input-scenario.js"

export const productAppContractScenario = createEvalScenario({
  id: "product.app-shell-contract",
  title: "Product App consumes the frozen upper app integration contract",
  tags: ["product-app", "upper-app", "product-path"],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-product-app-"
    })
    const app = await createProductAppShell({
      storage: storage.storage,
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
      const initialSettlement = storage.settlements.waitForNext({
        sessionId: "ses_eval_product_app"
      })
      const run = await app.submitConversationOperation({
        text: "eval product app turn",
        sessionId: "ses_eval_product_app"
      })
      assert(
        run.kind === "product-app.conversation-operation.found",
        "product app should return a tracked conversation receipt"
      )
      await initialSettlement
      const selected = await app.selectSession({
        sessionId: "ses_eval_product_app"
      })
      const opened = await app.openWorkbench()
      const continuedSettlement = storage.settlements.waitForNext({
        sessionId: "ses_eval_product_app"
      })
      const continued = await app.submitConversationOperation({
        text: "eval product app continued",
        sessionId: "ses_eval_product_app"
      })
      assert(
        continued.kind === "product-app.conversation-operation.found",
        "continued conversation should be admitted before settlement"
      )
      await continuedSettlement
      const refreshed = await app.openWorkbench()
      const regenerated = await app.regenerateTrackedConversationOperation({
        sessionId: "ses_eval_product_app"
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
          refreshed.kind === "product-app.workbench.opened",
        "workbench should remain a read-only canonical transcript projection"
      )
      assert(
        continued.kind === "product-app.conversation-operation.found" &&
          regenerated.kind === "product-app.conversation-operation.found",
        "conversation submit and regeneration should return tracked operations"
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
        refreshedKind: refreshed.kind,
        regeneratedKind: regenerated.kind,
        jsonStatus: json.status,
        pluginRuntime: productApp.contains.pluginRuntime,
        connectorRuntime: productApp.contains.connectorRuntime,
        concreteAdapters: productApp.contains.concreteAdapters,
        forbiddenPackages: productApp.contains.forbiddenPackages
      }
    } finally {
      await app.dispose()
      await storage.dispose()
    }
  }
})

export const productAppSurfaceContractScenario = createEvalScenario({
  id: "product.app-surface-contract",
  title: "Product App exposes a transport-neutral surface adapter",
  tags: ["product-app", "surface", "upper-app", "product-path"],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-product-app-surface-"
    })
    const app = await createProductAppShell({
      storage: storage.storage,
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
      const conversationSettlement = storage.settlements.waitForNext({
        sessionId: "ses_eval_product_app_surface_direct"
      })
      const submitted = await surface.dispatchSurfaceCommand({
        command: "submitConversationOperation",
        requestId: "eval_surface_submit",
        input: {
          text: "eval surface submitted",
          sessionId: "ses_eval_product_app_surface_direct"
        }
      })
      assert(
        submitted.ok &&
          isRecord(submitted.value) &&
          submitted.value.kind === "product-app.conversation-operation.found",
        "surface should return an asynchronous conversation receipt"
      )
      await conversationSettlement
      const run = await surface.dispatchSurfaceCommand({
        command: "dispatchProductCommand",
        requestId: "eval_surface_run",
        input: {
          command: "status"
        }
      })
      const opened = await surface.dispatchSurfaceCommand({
        command: "openWorkbench",
        requestId: "eval_surface_open",
        input: {
          sessionId: "ses_eval_product_app_surface_direct"
        }
      })
      const operation = await surface.dispatchSurfaceCommand({
        command: "readTrackedConversationOperation",
        requestId: "eval_surface_operation",
        input: {
          sessionId: "ses_eval_product_app_surface_direct"
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
          descriptor.commandCount === 23,
        "surface descriptor should be transport-neutral and complete"
      )
      assert(
        !descriptor.rendererBoundary.rendererMayOpenStorage &&
          !descriptor.rendererBoundary.rendererMayReceiveStorePath &&
          !descriptor.rendererBoundary.rendererMayReceiveServiceBinaryPath,
        "surface descriptor should preserve renderer isolation"
      )
      assert(run.ok, "surface should dispatch a generic product command")
      assert(
        opened.ok &&
          isRecord(opened.value) &&
          opened.value.kind === "product-app.workbench.opened",
        "surface should open workbench"
      )
      assert(
        operation.ok &&
          isRecord(operation.value) &&
          operation.value.kind === "product-app.conversation-operation.found",
        "surface should read the durable tracked conversation operation"
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
        submittedKind: isRecord(submitted.value) ? submitted.value.kind : null,
        openedKind: isRecord(opened.value) ? opened.value.kind : null,
        operationKind: isRecord(operation.value) ? operation.value.kind : null,
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
      await surface.dispose()
      await app.dispose()
      await storage.dispose()
    }
  }
})
