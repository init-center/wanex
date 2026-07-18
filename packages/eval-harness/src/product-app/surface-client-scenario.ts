import { rm } from "node:fs/promises"
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
import { mktemp } from "../product-bootstrap/helpers.js"

export const productAppSurfaceClientContractScenario = createEvalScenario({
  id: "product.app-surface-client-contract",
  title: "Product App surface client consumes the transport-neutral surface",
  tags: ["product-app", "surface", "surface-client", "upper-app", "product-path"],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-product-app-surface-client-")
    const app = await createProductAppShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: context.serviceBin
      },
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
      const started = await client.startWorkbench(
        {
          text: "eval surface client started"
        },
        { requestId: "eval_surface_client_start" }
      )
      const run = await client.dispatchProductCommand(
        {
          command: "runAgentTurn",
          input: {
            text: "eval surface client turn",
            sessionId: "ses_eval_product_app_surface_client"
          }
        },
        { requestId: "eval_surface_client_run" }
      )
      const opened = await client.openWorkbench({
        sessionId: "ses_eval_product_app_surface_client"
      })
      const continued = await client.continueWorkbench(
        {
          text: "eval surface client continued"
        },
        { requestId: "eval_surface_client_continue" }
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
          descriptor.value.commandCount === 18,
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
            (command) => command.id === "product.agent.run"
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
      assert(
        started.ok &&
          isRecord(started.value) &&
          started.value.kind === "product-app.workbench.started",
        "surface client should start workbench"
      )
      assert(run.ok, "surface client should dispatch product command")
      assert(
        opened.ok &&
          isRecord(opened.value) &&
          opened.value.kind === "product-app.workbench.opened",
        "surface client should open workbench"
      )
      assert(
        continued.ok &&
          isRecord(continued.value) &&
          continued.value.kind === "product-app.workbench.continued",
        "surface client should continue workbench"
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
        hasAgentCommand:
          commandCatalog.ok &&
          commandCatalog.value.commands.some(
            (command) => command.id === "product.agent.run"
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
        startedKind:
          started.ok && isRecord(started.value) ? started.value.kind : null,
        openedKind: opened.ok && isRecord(opened.value) ? opened.value.kind : null,
        continuedKind:
          continued.ok && isRecord(continued.value) ? continued.value.kind : null,
        malformedCode: malformedStatus.ok ? null : malformedStatus.error.code,
        eventCount: events.ok ? events.events.length : null,
        stateChanged: events.ok
          ? events.events.some(
              (event) => event.type === "product-app.surface.state_changed"
            )
          : false
      }
    } finally {
      await app.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})
