import type { AppCommandContribution } from "@wanex/extension"
import {
  createStaticAppExtensionCatalogSource,
  resolveAppExtensionContributions
} from "@wanex/extension"
import {
  createBackendApp,
  BACKEND_CAPABILITY_IDS,
  type BackendCapabilityId
} from "@wanex/product/backend"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "../distribution-audit.js"
import { assertBackendClosureExcludes } from "../product-backend-eval-utils.js"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import { createProductCapabilityStoreDir } from "./helpers.js"
import { rm } from "node:fs/promises"

export const productCapabilityReadinessScenario = createEvalScenario({
  id: "product.capability-readiness-contract",
  title: "application backend exposes capability selection without widening closure",
  tags: ["product-path", "capability", "distribution"],
  async run(context) {
    const storeDir = await createProductCapabilityStoreDir(
      "wanex-eval-product-capability-"
    )
    const app = await createBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: context.serviceBin
      },
      extensions: {
        source: createStaticAppExtensionCatalogSource({
          revision: "eval-product-capability-v1",
          snapshot: resolveAppExtensionContributions([
            pluginCommandContribution()
          ])
        })
      }
    })

    try {
      const capabilities = app.commands.readProductCapabilities()
      const commands = app.commands.readProductCommands()
      const extensionCommand = commands.commands.find(
        (command) => command.id === "eval.plugin.echo"
      )
      const extensionExplanation =
        app.commands.explainProductCommandContribution({
          commandId: "eval.plugin.echo"
        })
      const extensionPreview = app.commands.previewProductCommandInvocation({
        commandId: "eval.plugin.echo",
        input: {
          text: "should not execute in preview either"
        }
      })
      const rejected = await app.commands.executeProductCommand({
        commandId: "eval.plugin.echo",
        input: {
          text: "should not execute in the application backend"
        }
      })
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const backend = entryByName(footprint, "@wanex/app")
      const closureExcludes =
        assertBackendClosureExcludes(backend, "application backend")
      const selectedIds = capabilities.capabilities
        .filter((capability) => capability.state === "enabled")
        .map((capability) => capability.id)
      const notSelectedIds = capabilities.capabilities
        .filter((capability) => capability.state === "not_selected")
        .map((capability) => capability.id)

      assert(
        capabilities.extensionConfigured,
        "capability read model should report configured extension catalog"
      )
      assert(
        selectedIds.includes(
          BACKEND_CAPABILITY_IDS.extensionCommandDiscovery
        ),
        "extension command discovery should be selected in the slim recipe"
      )
      assert(
        selectedIds.includes(BACKEND_CAPABILITY_IDS.agentTurn),
        "agent turn capability should be selected"
      )
      assertCapabilityNotSelected(
        notSelectedIds,
        BACKEND_CAPABILITY_IDS.pluginActionExecution
      )
      assertCapabilityNotSelected(
        notSelectedIds,
        BACKEND_CAPABILITY_IDS.connectorRuntime
      )
      assert(
        extensionCommand !== undefined,
        "extension command should be visible in the product command registry"
      )
      assert(
        extensionCommand.handlerRef ===
          "wanex.plugin-action:eval.plugin.echo/echo?version=1.0.0",
        "extension command should preserve its external handler ref"
      )
      assert(
        extensionExplanation.kind === "found" &&
          extensionExplanation.source.kind === "plugin" &&
          extensionExplanation.handler.supported === false &&
          extensionExplanation.handler.policy === "unsupported_handler_ref",
        "extension explanation should preserve provenance and unsupported handler policy"
      )
      assert(
        extensionPreview.kind === "rejected" &&
          extensionPreview.reason === "unsupported_handler_ref",
        "extension command preview should reject unsupported handlers without execution"
      )
      assert(
        rejected.kind === "rejected" &&
          rejected.reason === "unsupported_handler_ref",
        "application backend should reject external handler execution by default"
      )

      return {
        selectedIds,
        notSelectedIds,
        extensionConfigured: capabilities.extensionConfigured,
        extensionCommandVisible: extensionCommand.id,
        extensionCommandPreviewReason: extensionPreview.reason,
        extensionCommandRejectedReason: rejected.reason,
        extensionExplanationPolicy: extensionExplanation.handler.policy,
        closureExcludes,
        backendPackageCount: backend.totals.packageCount
      }
    } finally {
      await app.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})

function assertCapabilityNotSelected(
  notSelectedIds: readonly BackendCapabilityId[],
  id: BackendCapabilityId
): void {
  assert(notSelectedIds.includes(id), `${id} should be reported as not selected`)
}

function pluginCommandContribution(): AppCommandContribution {
  return {
    id: "eval.plugin.echo",
    domain: "command",
    value: {
      name: "eval.plugin.echo",
      title: "Eval Plugin Echo",
      paletteVisibility: "visible",
      handlerRef: "wanex.plugin-action:eval.plugin.echo/echo?version=1.0.0"
    },
    provenance: {
      source: {
        kind: "plugin",
        scope: "user",
        id: "eval.plugin.echo",
        version: "1.0.0"
      },
      trust: "user_enabled"
    }
  }
}
