import {
  createShell,
  createSurfaceAdapter
} from "@wanex/assistant"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient
} from "@wanex/assistant/surface"
import { createEvalScenario } from "../runner.js"
import { assert, evalFakeModelEndpoint, isRecord } from "../scenario-utils.js"
import {
  createConversationSettlementFixture,
  assistantConversationRowText
} from "./conversation-helpers.js"

export const surfaceClientContractScenario = createEvalScenario({
  id: "assistant.app-surface-client-contract",
  title: "assistant surface client consumes the transport-neutral surface",
  tags: ["assistant", "surface", "surface-client", "upper-app", "assistant-path"],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-assistant-surface-client-"
    })
    const app = await createShell({
      storage: storage.storage,
      modelEndpoint: evalFakeModelEndpoint(
        "eval-assistant-surface-client",
        "eval-assistant-surface-client-model"
      )
    })
    const surface = createSurfaceAdapter(app, {
      now: () => 9600
    })
    const client = createSurfaceClient(
      createInProcessSurfaceClientTransport(surface)
    )

    try {
      const descriptor = await client.descriptor()
      const settings = await client.readSettings({
        requestId: "eval_surface_client_settings"
      })
      const commandCatalog = await client.readAssistantCommands({
        requestId: "eval_surface_client_commands"
      })
      const typedExecution = await client.executeAssistantCommand(
        { commandId: "assistant.status" },
        { requestId: "eval_surface_client_execute" }
      )
      const conversationSettlement = storage.settlements.waitForNext({
        sessionId: "ses_eval_assistant_app_surface_client_direct"
      })
      const submitted = await client.submitConversationOperation(
        {
          text: "eval surface client submitted",
          sessionId: "ses_eval_assistant_app_surface_client_direct"
        },
        { requestId: "eval_surface_client_submit" }
      )
      assert(
        submitted.ok &&
          submitted.value.kind ===
            "assistant.conversation-operation.found",
        "surface client should submit a tracked conversation operation"
      )
      await conversationSettlement
      const run = await client.dispatchAssistantCommand(
        {
          command: "status"
        },
        { requestId: "eval_surface_client_run" }
      )
      const opened = await client.openWorkbench({
        sessionId: "ses_eval_assistant_app_surface_client_direct"
      })
      const operation = await client.readTrackedConversationOperation(
        { sessionId: "ses_eval_assistant_app_surface_client_direct" },
        { requestId: "eval_surface_client_operation" }
      )
      const transcript = await client.readSessionTranscript(
        { sessionId: "ses_eval_assistant_app_surface_client_direct" },
        { requestId: "eval_surface_client_transcript" }
      )
      const malformedClient = createSurfaceClient({
        descriptor: () => ({ broken: true }) as never,
        dispatchSurfaceCommand: () => ({ ok: true, command: "status" }) as never,
        readSurfaceEvents: () => [{ missing: "event fields" }] as never,
        subscribeSurfaceEvents: () => () => {}
      })
      const malformedStatus = await malformedClient.status({
        requestId: "eval_surface_client_bad"
      })
      const events = await client.readSurfaceEvents({ limit: 20 })

      assert(
        descriptor.ok &&
          descriptor.value.kind === "assistant.surface-descriptor" &&
          descriptor.value.commandCount === descriptor.value.commands.length &&
          descriptor.value.commands.some(
            (command) => command.command === "queueGuidedFollowUp"
          ) &&
          descriptor.value.commands.some(
            (command) => command.command === "steerTrackedConversationOperation"
          ),
        "surface client should read the surface descriptor"
      )
      assert(
        settings.ok &&
          settings.value.kind === "assistant.settings" &&
          settings.value.profile.activeModelEndpointId ===
            "eval-assistant-surface-client" &&
          !settings.value.privacy.exposesStorePath,
        "surface client should read safe settings"
      )
      assert(
        commandCatalog.ok &&
          commandCatalog.command === "readAssistantCommands" &&
          commandCatalog.value.commands.some(
            (command) => command.id === "assistant.agent.submit"
          ) &&
          commandCatalog.value.diagnostics.length === 0,
        "surface client should read the typed assistant command catalog"
      )
      assert(
        typedExecution.ok &&
          typedExecution.value.kind === "completed" &&
          typedExecution.value.commandId === "assistant.status",
        "surface client should execute a typed assistant command"
      )
      assert(run.ok, "surface client should dispatch assistant command")
      assert(
        opened.ok &&
          isRecord(opened.value) &&
          opened.value.kind === "assistant.workbench.opened",
        "surface client should open workbench"
      )
      assert(
        operation.ok &&
          isRecord(operation.value) &&
          operation.value.kind === "assistant.conversation-operation.found",
        "surface client should read durable conversation progress"
      )
      assert(
        transcript.ok &&
          transcript.value.kind === "assistant.session-transcript.found" &&
          transcript.value.transcript.rows.some(
            (row) =>
              row.role === "user" &&
              assistantConversationRowText(row) ===
                "eval surface client submitted"
          ),
        "surface client should read the canonical session transcript"
      )
      assert(
        !malformedStatus.ok &&
          malformedStatus.error.code === "invalid_transport_response",
        "surface client should normalize malformed transport responses"
      )
      assert(
        events.ok &&
          events.events.some(
            (event) => event.type === "assistant.surface.state_changed"
          ),
        "surface client should read surface state change events"
      )

      return {
        descriptorKind: descriptor.ok ? descriptor.value.kind : null,
        commandCount: descriptor.ok ? descriptor.value.commandCount : null,
        settingsOk: settings.ok,
        commandCatalogOk: commandCatalog.ok,
        commandCatalogCount: commandCatalog.ok
          ? commandCatalog.value.commands.length
          : null,
        hasSubmitCommand:
          commandCatalog.ok &&
          commandCatalog.value.commands.some(
            (command) => command.id === "assistant.agent.submit"
          ),
        typedExecutionKind: typedExecution.ok
          ? typedExecution.value.kind
          : null,
        typedExecutionCommandId: typedExecution.ok
          ? typedExecution.value.commandId
          : null,
        activeModelEndpointId: settings.ok
          ? settings.value.profile.activeModelEndpointId
          : null,
        submittedKind:
          submitted.ok && isRecord(submitted.value) ? submitted.value.kind : null,
        openedKind: opened.ok && isRecord(opened.value) ? opened.value.kind : null,
        operationKind:
          operation.ok && isRecord(operation.value) ? operation.value.kind : null,
        transcriptKind: transcript.ok ? transcript.value.kind : null,
        transcriptRowCount:
          transcript.ok &&
          transcript.value.kind === "assistant.session-transcript.found"
            ? transcript.value.transcript.rows.length
            : null,
        malformedCode: malformedStatus.ok ? null : malformedStatus.error.code,
        eventCount: events.ok ? events.events.length : null,
        stateChanged: events.ok
          ? events.events.some(
              (event) => event.type === "assistant.surface.state_changed"
            )
          : false
      }
    } finally {
      await surface.dispose()
      await app.dispose()
      await storage.dispose()
    }
  }
})
