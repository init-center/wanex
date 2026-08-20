import {
  parseAppCommandInputSchema,
} from "@wanex/extension"
import { PluginRuntime } from "@wanex/plugin"
import { createPluginCommandHost } from "@wanex/plugin-command-host"
import {
  createTuiSurface,
  runTuiLineSession
} from "@wanex/tui"
import {
  createController
} from "@wanex/web"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "../distribution-audit.js"
import { createEvalScenario } from "../runner.js"
import {
  assert,
  evalFakeModelEndpoint,
  evalPluginInstallPlan
} from "../scenario-utils.js"
import { createEvalPluginCommandProduct } from "./plugin-command-product.js"

export const declarativeCommandInputProductScenario = createEvalScenario({
  id: "product.declarative-command-input",
  title: "Declarative command input spans Web, TUI, and durable plugin execution",
  tags: ["product", "command-input", "schema", "web", "tui", "plugin"],
  async run(context) {
    const pluginId = "eval.plugin.declarative-input"
    const commandId = "eval.declarative-input"
    const plugin = new PluginRuntime({ storage: context.storage })
    const plan = evalPluginInstallPlan(context.pluginHostFixture)
    const inputSchema = {
      type: "object",
      properties: {
        text: { type: "string", minLength: 3, title: "Text" },
        count: { type: "integer", minimum: 1, maximum: 3, title: "Count" },
        mode: { type: "string", enum: ["safe", "fast"], title: "Mode" },
        tags: {
          type: "array",
          items: { type: "string" },
          maxItems: 3,
          uniqueItems: true,
          title: "Tags"
        }
      },
      required: ["text", "count", "mode"],
      additionalProperties: false
    } as const
    await plugin.activateInstallPlan({
      plan: {
        ...plan,
        layout: {
          ...plan.layout,
          pluginId,
          name: "Eval Declarative Input Plugin",
          packageName: pluginId,
          contributes: {
            commands: [{
              id: commandId,
              name: commandId,
              title: "Declarative Input",
              category: "eval",
              paletteVisibility: "visible",
              actionId: "echo",
              inputSchema
            }]
          }
        },
        source: { ...plan.source, uri: `file:///plugins/${pluginId}` }
      },
      installIdempotencyKey: "eval-declarative-input-install"
    })
    const commandHost = await createPluginCommandHost({
      handle: context.handle,
      principalId: "principal_eval_declarative_input",
      worker: {
        workerId: "worker_eval_declarative_input",
        leaseMs: 60_000,
        grants: [{
          pluginId,
          version: "1.0.0",
          decision: "allow",
          capabilities: ["config.read"]
        }]
      },
      submission: {
        maxAttempts: 2,
        retryPolicy: { strategy: "fixed", initialDelayMs: 10 }
      }
    })
    const product = await createEvalPluginCommandProduct({
      handle: context.handle,
      host: commandHost,
      modelEndpoint: evalFakeModelEndpoint(
        "eval-declarative-input-provider",
        "eval-declarative-input-model"
      )
    })
    const productClient = product.client

    try {
      const catalog = await productClient.readProductCommands()
      assert(catalog.ok, "declarative command catalog should be readable")
      const command = catalog.value.commands.find((item) => item.id === commandId)
      assert(
        command?.inputSchema?.required?.join(",") === "count,mode,text",
        "catalog should preserve normalized declarative input schema"
      )

      const web = await createController({
        client: productClient,
        now: () => 74_100
      })
      const workbenchMode = await web.dispatchAction({
        type: "set-mode",
        input: {
          mode: "workbench"
        }
      })
      assert(
        workbenchMode.ok &&
          workbenchMode.snapshot.view.mode === "workbench",
        "Web declarative input scenario should explicitly enter workbench mode"
      )

      const invalid = await web.dispatchAction({
        type: "preview-command",
        input: {
          commandId,
          input: { count: 0, mode: "safe", text: "valid" }
        }
      })
      assert(
          !invalid.ok &&
          invalid.snapshot.commandPreview.state === "rejected" &&
          invalid.snapshot.commandPreview.inputValidation?.source === "schema",
        "Web preview should expose schema preflight rejection"
      )

      const tui = await createTuiSurface({
        client: productClient,
        now: () => 74_101
      })
      const tuiOutput: string[] = []
      const tuiResult = await runTuiLineSession({
        surface: tui,
        input: lines([
          `preview ${commandId}`,
          "2",
          "safe",
          "n",
          "guided TUI",
          "quit"
        ]),
        write(chunk) {
          tuiOutput.push(chunk)
        }
      })
      const renderedTui = tuiOutput.join("")
      assert(
        tuiResult.previewCommandCount === 1 &&
          tuiResult.quit &&
          renderedTui.includes("Count:") &&
          renderedTui.includes("Mode") &&
          renderedTui.includes("Include Tags?") &&
          renderedTui.includes("status:runnable"),
        "TUI should guide schema-backed preview input and return to its command loop"
      )

      const execution = await web.dispatchAction({
        type: "execute-command",
        input: {
          commandId,
          input: {
            count: 3,
            mode: "fast",
            text: "Web execution",
            tags: ["web"]
          }
        }
      })
      assert(
        execution.ok &&
          execution.snapshot.commandExecution.state === "submitted",
        "Web declarative input should submit a durable plugin command"
      )
      const reference = execution.snapshot.commandExecution.references.find(
        (item) => item.kind === "job"
      )
      assert(reference !== undefined, "Web execution should expose a durable job")
      const worker = await commandHost.runOnce()
      assert(
        worker.status === "completed" && worker.jobId === reference.id,
        "command worker should complete the generated-input job"
      )
      const activity = await productClient.readExecutionReference(reference)
      assert(
        activity.ok &&
          activity.value.kind === "found" &&
          activity.value.activity.state === "succeeded",
        "completed declarative command activity should be readable"
      )

      for (const malformed of [
        { type: "object", unknownKeyword: true },
        { type: "array", items: { type: "string" } }
      ]) {
        assert(
          !parseAppCommandInputSchema(malformed).ok,
          "malformed schema should fail closed"
        )
      }
      assert(
        !parseAppCommandInputSchema(
          { type: "object", description: "x".repeat(100) },
          { limits: { maxSerializedBytes: 64 } }
        ).ok,
        "oversized schema should fail closed"
      )

      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const webEntry = entryByName(footprint, "@wanex/web")
      const tuiEntry = entryByName(footprint, "@wanex/tui")
      const hostEntry = entryByName(footprint, "@wanex/plugin-command-host")
      assert(
        !webEntry.contains.pluginRuntime &&
          !tuiEntry.contains.pluginRuntime &&
          hostEntry.contains.pluginRuntime,
        "only the explicit command host should carry plugin runtime"
      )

      return {
        commandId,
        catalogSchema: true,
        webDeclarative: true,
        invalidPreflight: true,
        tuiGuided: true,
        executionState: execution.snapshot.commandExecution.state,
        jobState:
          activity.ok && activity.value.kind === "found"
            ? activity.value.activity.state
            : null,
        malformedRejected: true,
        webPluginRuntime: webEntry.contains.pluginRuntime,
        tuiPluginRuntime: tuiEntry.contains.pluginRuntime,
        commandHostPluginRuntime: hostEntry.contains.pluginRuntime
      }
    } finally {
      await commandHost.dispose()
      await product.dispose()
    }
  }
})

async function* lines(values: readonly string[]): AsyncIterable<string> {
  for (const value of values) yield value
}
