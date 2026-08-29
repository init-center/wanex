import {
  createShell,
  createSurfaceAdapter
} from "@wanex/assistant"
import {
  createMessageSurfaceClientTransport,
  createSurfaceClient,
  createSurfaceHostEndpoint
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

export const hostEndpointContractScenario = createEvalScenario({
  id: "assistant.app-host-endpoint-contract",
  title: "assistant exposes a platform-neutral host endpoint",
  tags: [
    "assistant",
    "surface",
    "host-endpoint",
    "message-transport",
    "upper-app",
    "assistant-path"
  ],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-assistant-host-endpoint-"
    })
    const storeDir = storage.storeDir
    const app = await createShell({
      storage: storage.storage,
      modelEndpoint: evalFakeModelEndpoint(
        "eval-assistant-host-endpoint",
        "eval-assistant-host-endpoint-model"
      )
    })
    const surface = createSurfaceAdapter(app, {
      now: () => 9660
    })
    const operations: string[] = []
    const endpoint = createSurfaceHostEndpoint({
      surface,
      observeRequest(request) {
        const operation = readRecordString(request, "operation")
        if (operation !== null) {
          operations.push(operation)
        }
      }
    })
    const client = createSurfaceClient(
      createMessageSurfaceClientTransport({
        send: (request) => endpoint.send(request),
        subscribe: (listener) => endpoint.subscribe(listener)
      })
    )

    try {
      const descriptor = await client.descriptor()
      await storage.settlements.storage.createSession({
        id: "ses_eval_assistant_app_host_endpoint",
        title: "eval application host endpoint",
        kind: "agent"
      })
      const selected = await client.selectSession(
        { sessionId: "ses_eval_assistant_app_host_endpoint" },
        { requestId: "eval_host_endpoint_select" }
      )
      const conversationSettlement = storage.settlements.waitForNext({
        sessionId: "ses_eval_assistant_app_host_endpoint"
      })
      const run = await client.submitConversationOperation(
        {
          text: "eval host endpoint turn",
          sessionId: "ses_eval_assistant_app_host_endpoint"
        },
        { requestId: "eval_host_endpoint_run" }
      )
      assert(
        run.ok &&
          run.value.kind === "assistant.conversation-operation.found",
        "host endpoint should admit the conversation before settlement"
      )
      await conversationSettlement
      const opened = await client.openWorkbench()
      const events = await client.readSurfaceEvents({ limit: 2 })
      const lastSequence = events.ok ? events.latestSequence : 0
      const status = await client.status({
        requestId: "eval_host_endpoint_status_after_cursor"
      })
      const cursorEvents = await client.readSurfaceEvents({
        afterSequence: lastSequence,
        ...(events.ok ? { streamId: events.streamId } : {}),
        limit: 5
      })
      const malformed = await endpoint.send({
        kind: "assistant.surface-transport.request",
        operation: "restartGateway",
        requestId: "eval_host_endpoint_bad"
      })
      const failingEndpoint = createSurfaceHostEndpoint({
        surface,
        observeRequest() {
          throw new Error(
            `host-only failure ${storeDir} ${context.serviceBin}`
          )
        }
      })
      const failed = await failingEndpoint.send({
        kind: "assistant.surface-transport.request",
        operation: "dispatchSurfaceCommand",
        requestId: "eval_host_endpoint_failed",
        command: {
          command: "status",
          requestId: "eval_host_endpoint_failed"
        }
      })
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const assistantPackage = entryByName(footprint, "@wanex/assistant")
      const serialized = JSON.stringify([
        descriptor,
        selected,
        run,
        opened,
        events,
        status,
        cursorEvents,
        malformed,
        failed
      ])

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
        "host endpoint client should read the assistant descriptor"
      )
      assert(
        selected.ok &&
          selected.event.requestId === "eval_host_endpoint_select",
        "host endpoint client should dispatch selected-session commands"
      )
      assert(run.ok, "host endpoint client should dispatch assistant commands")
      assert(
        opened.ok &&
          isRecord(opened.value) &&
          opened.value.kind === "assistant.workbench.opened",
        "host endpoint client should open the selected workbench"
      )
      assert(
        events.ok &&
          events.events.length === 2 &&
          events.events.every((event) => event.sequence <= events.latestSequence),
        "host endpoint client should read the earliest bounded Surface event page"
      )
      assert(
        status.ok &&
          status.event.requestId === "eval_host_endpoint_status_after_cursor",
        "host endpoint client should dispatch after reading a cursor"
      )
      assert(
        cursorEvents.ok &&
          cursorEvents.events.length === 1 &&
          cursorEvents.events[0]?.command === "status" &&
          cursorEvents.events[0]?.sequence > lastSequence,
        "host endpoint client should replay events after a sequence cursor"
      )
      assert(
        !malformed.ok &&
          malformed.operation === "unknown" &&
          malformed.error.category === "validation",
        "host endpoint should fail closed for unsupported operations"
      )
      assert(
        !failed.ok &&
          failed.operation === "dispatchSurfaceCommand" &&
          failed.error.message === "surface host endpoint failed",
        "host endpoint should normalize host-only failures"
      )
      assert(
        !serialized.includes(storeDir) &&
          !serialized.includes(context.serviceBin),
        "host endpoint responses must not leak host-only paths"
      )
      assert(
        operations.includes("descriptor") &&
          operations.includes("dispatchSurfaceCommand") &&
          operations.includes("readSurfaceEvents"),
        "host endpoint should receive the message transport operations"
      )
      assert(
        !assistantPackage.contains.pluginRuntime &&
          !assistantPackage.contains.connectorRuntime &&
          assistantPackage.contains.concreteAdapters.length === 0 &&
          assistantPackage.contains.forbiddenPackages.length === 0,
        "host endpoint should not change assistant distribution closure"
      )

      return {
        descriptorKind: descriptor.ok ? descriptor.value.kind : null,
        commandCount: descriptor.ok ? descriptor.value.commandCount : null,
        selectedOk: selected.ok,
        runOk: run.ok,
        openedKind: opened.ok && isRecord(opened.value) ? opened.value.kind : null,
        eventCount: events.ok ? events.events.length : null,
        cursorEventCount: cursorEvents.ok ? cursorEvents.events.length : null,
        cursorCommands: cursorEvents.ok
          ? cursorEvents.events.map((event) => event.command)
          : [],
        malformedCategory: malformed.ok ? null : malformed.error.category,
        failedMessage: failed.ok ? null : failed.error.message,
        operations,
        leakedStoreDir: serialized.includes(storeDir),
        leakedServiceBin: serialized.includes(context.serviceBin),
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

function readRecordString(value: unknown, key: string): string | null {
  if (!isRecord(value)) {
    return null
  }
  const field = value[key]
  return typeof field === "string" ? field : null
}
