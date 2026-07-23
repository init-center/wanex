import { rm } from "node:fs/promises"
import {
  createProductAppShell,
  createProductAppSurfaceAdapter
} from "@wanex/product-app"
import {
  createMessageProductAppSurfaceClientTransport,
  createProductAppSurfaceClient,
  handleProductAppSurfaceTransportRequest
} from "@wanex/product-app/surface-client"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "../distribution-audit.js"
import { createEvalScenario } from "../runner.js"
import { assert, isRecord } from "../scenario-utils.js"
import { mktemp } from "../product-bootstrap/helpers.js"
import { waitForSurfaceConversation } from "./conversation-helpers.js"

export const productAppSurfaceMessageTransportScenario = createEvalScenario({
  id: "product.app-surface-message-transport-contract",
  title: "Product App surface runs through the message transport contract",
  tags: [
    "product-app",
    "surface",
    "surface-client",
    "message-transport",
    "upper-app",
    "product-path"
  ],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-product-app-message-transport-")
    const app = await createProductAppShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: context.serviceBin
      },
      providerProfile: {
        id: "eval-product-app-message-transport",
        modelId: "eval-product-app-message-transport-model"
      }
    })
    const surface = createProductAppSurfaceAdapter(app, {
      now: () => 9650
    })
    const messages: unknown[] = []
    const client = createProductAppSurfaceClient(
      createMessageProductAppSurfaceClientTransport(async (request) => {
        messages.push(request)
        return await handleProductAppSurfaceTransportRequest(surface, request)
      })
    )

    try {
      const descriptor = await client.descriptor()
      const commandCatalog = await client.readProductCommands({
        requestId: "eval_message_transport_commands"
      })
      const typedExecution = await client.executeProductCommand(
        { commandId: "product.status" },
        { requestId: "eval_message_transport_execute" }
      )
      const submitted = await client.submitConversationOperation(
        {
          text: "eval message transport submitted",
          sessionId: "ses_eval_product_app_message_transport_direct"
        },
        { requestId: "eval_message_transport_submit" }
      )
      await waitForSurfaceConversation(
        client,
        "ses_eval_product_app_message_transport_direct"
      )
      const run = await client.dispatchProductCommand(
        {
          command: "status"
        },
        { requestId: "eval_message_transport_run" }
      )
      const opened = await client.openWorkbench({
        sessionId: "ses_eval_product_app_message_transport_direct"
      })
      const operation = await client.readTrackedConversationOperation(
        { sessionId: "ses_eval_product_app_message_transport_direct" },
        { requestId: "eval_message_transport_operation" }
      )
      const events = await client.readSurfaceEvents({ limit: 2 })
      const rejected = await handleProductAppSurfaceTransportRequest(surface, {
        kind: "product-app.surface-transport.request",
        operation: "dispatchSurfaceCommand",
        requestId: "eval_message_transport_bad"
      })
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const productApp = entryByName(footprint, "@wanex/product-app")
      const messageOperations = messages.map((message) =>
        readRecordString(message, "operation")
      )

      assert(
        descriptor.ok &&
          descriptor.value.kind === "product-app.surface-descriptor" &&
          descriptor.value.commandCount === 23,
        "message transport should read the surface descriptor"
      )
      assert(
        commandCatalog.ok &&
          commandCatalog.value.commands.some(
            (command) => command.id === "product.agent.submit"
          ),
        "message transport should read the typed product command catalog"
      )
      assert(
        typedExecution.ok &&
          typedExecution.value.kind === "completed" &&
          typedExecution.value.commandId === "product.status",
        "message transport should execute a typed product command"
      )
      assert(
        submitted.ok &&
          isRecord(submitted.value) &&
          submitted.value.kind === "product-app.conversation-operation.found",
        "message transport should submit a tracked conversation operation"
      )
      assert(run.ok, "message transport should dispatch product command")
      assert(
        opened.ok &&
          isRecord(opened.value) &&
          opened.value.kind === "product-app.workbench.opened",
        "message transport should open workbench"
      )
      assert(
        operation.ok &&
          isRecord(operation.value) &&
          operation.value.kind === "product-app.conversation-operation.found",
        "message transport should read durable conversation progress"
      )
      assert(
        events.ok &&
          events.events.some(
            (event) => event.type === "product-app.surface.state_changed"
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
            message.kind === "product-app.surface-transport.request"
        ),
        "message transport should use the frozen request envelope"
      )
      assert(
        !productApp.contains.pluginRuntime &&
          !productApp.contains.connectorRuntime &&
          productApp.contains.concreteAdapters.length === 0 &&
          productApp.contains.forbiddenPackages.length === 0,
        "message transport should not change Product App distribution closure"
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
              (event) => event.type === "product-app.surface.state_changed"
            )
          : false,
        rejectedCategory: rejected.ok ? null : rejected.error.category,
        messageOperations,
        pluginRuntime: productApp.contains.pluginRuntime,
        connectorRuntime: productApp.contains.connectorRuntime,
        concreteAdapters: productApp.contains.concreteAdapters,
        forbiddenPackages: productApp.contains.forbiddenPackages
      }
    } finally {
      await surface.dispose()
      await app.dispose()
      await rm(storeDir, { recursive: true, force: true })
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
