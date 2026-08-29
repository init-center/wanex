import {
  createShell,
  createSurfaceAdapter
} from "@wanex/assistant"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "./distribution-audit.js"
import { createEvalScenario } from "./runner.js"
import { assert, evalFakeModelEndpoint, isRecord } from "./scenario-utils.js"
import { createConversationSettlementFixture } from "./assistant/conversation-helpers.js"

export { hostEndpointContractScenario } from "./assistant/host-endpoint-scenario.js"
export { surfaceClientContractScenario } from "./assistant/surface-client-scenario.js"
export { surfaceMessageTransportScenario } from "./assistant/surface-message-transport-scenario.js"
export { webSurfaceContractScenario } from "./assistant/web-surface-scenario.js"
export { assistantHostContractScenario } from "./assistant/assistant-host-scenario.js"
export { assistantDesktopHostContractScenario } from "./assistant/assistant-desktop-host-scenario.js"
export { feedbackMatrixScenario } from "./assistant/feedback-matrix-scenario.js"
export { conversationLifecycleScenario } from "./assistant/conversation-lifecycle-scenario.js"
export { recoveryReviewScenario } from "./assistant/recovery-review-scenario.js"
export { toolApprovalJourneyScenario } from "./assistant/tool-approval-journey-scenario.js"
export { guidedFollowUpScenario } from "./assistant/guided-follow-up-scenario.js"
export { sameTurnSteeringScenario } from "./assistant/same-turn-steering-scenario.js"
export { sideQueryScenario } from "./assistant/side-query-scenario.js"
export { planJourneyScenario } from "./assistant/plan-journey-scenario.js"
export { goalJourneyScenario } from "./assistant/goal-journey-scenario.js"
export { capabilitySetupContinuationScenario } from "./assistant/capability-setup-continuation-scenario.js"
export { longSessionContinuityScenario } from "./assistant/long-session-continuity-scenario.js"
export { declarativeCommandInputAssistantScenario } from "./assistant/declarative-input-scenario.js"

export const contractScenario = createEvalScenario({
  id: "assistant.app-shell-contract",
  title: "assistant consumes the frozen upper app integration contract",
  tags: ["assistant", "upper-app", "assistant-path"],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-assistant-"
    })
    const app = await createShell({
      storage: storage.storage,
      modelEndpoint: evalFakeModelEndpoint(
        "eval-assistant",
        "eval-assistant-model"
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
        sessionId: "ses_eval_assistant_app"
      })
      const run = await app.submitConversationOperation({
        text: "eval application turn",
        sessionId: "ses_eval_assistant_app"
      })
      assert(
        run.kind === "assistant.conversation-operation.found",
        "application should return a tracked conversation receipt"
      )
      await initialSettlement
      const selected = await app.selectSession({
        sessionId: "ses_eval_assistant_app"
      })
      const opened = await app.openWorkbench()
      const continuedSettlement = storage.settlements.waitForNext({
        sessionId: "ses_eval_assistant_app"
      })
      const continued = await app.submitConversationOperation({
        text: "eval application continued",
        sessionId: "ses_eval_assistant_app"
      })
      assert(
        continued.kind === "assistant.conversation-operation.found",
        "continued conversation should be admitted before settlement"
      )
      await continuedSettlement
      const refreshed = await app.openWorkbench()
      const regenerated = await app.regenerateTrackedConversationOperation({
        sessionId: "ses_eval_assistant_app"
      })
      const json = await app.dispatchAssistantCommandJson(
        JSON.stringify({ command: "status" })
      )
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const assistantPackage = entryByName(footprint, "@wanex/assistant")

      assert(
        home.kind === "assistant.home",
        "home should be application state"
      )
      assert(
        settings.kind === "assistant.settings" &&
          settings.profile.activeModelEndpointId === "eval-assistant" &&
          !settings.privacy.exposesStorePath &&
          !settings.privacy.exposesServiceBinaryPath &&
          !settings.privacy.exposesSecrets,
        "settings should expose safe assistant-owned profile state"
      )
      assert(
        home.integration.recommendedEntryPoint === "@wanex/assistant",
        "application should advertise its assistant facade"
      )
      assert(
        !home.rendererBoundary.rendererMayOpenStorage &&
          !home.rendererBoundary.rendererMayReceiveStorePath &&
          !home.rendererBoundary.rendererMayReceiveServiceBinaryPath,
        "renderer boundary should hide storage internals"
      )
      assert(
        selected.selection?.kind === "session" &&
          selected.selection.sessionId === "ses_eval_assistant_app",
        "selected session should be app-owned state"
      )
      assert(
        opened.kind === "assistant.workbench.opened" &&
          refreshed.kind === "assistant.workbench.opened",
        "workbench should remain a read-only canonical transcript projection"
      )
      assert(
        continued.kind === "assistant.conversation-operation.found" &&
          regenerated.kind === "assistant.conversation-operation.found",
        "conversation submit and regeneration should return tracked operations"
      )
      assert(
        json.status === "success" && json.envelope.ok,
        "JSON adapter should dispatch through the assistant command port"
      )
      assert(
        !assistantPackage.contains.pluginRuntime &&
          !assistantPackage.contains.connectorRuntime &&
          assistantPackage.contains.concreteAdapters.length === 0 &&
          assistantPackage.contains.forbiddenPackages.length === 0,
        "application closure should stay slim"
      )

      return {
        entry: "@wanex/assistant",
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
        pluginRuntime: assistantPackage.contains.pluginRuntime,
        connectorRuntime: assistantPackage.contains.connectorRuntime,
        concreteAdapters: assistantPackage.contains.concreteAdapters,
        forbiddenPackages: assistantPackage.contains.forbiddenPackages
      }
    } finally {
      await app.dispose()
      await storage.dispose()
    }
  }
})

export const surfaceContractScenario = createEvalScenario({
  id: "assistant.app-surface-contract",
  title: "assistant exposes a transport-neutral surface adapter",
  tags: ["assistant", "surface", "upper-app", "assistant-path"],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-assistant-surface-"
    })
    const app = await createShell({
      storage: storage.storage,
      modelEndpoint: evalFakeModelEndpoint(
        "eval-assistant-surface",
        "eval-assistant-surface-model"
      )
    })
    const surface = createSurfaceAdapter(app, {
      now: () => 9500
    })

    try {
      const descriptor = surface.descriptor()
      const conversationSettlement = storage.settlements.waitForNext({
        sessionId: "ses_eval_assistant_app_surface_direct"
      })
      const submitted = await surface.dispatchSurfaceCommand({
        command: "submitConversationOperation",
        requestId: "eval_surface_submit",
        input: {
          text: "eval surface submitted",
          sessionId: "ses_eval_assistant_app_surface_direct"
        }
      })
      assert(
        submitted.ok &&
          isRecord(submitted.value) &&
          submitted.value.kind === "assistant.conversation-operation.found",
        "surface should return an asynchronous conversation receipt"
      )
      await conversationSettlement
      const run = await surface.dispatchSurfaceCommand({
        command: "dispatchAssistantCommand",
        requestId: "eval_surface_run",
        input: {
          command: "status"
        }
      })
      const opened = await surface.dispatchSurfaceCommand({
        command: "openWorkbench",
        requestId: "eval_surface_open",
        input: {
          sessionId: "ses_eval_assistant_app_surface_direct"
        }
      })
      const operation = await surface.dispatchSurfaceCommand({
        command: "readTrackedConversationOperation",
        requestId: "eval_surface_operation",
        input: {
          sessionId: "ses_eval_assistant_app_surface_direct"
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
      const assistantPackage = entryByName(footprint, "@wanex/assistant")

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
      assert(run.ok, "surface should dispatch a generic assistant command")
      assert(
        opened.ok &&
          isRecord(opened.value) &&
          opened.value.kind === "assistant.workbench.opened",
        "surface should open workbench"
      )
      assert(
        operation.ok &&
          isRecord(operation.value) &&
          operation.value.kind === "assistant.conversation-operation.found",
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
          (event) => event.type === "assistant.surface.state_changed"
        ),
        "surface should record app state change events"
      )
      assert(
        !assistantPackage.contains.pluginRuntime &&
          !assistantPackage.contains.connectorRuntime &&
          assistantPackage.contains.concreteAdapters.length === 0,
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
          (event) => event.type === "assistant.surface.state_changed"
        ),
        pluginRuntime: assistantPackage.contains.pluginRuntime,
        connectorRuntime: assistantPackage.contains.connectorRuntime,
        concreteAdapters: assistantPackage.contains.concreteAdapters
      }
    } finally {
      await surface.dispose()
      await app.dispose()
      await storage.dispose()
    }
  }
})
