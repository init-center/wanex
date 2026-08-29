import { rm } from "node:fs/promises"
import {
  createShell,
  createSurfaceAdapter
} from "@wanex/assistant"
import {
  createTuiHostSurfaceClient,
  createTuiSurface
} from "@wanex/tui"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "../distribution-audit.js"
import { createEvalScenario } from "../runner.js"
import { assert, evalFakeModelEndpoint } from "../scenario-utils.js"
import { mktemp } from "../assistant-bootstrap/helpers.js"

export const tuiHostMessageTransportScenario = createEvalScenario({
  id: "assistant.app-tui-host-message-transport-contract",
  title: "TUI host creates its surface client through message transport",
  tags: [
    "assistant",
    "tui",
    "surface-client",
    "message-transport",
    "upper-app",
    "assistant-path"
  ],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-tui-host-message-")
    const app = await createShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: context.serviceBin
      },
      modelEndpoint: evalFakeModelEndpoint(
        "eval-tui-host-message",
        "eval-tui-host-message-model"
      )
    })
    const assistantSurface = createSurfaceAdapter(app, {
      now: () => 9900
    })
    const operations: string[] = []
    const client = createTuiHostSurfaceClient({
      surface: assistantSurface,
      observeRequest(request) {
        operations.push(request.operation)
      }
    })

    try {
      const surface = await createTuiSurface({
        client,
        now: () => 9901
      })
      const status = await surface.client.status({
        requestId: "eval_assistant_app_tui_host_status"
      })
      const events = await surface.client.readSurfaceEvents({ limit: 2 })
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const tui = entryByName(footprint, "@wanex/tui")
      const snapshot = surface.snapshot()
      const descriptor = snapshot.descriptor

      assert(
        descriptor.ok &&
          descriptor.value.commandCount === descriptor.value.commands.length &&
          descriptor.value.commands.some(
            (command) => command.command === "queueGuidedFollowUp"
          ) &&
          descriptor.value.commands.some(
            (command) => command.command === "steerTrackedConversationOperation"
          ),
        "TUI host message client should initialize the TUI surface"
      )
      assert(
        status.ok &&
          status.event.requestId === "eval_assistant_app_tui_host_status",
        "TUI host message client should dispatch commands"
      )
      assert(
        events.ok &&
          events.events.some(
            (event) => event.type === "assistant.surface.command_completed"
          ),
        "TUI host message client should read surface events"
      )
      assert(
        operations.includes("descriptor") &&
          operations.includes("dispatchSurfaceCommand") &&
          operations.includes("readSurfaceEvents"),
        "TUI host should use the message transport operations"
      )
      assert(
        !tui.contains.pluginRuntime &&
          !tui.contains.connectorRuntime &&
          tui.contains.concreteAdapters.length === 0 &&
          tui.contains.forbiddenPackages.length === 0,
        "TUI host message transport should not change distribution closure"
      )

      return {
        descriptorOk: descriptor.ok,
        commandCount: descriptor.ok ? descriptor.value.commandCount : null,
        statusOk: status.ok,
        eventCount: events.ok ? events.events.length : null,
        operations,
        tuiPluginRuntime: tui.contains.pluginRuntime,
        tuiConnectorRuntime: tui.contains.connectorRuntime,
        tuiConcreteAdapters: tui.contains.concreteAdapters
      }
    } finally {
      await app.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})
