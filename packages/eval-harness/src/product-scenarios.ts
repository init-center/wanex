import {
  createShell,
  createSurfaceAdapter
} from "@wanex/product"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "./distribution-audit.js"
import { createEvalScenario } from "./runner.js"
import { assert, evalFakeModelEndpoint, isRecord } from "./scenario-utils.js"
import { createConversationSettlementFixture } from "./product/conversation-helpers.js"

export { hostEndpointContractScenario } from "./product/host-endpoint-scenario.js"
export { surfaceClientContractScenario } from "./product/surface-client-scenario.js"
export { surfaceMessageTransportScenario } from "./product/surface-message-transport-scenario.js"
export { webSurfaceContractScenario } from "./product/web-surface-scenario.js"
export { localHostContractScenario } from "./product/local-host-scenario.js"
export { localDesktopHostContractScenario } from "./product/local-desktop-host-scenario.js"
export { feedbackMatrixScenario } from "./product/feedback-matrix-scenario.js"
export { conversationLifecycleScenario } from "./product/conversation-lifecycle-scenario.js"
export { recoveryReviewScenario } from "./product/recovery-review-scenario.js"
export { toolApprovalJourneyScenario } from "./product/tool-approval-journey-scenario.js"
export { guidedFollowUpScenario } from "./product/guided-follow-up-scenario.js"
export { sameTurnSteeringScenario } from "./product/same-turn-steering-scenario.js"
export { sideQueryScenario } from "./product/side-query-scenario.js"
export { planJourneyScenario } from "./product/plan-journey-scenario.js"
export { goalJourneyScenario } from "./product/goal-journey-scenario.js"
export { capabilitySetupContinuationScenario } from "./product/capability-setup-continuation-scenario.js"
export { longSessionContinuityScenario } from "./product/long-session-continuity-scenario.js"
export { declarativeCommandInputProductScenario } from "./product/declarative-input-scenario.js"

export const contractScenario = createEvalScenario({
  id: "product.app-shell-contract",
  title: "product consumes the frozen upper app integration contract",
  tags: ["product", "upper-app", "product-path"],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-product-"
    })
    const app = await createShell({
      storage: storage.storage,
      modelEndpoint: evalFakeModelEndpoint(
        "eval-product",
        "eval-product-model"
      ),
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
        text: "eval application turn",
        sessionId: "ses_eval_product_app"
      })
      assert(
        run.kind === "product.conversation-operation.found",
        "application should return a tracked conversation receipt"
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
        text: "eval application continued",
        sessionId: "ses_eval_product_app"
      })
      assert(
        continued.kind === "product.conversation-operation.found",
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
      const productPackage = entryByName(footprint, "@wanex/product")

      assert(
        home.kind === "product.home",
        "home should be application state"
      )
      assert(
        settings.kind === "product.settings" &&
          settings.profile.activeModelEndpointId === "eval-product" &&
          !settings.privacy.exposesStorePath &&
          !settings.privacy.exposesServiceBinaryPath &&
          !settings.privacy.exposesSecrets,
        "settings should expose safe product-owned profile state"
      )
      assert(
        home.integration.recommendedEntryPoint === "@wanex/product",
        "application should advertise its product facade"
      )
      assert(
        !home.rendererBoundary.rendererMayOpenStorage &&
          !home.rendererBoundary.rendererMayReceiveStorePath &&
          !home.rendererBoundary.rendererMayReceiveServiceBinaryPath,
        "renderer boundary should hide storage internals"
      )
      assert(
        selected.selection?.kind === "session" &&
          selected.selection.sessionId === "ses_eval_product_app",
        "selected session should be app-owned state"
      )
      assert(
        opened.kind === "product.workbench.opened" &&
          refreshed.kind === "product.workbench.opened",
        "workbench should remain a read-only canonical transcript projection"
      )
      assert(
        continued.kind === "product.conversation-operation.found" &&
          regenerated.kind === "product.conversation-operation.found",
        "conversation submit and regeneration should return tracked operations"
      )
      assert(
        json.status === "success" && json.envelope.ok,
        "JSON adapter should dispatch through the product command port"
      )
      assert(
        !productPackage.contains.pluginRuntime &&
          !productPackage.contains.connectorRuntime &&
          productPackage.contains.concreteAdapters.length === 0 &&
          productPackage.contains.forbiddenPackages.length === 0,
        "application closure should stay slim"
      )

      return {
        entry: "@wanex/product",
        layout: home.state.layout,
        mode: home.state.mode,
        activeModelEndpointId: settings.profile.activeModelEndpointId,
        settingsPrivacySafe:
          !settings.privacy.exposesStorePath &&
          !settings.privacy.exposesServiceBinaryPath &&
          !settings.privacy.exposesSecrets,
        selectedSessionId:
          selected.selection?.kind === "session"
            ? selected.selection.sessionId
            : null,
        rendererCalls: home.rendererBoundary.rendererCalls,
        openedKind: opened.kind,
        continuedKind: continued.kind,
        refreshedKind: refreshed.kind,
        regeneratedKind: regenerated.kind,
        jsonStatus: json.status,
        pluginRuntime: productPackage.contains.pluginRuntime,
        connectorRuntime: productPackage.contains.connectorRuntime,
        concreteAdapters: productPackage.contains.concreteAdapters,
        forbiddenPackages: productPackage.contains.forbiddenPackages
      }
    } finally {
      await app.dispose()
      await storage.dispose()
    }
  }
})

export const surfaceContractScenario = createEvalScenario({
  id: "product.app-surface-contract",
  title: "product exposes a transport-neutral surface adapter",
  tags: ["product", "surface", "upper-app", "product-path"],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-product-surface-"
    })
    const app = await createShell({
      storage: storage.storage,
      modelEndpoint: evalFakeModelEndpoint(
        "eval-product-surface",
        "eval-product-surface-model"
      )
    })
    const surface = createSurfaceAdapter(app, {
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
          submitted.value.kind === "product.conversation-operation.found",
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
      const events = surface.readSurfaceEvents().events
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const productPackage = entryByName(footprint, "@wanex/product")

      assert(
        descriptor.transport === "app-owned-ipc-or-api" &&
          descriptor.commandCount === descriptor.commands.length &&
          descriptor.commands.some(
            (command) => command.command === "queueGuidedFollowUp"
          ) &&
          descriptor.commands.some(
            (command) => command.command === "steerTrackedConversationOperation"
          ),
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
          opened.value.kind === "product.workbench.opened",
        "surface should open workbench"
      )
      assert(
        operation.ok &&
          isRecord(operation.value) &&
          operation.value.kind === "product.conversation-operation.found",
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
          (event) => event.type === "product.surface.state_changed"
        ),
        "surface should record app state change events"
      )
      assert(
        !productPackage.contains.pluginRuntime &&
          !productPackage.contains.connectorRuntime &&
          productPackage.contains.concreteAdapters.length === 0,
        "application surface should not change distribution closure"
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
          (event) => event.type === "product.surface.state_changed"
        ),
        pluginRuntime: productPackage.contains.pluginRuntime,
        connectorRuntime: productPackage.contains.connectorRuntime,
        concreteAdapters: productPackage.contains.concreteAdapters
      }
    } finally {
      await surface.dispose()
      await app.dispose()
      await storage.dispose()
    }
  }
})
