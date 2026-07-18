import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createProductAppBackendShell,
  PRODUCT_APP_BACKEND_CAPABILITY_IDS,
  PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS
} from "@wanex/product-app/backend"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "./distribution-audit.js"
import { assertProductAppBackendClosureExcludes } from "./product-app-backend-eval-utils.js"
import { createEvalScenario } from "./runner.js"
import { assert, isRecord } from "./scenario-utils.js"

export const productAppBackendOverviewScenario = createEvalScenario({
  id: "product.skeleton-overview-contract",
  title: "App Shell command runtime summarizes first-screen state",
  tags: ["product-path", "overview", "distribution"],
  async run(context) {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-eval-product-overview-"))
    const shell = await createProductAppBackendShell({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: context.serviceBin },
      providerProfile: {
        id: "eval-product-overview",
        modelId: "eval-product-overview-model"
      }
    })

    try {
      await shell.commands.runAgentTurn({
        text: "seed overview scenario",
        sessionId: "ses_eval_product_overview"
      })
      const typed = await shell.commands.readProductOverview({
        now: 8_001,
        recentSessionLimit: 2
      })
      const port = await shell.dispatch({
        command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductOverview,
        input: { now: 8_002, recentSessionLimit: 2 }
      })
      const json = await shell.dispatchJson(
        JSON.stringify({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductOverview,
          input: { now: 8_003, recentSessionLimit: 2 }
        })
      )
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const closureExcludes = assertProductAppBackendClosureExcludes(
        entryByName(footprint, "@wanex/app"),
        "overview"
      )

      assertOverview(typed, 8_001)
      assert(port.ok, "overview command-port dispatch should succeed")
      assertOverview(port.value, 8_002)
      assert(
        json.status === "success" && json.envelope.ok,
        "overview JSON dispatch should succeed"
      )
      assertOverview(json.envelope.value, 8_003)

      return {
        providerProfileId: typed.provider.activeProfileId,
        selectedCount: typed.capabilities.selectedCount,
        commandCount: typed.commands.totalCount,
        recentSessionCount: typed.sessions.recentCount,
        jsonStatus: json.status,
        diagnosticsGeneratedAt: typed.diagnostics.generatedAt,
        closureExcludes
      }
    } finally {
      await shell.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})

function assertOverview(value: unknown, generatedAt: number): asserts value is {
  readonly provider: { readonly activeProfileId: string }
  readonly capabilities: { readonly selectedCount: number }
  readonly commands: { readonly totalCount: number }
  readonly sessions: { readonly recentCount: number }
  readonly diagnostics: { readonly generatedAt: number }
} {
  assert(isRecord(value), "overview should be an object")
  assert(value.kind === "product-app.backend.overview", "overview kind should match")
  assert(value.generatedAt === generatedAt, "overview generatedAt should match")
  assert(value.ready === true, "overview should report ready")
  assert(isRecord(value.provider), "overview should include provider")
  assert(
    value.provider.activeProfileId === "eval-product-overview",
    "overview should expose active provider profile"
  )
  assert(isRecord(value.capabilities), "overview should include capabilities")
  assert(
    value.capabilities.selectedCount === 7 &&
      Array.isArray(value.capabilities.selectedIds) &&
      value.capabilities.selectedIds.includes(
        PRODUCT_APP_BACKEND_CAPABILITY_IDS.productCommandRegistry
      ),
    "overview should summarize selected capabilities"
  )
  assert(isRecord(value.commands), "overview should include commands")
  assert(
    value.commands.totalCount === 15 &&
      Array.isArray(value.commands.primary) &&
      value.commands.primary.some(
        (command) => isRecord(command) && command.id === "product.overview.read"
      ) &&
      value.commands.primary.some(
        (command) =>
          isRecord(command) &&
          command.id === "product.diagnostics.detail.read"
      ),
    "overview should summarize product commands"
  )
  assert(isRecord(value.sessions), "overview should include sessions")
  assert(
    value.sessions.recentCount === 1 &&
      Array.isArray(value.sessions.recent) &&
      value.sessions.recent.some(
        (session) =>
          isRecord(session) &&
          session.sessionId === "ses_eval_product_overview"
      ),
    "overview should summarize recent sessions"
  )
  assert(
    Array.isArray(value.recommendedActions) &&
      value.recommendedActions.some(
        (action) => isRecord(action) && action.commandId === "product.agent.run"
      ),
    "overview should include recommended product actions"
  )
  assert(isRecord(value.diagnostics), "overview should include diagnostics")
  assert(
    value.diagnostics.generatedAt === generatedAt,
    "overview diagnostics generatedAt should match"
  )
}
