import type { AppCommandContribution } from "@wanex/extension"
import { resolveAppExtensionContributions } from "@wanex/extension"
import {
  createProductAppBackendApp,
  PRODUCT_APP_BACKEND_CAPABILITY_IDS,
  type ProductAppBackendCapabilityId
} from "@wanex/product-app/backend"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "../distribution-audit.js"
import { assertProductAppBackendClosureExcludes } from "../product-app-backend-eval-utils.js"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import { createProductCapabilityStoreDir } from "./helpers.js"
import { rm } from "node:fs/promises"

export const productCapabilityReadinessScenario = createEvalScenario({
  id: "product.capability-readiness-contract",
  title: "Product App Backend exposes capability selection without widening closure",
  tags: ["product-path", "capability", "distribution"],
  async run(context) {
    const storeDir = await createProductCapabilityStoreDir(
      "wanex-eval-product-capability-"
    )
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: context.serviceBin
      },
      extensions: {
        snapshot: resolveAppExtensionContributions([pluginCommandContribution()])
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
          text: "should not execute in the product app backend"
        }
      })
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const productAppBackend = entryByName(footprint, "@wanex/app")
      const closureExcludes =
        assertProductAppBackendClosureExcludes(productAppBackend, "product app backend")
      const selectedIds = capabilities.capabilities
        .filter((capability) => capability.state === "enabled")
        .map((capability) => capability.id)
      const notSelectedIds = capabilities.capabilities
        .filter((capability) => capability.state === "not_selected")
        .map((capability) => capability.id)

      assert(
        capabilities.extensionConfigured,
        "capability read model should report configured extension snapshot"
      )
      assert(
        selectedIds.includes(
          PRODUCT_APP_BACKEND_CAPABILITY_IDS.extensionCommandDiscovery
        ),
        "extension command discovery should be selected in the slim recipe"
      )
      assert(
        selectedIds.includes(PRODUCT_APP_BACKEND_CAPABILITY_IDS.agentTurn),
        "agent turn capability should be selected"
      )
      assertCapabilityNotSelected(
        notSelectedIds,
        PRODUCT_APP_BACKEND_CAPABILITY_IDS.pluginActionExecution
      )
      assertCapabilityNotSelected(
        notSelectedIds,
        PRODUCT_APP_BACKEND_CAPABILITY_IDS.connectorRuntime
      )
      assert(
        extensionCommand !== undefined,
        "extension command should be visible in the product command registry"
      )
      assert(
        extensionCommand.handlerRef === "wanex.plugin-action:eval.plugin.echo/echo",
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
        "product app backend should reject external handler execution by default"
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
        productAppBackendPackageCount: productAppBackend.totals.packageCount
      }
    } finally {
      await app.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})

function assertCapabilityNotSelected(
  notSelectedIds: readonly ProductAppBackendCapabilityId[],
  id: ProductAppBackendCapabilityId
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
      handlerRef: "wanex.plugin-action:eval.plugin.echo/echo"
    },
    provenance: {
      source: {
        kind: "plugin",
        scope: "user",
        id: "eval.plugin.echo"
      },
      trust: "user_enabled"
    }
  }
}
