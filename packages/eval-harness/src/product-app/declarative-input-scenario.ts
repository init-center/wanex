import {
  parseAppCommandInputSchema,
  resolveAppExtensionContributions,
  type AppCommandContribution
} from "@wanex/extension"
import { pluginActionHandlerRef } from "@wanex/product-app-command-host"
import { PluginRuntime } from "@wanex/plugin"
import { createProductAppCommandHost } from "@wanex/product-app-command-host"
import {
  createProductAppTuiSurface,
  runProductAppTuiLineSession
} from "@wanex/product-app-tui"
import {
  createProductAppWebController,
  productAppWebCommandArrayItemFieldName,
  productAppWebCommandEnumOptionValue,
  productAppWebCommandInputFieldName,
  productAppWebCommandPresenceFieldName
} from "@wanex/product-app-web"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "../distribution-audit.js"
import { createEvalScenario } from "../runner.js"
import { assert, evalPluginInstallPlan } from "../scenario-utils.js"

export const declarativeCommandInputProductScenario = createEvalScenario({
  id: "product.declarative-command-input",
  title: "Declarative command input spans Web, TUI, and durable plugin execution",
  tags: ["product-app", "command-input", "schema", "web", "tui", "plugin"],
  async run(context) {
    const pluginId = "eval.plugin.declarative-input"
    const commandId = "eval.declarative-input"
    const plugin = new PluginRuntime({ storage: context.storage })
    const plan = evalPluginInstallPlan(context.pluginHostFixture)
    await plugin.registerInstallPlan({
      plan: {
        ...plan,
        layout: {
          ...plan.layout,
          pluginId,
          name: "Eval Declarative Input Plugin",
          packageName: pluginId
        },
        source: { ...plan.source, uri: `file:///plugins/${pluginId}` }
      },
      installIdempotencyKey: "eval-declarative-input-install"
    })
    const handlerRef = pluginActionHandlerRef({
      kind: "plugin_action",
      pluginId,
      version: "1.0.0",
      actionId: "echo",
      requiredCapability: "config.read"
    })
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
    const contribution: AppCommandContribution = {
      id: commandId,
      domain: "command",
      value: {
        name: commandId,
        title: "Declarative Input",
        category: "eval",
        handlerRef,
        inputSchema
      },
      provenance: {
        source: {
          kind: "plugin",
          scope: "user",
          id: pluginId,
          version: "1.0.0"
        },
        trust: "user_enabled"
      },
      privileged: true
    }
    const commandHost = await createProductAppCommandHost({
      handle: context.handle,
      extensionSnapshot: resolveAppExtensionContributions([contribution]),
      principalId: "principal_eval_declarative_input",
      plugins: [{ pluginId, version: "1.0.0" }],
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
      },
      productApp: {
        providerProfile: {
          id: "eval-declarative-input-provider",
          modelId: "eval-declarative-input-model"
        }
      }
    })

    try {
      const catalog = await commandHost.client.readProductCommands()
      assert(catalog.ok, "declarative command catalog should be readable")
      const command = catalog.value.commands.find((item) => item.id === commandId)
      assert(
        command?.inputSchema?.required?.join(",") === "count,mode,text",
        "catalog should preserve normalized declarative input schema"
      )

      const web = await createProductAppWebController({
        client: commandHost.client,
        now: () => 74_100,
        pollAfterAction: false
      })
      const workbenchMode = await web.submitActionInput({
        action: "set-mode",
        fields: {
          mode: "workbench"
        }
      })
      assert(
        workbenchMode.ok &&
          workbenchMode.document.snapshot.view.mode === "workbench",
        "Web declarative input scenario should explicitly enter workbench mode"
      )
      const webDocument = workbenchMode.document
      assert(
        webDocument.html.includes('data-command-input-mode="generated"') &&
          webDocument.html.includes('name="commandInput:/count"') &&
          webDocument.html.includes("data-command-array-template") &&
          !webDocument.html.includes(
            `data-command-input-command="${commandId}" data-command-input-mode="generated"><legend>Declarative Input</legend><label>JSON input`
          ),
        "Web should render generated controls without a raw fallback"
      )

      const forged = await web.submitActionInput({
        action: "preview-command",
        fields: {
          commandId,
          [productAppWebCommandInputFieldName("/forged")]: "value"
        }
      })
      assert(
        !forged.ok && !forged.parse.ok && forged.parse.error.field === "commandId",
        "Web should reject forged generated fields"
      )
      const invalid = await web.submitActionInput({
        action: "preview-command",
        fields: webFields(commandId, { count: "0", mode: "safe", text: "valid" })
      })
      assert(
        invalid.ok &&
          invalid.actionResult.ok &&
          invalid.document.snapshot.commandPreview.state === "rejected" &&
          invalid.document.snapshot.commandPreview.inputValidation?.source === "schema",
        "Web preview should expose schema preflight rejection"
      )

      const tui = await createProductAppTuiSurface({
        client: commandHost.client,
        now: () => 74_101
      })
      const tuiOutput: string[] = []
      const tuiResult = await runProductAppTuiLineSession({
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

      const execution = await web.submitActionInput({
        action: "execute-command",
        fields: {
          ...webFields(commandId, { count: "3", mode: "fast", text: "Web execution" }),
          [productAppWebCommandPresenceFieldName("/tags")]: "true",
          [productAppWebCommandArrayItemFieldName("/tags/0")]: "true",
          [productAppWebCommandInputFieldName("/tags/0")]: "web"
        }
      })
      assert(
        execution.ok &&
          execution.actionResult.ok &&
          execution.document.snapshot.commandExecution.state === "completed",
        "Web generated input should submit a durable plugin command"
      )
      const reference = execution.document.snapshot.commandExecution.references.find(
        (item) => item.kind === "job"
      )
      assert(reference !== undefined, "Web execution should expose a durable job")
      const worker = await commandHost.runOnce()
      assert(
        worker.status === "completed" && worker.jobId === reference.id,
        "command worker should complete the generated-input job"
      )
      const activity = await commandHost.client.readExecutionReference(reference)
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
      const webEntry = entryByName(footprint, "@wanex/product-app-web")
      const tuiEntry = entryByName(footprint, "@wanex/product-app-tui")
      const hostEntry = entryByName(footprint, "@wanex/product-app-command-host")
      assert(
        !webEntry.contains.pluginRuntime &&
          !tuiEntry.contains.pluginRuntime &&
          hostEntry.contains.pluginRuntime,
        "only the explicit command host should carry plugin runtime"
      )

      return {
        commandId,
        catalogSchema: true,
        webGenerated: true,
        forgedRejected: true,
        invalidPreflight: true,
        tuiGuided: true,
        executionState: execution.document.snapshot.commandExecution.state,
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
    }
  }
})

function webFields(
  commandId: string,
  input: { readonly count: string; readonly mode: "safe" | "fast"; readonly text: string }
): Record<string, string> {
  return {
    commandId,
    [productAppWebCommandInputFieldName("/count")]: input.count,
    [productAppWebCommandInputFieldName("/mode")]:
      productAppWebCommandEnumOptionValue(input.mode),
    [productAppWebCommandInputFieldName("/text")]: input.text
  }
}

async function* lines(values: readonly string[]): AsyncIterable<string> {
  for (const value of values) yield value
}
