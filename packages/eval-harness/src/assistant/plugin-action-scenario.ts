import type { PluginInstallPlan } from "@wanex/plugin"
import { PluginRuntime } from "@wanex/plugin"
import { NativeExecutionEnvironment } from "@wanex/runtime/execution"
import {
  createAssistantPluginHost,
  parsePluginActionHandlerRef
} from "@wanex/assistant-plugin-host"
import type { SurfaceClient, SurfaceEvent } from "@wanex/assistant/surface"
import { createEvalScenario } from "../runner.js"
import {
  assert,
  evalFakeModelEndpoint,
  evalPluginInstallPlan
} from "../scenario-utils.js"
import { createEvalPluginCommandAssistant } from "./plugin-command-assistant.js"

const PLUGIN_ID = "eval.plugin.extension-echo"
const COMMAND_ID = "eval.echo"

export const extensionPluginActionAssistantPathScenario = createEvalScenario({
  id: "extension.plugin-action-assistant-path",
  title:
    "Plugin commands hot-update through the canonical Assistant event path",
  tags: ["extension", "plugin", "assistant-path"],
  async run(context) {
    const plugin = new PluginRuntime({ storage: context.storage })
    const executionEnvironment = new NativeExecutionEnvironment({
      environmentId: "native_eval_extension_plugin",
      strategy: { kind: "direct" }
    })
    let commandHost:
      | Awaited<ReturnType<typeof createAssistantPluginHost>>
      | undefined
    let assistant:
      | Awaited<ReturnType<typeof createEvalPluginCommandAssistant>>
      | undefined
    let unsubscribe: (() => void) | undefined
    try {
      commandHost = await createAssistantPluginHost({
        handle: context.handle,
        principalId: "principal_eval_extension_plugin_action",
        executionEnvironment,
        worker: {
          workerId: "worker_eval_extension_plugin_action",
          leaseMs: 60_000,
          grants: ["1.0.0", "2.0.0"].map((version) => ({
            pluginId: PLUGIN_ID,
            version,
            decision: "allow" as const,
            capabilities: ["config.read" as const]
          }))
        },
        submission: {
          maxAttempts: 2,
          retryPolicy: { strategy: "fixed", initialDelayMs: 10 }
        }
      })
      assistant = await createEvalPluginCommandAssistant({
        handle: context.handle,
        host: commandHost,
        modelEndpoint: evalFakeModelEndpoint(
          "eval-extension-assistant",
          "eval-extension-assistant-model"
        )
      })
      const events: SurfaceEvent[] = []
      const eventCount = () => events.length
      unsubscribe = assistant.client.subscribeSurfaceEvents((event) => {
        if (event.type === "assistant.surface.command-catalog.invalidated") {
          events.push(event)
        }
      })

      const initialCatalog = await assistant.client.readAssistantCommands()
      assert(initialCatalog.ok, "initial Assistant command catalog should load")
      assert(
        !initialCatalog.value.commands.some(
          (command) => command.id === COMMAND_ID
        ),
        "zero-Plugin startup should not expose the Plugin command"
      )
      assert(
        eventCount() === 0,
        "zero-Plugin startup should not emit invalidation"
      )

      await plugin.activateInstallPlan({
        plan: installPlan(context.pluginHostFixture, "1.0.0"),
        installIdempotencyKey: "eval-extension-plugin-action-install-v1"
      })
      const enabled = await commandHost.refresh()
      assert(
        enabled.status === "succeeded" && enabled.changed === true,
        "enabling v1 should publish one changed catalog generation"
      )
      assert(eventCount() === 1, "enabling v1 should emit one invalidation")
      const v1Catalog = await requireCommandVersion(assistant.client, "1.0.0")
      assert(
        events[0]?.commandCatalog?.revision === v1Catalog.revision,
        "v1 invalidation should identify the canonical Assistant generation"
      )
      const v1JobId = await executeAndComplete(
        assistant.client,
        commandHost,
        "executed by version one"
      )

      await plugin.activateInstallPlan({
        plan: installPlan(context.pluginHostFixture, "2.0.0"),
        installIdempotencyKey: "eval-extension-plugin-action-install-v2"
      })
      const replaced = await commandHost.refresh()
      assert(
        replaced.status === "succeeded" && replaced.changed === true,
        "replacing v1 with v2 should publish one changed catalog generation"
      )
      assert(
        replaced.revision !== enabled.revision,
        "exact-version replacement should change catalog revision"
      )
      assert(
        eventCount() === 2,
        "version replacement should emit one invalidation"
      )
      const v2Catalog = await requireCommandVersion(assistant.client, "2.0.0")
      assert(
        events[1]?.commandCatalog?.revision === v2Catalog.revision,
        "v2 invalidation should identify the canonical Assistant generation"
      )
      const v2JobId = await executeAndComplete(
        assistant.client,
        commandHost,
        "executed by version two"
      )

      await plugin.updateInstallState({
        pluginId: PLUGIN_ID,
        version: "2.0.0",
        expectedState: "installed",
        state: "disabled"
      })
      const disabled = await commandHost.refresh()
      assert(
        disabled.status === "succeeded" && disabled.changed === true,
        "disabling v2 should publish the empty catalog generation"
      )
      assert(eventCount() === 3, "disabling v2 should emit one invalidation")
      const disabledCatalog = await assistant.client.readAssistantCommands()
      assert(
        disabledCatalog.ok,
        "disabled Assistant command catalog should load"
      )
      assert(
        events[2]?.commandCatalog?.revision ===
          disabledCatalog.value.extensionRevision,
        "disable invalidation should identify the canonical empty generation"
      )
      assert(
        !disabledCatalog.value.commands.some(
          (command) => command.id === COMMAND_ID
        ),
        "disabled Plugin command should disappear from the canonical catalog"
      )
      const rejected = await assistant.client.executeAssistantCommand({
        commandId: COMMAND_ID,
        input: { text: "must not execute after disable" }
      })
      assert(
        rejected.ok &&
          rejected.value.kind === "rejected" &&
          rejected.value.reason === "command_not_found",
        "new execution should fail closed after the Plugin is disabled"
      )

      const identical = await commandHost.refresh()
      assert(
        identical.status === "succeeded" && identical.changed === false,
        "identical refresh should be a no-op"
      )
      assert(
        eventCount() === 3,
        "identical refresh should not emit invalidation"
      )
      assertPrivateInvalidationEvents(events)

      return {
        commandId: COMMAND_ID,
        zeroPluginStartup: true,
        enabledVersion: v1Catalog.version,
        replacementVersion: v2Catalog.version,
        disabled: true,
        rejectedAfterDisable: rejected.value.reason,
        invalidationCount: eventCount(),
        invalidationRevisions: events.map(
          (event) => event.commandCatalog?.revision ?? null
        ),
        completedJobIds: [v1JobId, v2JobId],
        hostCompletedCount: commandHost.status().completedCount
      }
    } finally {
      unsubscribe?.()
      await assistant?.dispose()
      await commandHost?.dispose()
      await executionEnvironment.close()
    }
  }
})

function installPlan(
  pluginHostFixture: string,
  version: string
): PluginInstallPlan {
  const base = evalPluginInstallPlan(pluginHostFixture)
  return {
    ...base,
    layout: {
      ...base.layout,
      pluginId: PLUGIN_ID,
      version,
      name: "Eval Extension Echo Plugin",
      contributes: {
        commands: [
          {
            id: COMMAND_ID,
            name: COMMAND_ID,
            title: "Eval Echo",
            category: "eval",
            paletteVisibility: "visible",
            actionId: "echo",
            inputSchema: {
              type: "object",
              properties: { text: { type: "string" } },
              required: ["text"],
              additionalProperties: false
            }
          }
        ]
      }
    },
    source: {
      ...base.source,
      uri: `file:///plugins/${PLUGIN_ID}/${version}`
    }
  }
}

async function requireCommandVersion(
  client: SurfaceClient,
  expectedVersion: string
): Promise<{ readonly revision: string; readonly version: string }> {
  const catalog = await client.readAssistantCommands()
  assert(
    catalog.ok,
    `Assistant command catalog should load for ${expectedVersion}`
  )
  const command = catalog.value.commands.find((item) => item.id === COMMAND_ID)
  assert(
    command !== undefined,
    `Plugin command should resolve for ${expectedVersion}`
  )
  const handler = parsePluginActionHandlerRef(command.handlerRef)
  assert(
    handler !== undefined,
    "Plugin command should preserve its typed handler ref"
  )
  assert(
    handler.pluginId === PLUGIN_ID && handler.version === expectedVersion,
    `canonical catalog should resolve ${PLUGIN_ID}@${expectedVersion}`
  )
  assert(
    catalog.value.extensionRevision !== undefined,
    "Plugin command catalog should identify its extension generation"
  )
  return { revision: catalog.value.extensionRevision, version: handler.version }
}

async function executeAndComplete(
  client: SurfaceClient,
  commandHost: Awaited<ReturnType<typeof createAssistantPluginHost>>,
  text: string
): Promise<string> {
  const execution = await client.executeAssistantCommand({
    commandId: COMMAND_ID,
    input: { text }
  })
  assert(
    execution.ok && execution.value.kind === "submitted",
    "Assistant should submit the active exact-version Plugin action"
  )
  const job = execution.value.summary.references.find(
    (reference) => reference.kind === "job"
  )
  assert(
    job !== undefined,
    "Plugin action submission should expose a job reference"
  )
  const workerResult = await commandHost.runOnce()
  assert(
    workerResult.status === "completed" && workerResult.jobId === job.id,
    "the one Plugin worker should complete the submitted action"
  )
  const activity = await client.readExecutionReference(job)
  assert(
    activity.ok &&
      activity.value.kind === "found" &&
      activity.value.activity.state === "succeeded",
    "Assistant should resolve the completed Plugin activity from the shared store"
  )
  return job.id
}

function assertPrivateInvalidationEvents(
  events: readonly SurfaceEvent[]
): void {
  const encoded = JSON.stringify(events)
  assert(
    !/eval\.echo|eval\.plugin|\/plugins\/|installRoot|trust|payload|worker|job|grant|actionId|secret/u.test(
      encoded
    ),
    "catalog invalidations must contain revision identity only"
  )
  assert(
    events.every(
      (event) =>
        event.command === "readAssistantCommands" &&
        event.commandCatalog?.kind ===
          "assistant.command-catalog.invalidated" &&
        typeof event.commandCatalog.revision === "string"
    ),
    "catalog invalidations should point consumers to the canonical reread"
  )
}
