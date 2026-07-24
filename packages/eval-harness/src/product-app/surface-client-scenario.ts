import {
  createProductAppShell,
  createProductAppSurfaceAdapter
} from "@wanex/product-app"
import {
  createInProcessProductAppSurfaceClientTransport,
  createProductAppSurfaceClient
} from "@wanex/product-app/surface-client"
import { createEvalScenario } from "../runner.js"
import { assert, isRecord } from "../scenario-utils.js"
import {
  createConversationSettlementFixture
} from "./conversation-helpers.js"

export const productAppSurfaceClientContractScenario = createEvalScenario({
  id: "product.app-surface-client-contract",
  title: "Product App surface client consumes the transport-neutral surface",
  tags: ["product-app", "surface", "surface-client", "upper-app", "product-path"],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-product-app-surface-client-"
    })
    const app = await createProductAppShell({
      storage: storage.storage,
      providerProfile: {
        id: "eval-product-app-surface-client",
        modelId: "eval-product-app-surface-client-model"
      }
    })
    const surface = createProductAppSurfaceAdapter(app, {
      now: () => 9600
    })
    const client = createProductAppSurfaceClient(
      createInProcessProductAppSurfaceClientTransport(surface)
    )

    try {
      const descriptor = await client.descriptor()
      const settings = await client.readSettings({
        requestId: "eval_surface_client_settings"
      })
      const commandCatalog = await client.readProductCommands({
        requestId: "eval_surface_client_commands"
      })
      const typedExecution = await client.executeProductCommand(
        { commandId: "product.status" },
        { requestId: "eval_surface_client_execute" }
      )
      const conversationSettlement = storage.settlements.waitForNext({
        sessionId: "ses_eval_product_app_surface_client_direct"
      })
      const submitted = await client.submitConversationOperation(
        {
          text: "eval surface client submitted",
          sessionId: "ses_eval_product_app_surface_client_direct"
        },
        { requestId: "eval_surface_client_submit" }
      )
      assert(
        submitted.ok &&
          submitted.value.kind ===
            "product-app.conversation-operation.found",
        "surface client should submit a tracked conversation operation"
      )
      await conversationSettlement
      const run = await client.dispatchProductCommand(
        {
          command: "status"
        },
        { requestId: "eval_surface_client_run" }
      )
      const opened = await client.openWorkbench({
        sessionId: "ses_eval_product_app_surface_client_direct"
      })
      const operation = await client.readTrackedConversationOperation(
        { sessionId: "ses_eval_product_app_surface_client_direct" },
        { requestId: "eval_surface_client_operation" }
      )
      const malformedClient = createProductAppSurfaceClient({
        descriptor: () => ({ broken: true }) as never,
        dispatchSurfaceCommand: () => ({ ok: true, command: "status" }) as never,
        readSurfaceEvents: () => [{ missing: "event fields" }] as never
      })
      const malformedStatus = await malformedClient.status({
        requestId: "eval_surface_client_bad"
      })
      const events = await client.readSurfaceEvents({ limit: 2 })

      assert(
        descriptor.ok &&
          descriptor.value.kind === "product-app.surface-descriptor" &&
          descriptor.value.commandCount === 23,
        "surface client should read the surface descriptor"
      )
      assert(
        settings.ok &&
          settings.value.kind === "product-app.settings" &&
          settings.value.profile.activeProviderProfileId ===
            "eval-product-app-surface-client" &&
          !settings.value.privacy.exposesStorePath,
        "surface client should read safe settings"
      )
      assert(
        commandCatalog.ok &&
          commandCatalog.command === "readProductCommands" &&
          commandCatalog.value.commands.some(
            (command) => command.id === "product.agent.submit"
          ) &&
          commandCatalog.value.diagnostics.length === 0,
        "surface client should read the typed product command catalog"
      )
      assert(
        typedExecution.ok &&
          typedExecution.value.kind === "completed" &&
          typedExecution.value.commandId === "product.status",
        "surface client should execute a typed product command"
      )
      assert(run.ok, "surface client should dispatch product command")
      assert(
        opened.ok &&
          isRecord(opened.value) &&
          opened.value.kind === "product-app.workbench.opened",
        "surface client should open workbench"
      )
      assert(
        operation.ok &&
          isRecord(operation.value) &&
          operation.value.kind === "product-app.conversation-operation.found",
        "surface client should read durable conversation progress"
      )
      assert(
        !malformedStatus.ok &&
          malformedStatus.error.code === "invalid_transport_response",
        "surface client should normalize malformed transport responses"
      )
      assert(
        events.ok &&
          events.events.some(
            (event) => event.type === "product-app.surface.state_changed"
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
            (command) => command.id === "product.agent.submit"
          ),
        typedExecutionKind: typedExecution.ok
          ? typedExecution.value.kind
          : null,
        typedExecutionCommandId: typedExecution.ok
          ? typedExecution.value.commandId
          : null,
        activeProviderProfileId: settings.ok
          ? settings.value.profile.activeProviderProfileId
          : null,
        submittedKind:
          submitted.ok && isRecord(submitted.value) ? submitted.value.kind : null,
        openedKind: opened.ok && isRecord(opened.value) ? opened.value.kind : null,
        operationKind:
          operation.ok && isRecord(operation.value) ? operation.value.kind : null,
        malformedCode: malformedStatus.ok ? null : malformedStatus.error.code,
        eventCount: events.ok ? events.events.length : null,
        stateChanged: events.ok
          ? events.events.some(
              (event) => event.type === "product-app.surface.state_changed"
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
