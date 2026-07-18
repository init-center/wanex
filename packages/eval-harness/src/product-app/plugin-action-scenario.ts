import type { AppCommandContribution } from "@wanex/extension"
import { createStaticExtensionHost } from "@wanex/extension/host"
import {
  pluginActionHandlerRef
} from "@wanex/product-app-command-host"
import { PluginRuntime } from "@wanex/plugin"
import { createProductAppCommandHost } from "@wanex/product-app-command-host"
import { createEvalScenario } from "../runner.js"
import {
  assert,
  evalPluginInstallPlan
} from "../scenario-utils.js"

export const extensionPluginActionProductPathScenario = createEvalScenario({
  id: "extension.plugin-action-product-path",
  title: "Extension command contributions can submit durable plugin actions",
  tags: ["extension", "plugin", "product-path"],
  async run(context) {
    const plugin = new PluginRuntime({ storage: context.storage })
    const pluginId = "eval.plugin.extension-echo"
    const installPlan = evalPluginInstallPlan(context.pluginHostFixture)
    await plugin.registerInstallPlan({
      plan: {
        ...installPlan,
        layout: {
          ...installPlan.layout,
          pluginId,
          name: "Eval Extension Echo Plugin",
          packageName: pluginId
        },
        source: {
          ...installPlan.source,
          uri: `file:///plugins/${pluginId}`
        }
      },
      installIdempotencyKey: "eval-extension-plugin-action-install"
    })

    const handlerRef = pluginActionHandlerRef({
      kind: "plugin_action",
      pluginId,
      actionId: "echo",
      version: "1.0.0",
      requiredCapability: "config.read"
    })
    const host = createStaticExtensionHost({
      sources: [
        {
          source: {
            kind: "plugin",
            scope: "user",
            id: pluginId,
            label: "Eval Echo Plugin",
            packageName: pluginId,
            version: "1.0.0"
          },
          trust: "user_enabled",
          contributions: [
            {
              id: "eval.echo",
              domain: "command",
              value: {
                name: "eval.echo",
                title: "Eval Echo",
                category: "eval",
                handlerRef
              },
              provenance: {
                source: {
                  kind: "plugin",
                  scope: "user",
                  id: pluginId,
                  label: "Eval Echo Plugin",
                  packageName: pluginId,
                  version: "1.0.0"
                },
                trust: "user_enabled"
              },
              privileged: true
            } satisfies AppCommandContribution
          ]
        }
      ]
    })
    const snapshot = await host.resolve()
    const command = snapshot.resolved.byDomain.command.byId.get("eval.echo")

    assert(command !== undefined, "plugin command contribution should resolve")
    assert(
      command.value.handlerRef === handlerRef,
      "resolved command should preserve plugin action handlerRef"
    )
    assert(
      snapshot.sources.length === 1 && snapshot.sources[0]?.status === "loaded",
      "extension source should load"
    )
    assert(
      !snapshot.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
      "extension resolution should not emit errors"
    )

    const commandHost = await createProductAppCommandHost({
      handle: context.handle,
      extensionSnapshot: snapshot.resolved,
      principalId: "principal_eval_extension_plugin_action",
      plugins: [{ pluginId, version: "1.0.0" }],
      worker: {
        workerId: "worker_eval_extension_plugin_action",
        leaseMs: 60_000,
        grants: [
          {
            pluginId,
            version: "1.0.0",
            decision: "allow",
            capabilities: ["config.read"]
          }
        ]
      },
      submission: {
        maxAttempts: 2,
        retryPolicy: { strategy: "fixed", initialDelayMs: 10 }
      },
      productApp: {
        providerProfile: {
          id: "eval-extension-product-app",
          modelId: "eval-extension-product-app-model"
        }
      }
    })
    const productClient = commandHost.client
    try {
      const catalog = await productClient.readProductCommands()
      const preview = await productClient.previewProductCommandInvocation({
        commandId: "eval.echo",
        input: { text: "from extension command" }
      })
      const execution = await productClient.executeProductCommand({
        commandId: "eval.echo",
        input: { text: "from extension command" }
      })
      assert(catalog.ok, "Product App should read extension command catalog")
      assert(
        catalog.value.commands.some((item) => item.id === "eval.echo"),
        "Product App catalog should include plugin command"
      )
      assert(
        preview.ok && preview.value.kind === "runnable",
        "Product App should preview injected plugin command as runnable"
      )
      assert(
        execution.ok && execution.value.kind === "completed",
        "Product App should execute plugin command through the typed client"
      )
      if (!execution.ok || execution.value.kind !== "completed") {
        throw new Error("typed plugin command execution did not complete")
      }
      const jobReference = execution.value.summary.references.find(
        (reference) => reference.kind === "job"
      )
      assert(
        jobReference !== undefined,
        "typed result should expose a job reference"
      )
      assert(
        execution.value.summary.valueKind === "plugin-action.submitted",
        "typed result should expose normalized plugin submission kind"
      )

      const submittedActivity = await productClient.readExecutionReference(
        jobReference
      )
      assert(
        submittedActivity.ok &&
          submittedActivity.value.kind === "found" &&
          submittedActivity.value.activity.state === "ready",
        "Product App should resolve the submitted job through the shared store"
      )

      const workerResult = await commandHost.runOnce()
      assert(
        workerResult.status === "completed" &&
          workerResult.jobId === jobReference.id,
        "command host worker should complete the submitted plugin action"
      )

      const completedActivity = await productClient.readExecutionReference(
        jobReference
      )
      assert(
        completedActivity.ok &&
          completedActivity.value.kind === "found" &&
          completedActivity.value.activity.state === "succeeded",
        "Product App should resolve completed activity through the shared store"
      )
      if (
        !completedActivity.ok ||
        completedActivity.value.kind !== "found"
      ) {
        throw new Error("completed plugin action activity was not found")
      }

      return {
        commandId: command.id,
        catalogDiscovered: true,
        previewKind: preview.ok ? preview.value.kind : null,
        executionKind: execution.value.kind,
        executionValueKind: execution.value.summary.valueKind,
        executionReferenceKind: jobReference.kind,
        sourceStatus: snapshot.sources[0]?.status ?? null,
        sharedStoreActivity: true,
        jobKind: completedActivity.value.activity.jobKind,
        jobState: completedActivity.value.activity.state,
        hostCompletedCount: commandHost.status().completedCount
      }
    } finally {
      await commandHost.dispose()
    }
  }
})
