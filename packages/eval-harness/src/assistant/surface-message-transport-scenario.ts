import {
  createShell,
  createSurfaceAdapter
} from "@wanex/assistant"
import {
  createMessageSurfaceClientTransport,
  createSurfaceClient,
  handleSurfaceTransportRequest
} from "@wanex/assistant/surface"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "../distribution-audit.js"
import { createEvalScenario } from "../runner.js"
import { assert, evalFakeModelEndpoint, isRecord } from "../scenario-utils.js"
import {
  createConversationSettlementFixture
} from "./conversation-helpers.js"

export const surfaceMessageTransportScenario = createEvalScenario({
  id: "assistant.app-surface-message-transport-contract",
  title: "assistant surface runs through the message transport contract",
  tags: [
    "assistant",
    "surface",
    "surface-client",
    "message-transport",
    "upper-app",
    "assistant-path"
  ],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-assistant-message-transport-"
    })
    const app = await createShell({
      storage: storage.storage,
      modelEndpoint: evalFakeModelEndpoint(
        "eval-assistant-message-transport",
        "eval-assistant-message-transport-model"
      )
    })
    const surface = createSurfaceAdapter(app, {
      now: () => 9650
    })
    const messages: unknown[] = []
    const client = createSurfaceClient(
      createMessageSurfaceClientTransport({
        async send(request) {
          messages.push(request)
          return await handleSurfaceTransportRequest(surface, request)
        },
        subscribe(listener) {
          return surface.subscribeSurfaceEvents(listener)
        }
      })
    )

    try {
      const descriptor = await client.descriptor()
      const commandCatalog = await client.readAssistantCommands({
        requestId: "eval_message_transport_commands"
      })
      const typedExecution = await client.executeAssistantCommand(
        { commandId: "assistant.status" },
        { requestId: "eval_message_transport_execute" }
      )
      const conversationSettlement = storage.settlements.waitForNext({
        sessionId: "ses_eval_assistant_app_message_transport_direct"
      })
      const submitted = await client.submitConversationOperation(
        {
          text: "eval message transport submitted",
          sessionId: "ses_eval_assistant_app_message_transport_direct"
        },
        { requestId: "eval_message_transport_submit" }
      )
      assert(
        submitted.ok &&
          submitted.value.kind ===
            "assistant.conversation-operation.found",
        "message transport should submit a tracked conversation operation"
      )
      await conversationSettlement
      const run = await client.dispatchAssistantCommand(
        {
          command: "status"
        },
        { requestId: "eval_message_transport_run" }
      )
      const opened = await client.openWorkbench({
        sessionId: "ses_eval_assistant_app_message_transport_direct"
      })
      const operation = await client.readTrackedConversationOperation(
        { sessionId: "ses_eval_assistant_app_message_transport_direct" },
        { requestId: "eval_message_transport_operation" }
      )
      const events = await client.readSurfaceEvents({ limit: 64 })
      const rejected = await handleSurfaceTransportRequest(surface, {
        kind: "assistant.surface-transport.request",
        operation: "dispatchSurfaceCommand",
        requestId: "eval_message_transport_bad"
      })
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const assistantPackage = entryByName(footprint, "@wanex/assistant")
      const messageOperations = messages.map((message) =>
        readRecordString(message, "operation")
      )

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
        "message transport should read the surface descriptor"
      )
      assert(
        commandCatalog.ok &&
          commandCatalog.value.commands.some(
            (command) => command.id === "assistant.agent.submit"
          ),
        "message transport should read the typed assistant command catalog"
      )
      assert(
        typedExecution.ok &&
          typedExecution.value.kind === "completed" &&
          typedExecution.value.commandId === "assistant.status",
        "message transport should execute a typed assistant command"
      )
      assert(run.ok, "message transport should dispatch assistant command")
      assert(
        opened.ok &&
          isRecord(opened.value) &&
          opened.value.kind === "assistant.workbench.opened",
        "message transport should open workbench"
      )
      assert(
        operation.ok &&
          isRecord(operation.value) &&
          operation.value.kind === "assistant.conversation-operation.found",
        "message transport should read durable conversation progress"
      )
      assert(
        events.ok &&
          events.events.some(
            (event) => event.type === "assistant.surface.state_changed"
          ),
        "message transport should read state change events"
      )
      assert(
        !rejected.ok &&
          rejected.operation === "dispatchSurfaceCommand" &&
          rejected.error.category === "validation",
        "message transport should fail closed for malformed messages"
      )
      assert(
        messages.every(
          (message) =>
            isRecord(message) &&
            message.kind === "assistant.surface-transport.request"
        ),
        "message transport should use the frozen request envelope"
      )
      assert(
        !assistantPackage.contains.pluginRuntime &&
          !assistantPackage.contains.connectorRuntime &&
          assistantPackage.contains.concreteAdapters.length === 0 &&
          assistantPackage.contains.forbiddenPackages.length === 0,
        "message transport should not change assistant distribution closure"
      )

      return {
        descriptorKind: descriptor.ok ? descriptor.value.kind : null,
        commandCount: descriptor.ok ? descriptor.value.commandCount : null,
        commandCatalogCount: commandCatalog.ok
          ? commandCatalog.value.commands.length
          : null,
        typedExecutionKind: typedExecution.ok
          ? typedExecution.value.kind
          : null,
        typedExecutionCommandId: typedExecution.ok
          ? typedExecution.value.commandId
          : null,
        runOk: run.ok,
        submittedKind:
          submitted.ok && isRecord(submitted.value) ? submitted.value.kind : null,
        openedKind: opened.ok && isRecord(opened.value) ? opened.value.kind : null,
        operationKind:
          operation.ok && isRecord(operation.value) ? operation.value.kind : null,
        eventCount: events.ok ? events.events.length : null,
        stateChanged: events.ok
          ? events.events.some(
              (event) => event.type === "assistant.surface.state_changed"
            )
          : false,
        rejectedCategory: rejected.ok ? null : rejected.error.category,
        messageOperations,
        pluginRuntime: assistantPackage.contains.pluginRuntime,
        connectorRuntime: assistantPackage.contains.connectorRuntime,
        concreteAdapters: assistantPackage.contains.concreteAdapters,
        forbiddenPackages: assistantPackage.contains.forbiddenPackages
      }
    } finally {
      await surface.dispose()
      await app.dispose()
      await storage.dispose()
    }
  }
})

function readRecordString(value: unknown, key: string): string | null {
  if (!isRecord(value)) {
    return null
  }
  const field = value[key]
  return typeof field === "string" ? field : null
}
