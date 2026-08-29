import {
  createBackendShell,
  BACKEND_CAPABILITY_IDS,
  BACKEND_COMMAND_PORT_COMMANDS
} from "@wanex/assistant/backend"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "./distribution-audit.js"
import { assertBackendClosureExcludes } from "./assistant-backend-eval-utils.js"
import {
  createConversationSettlementFixture
} from "./assistant/conversation-helpers.js"
import { createEvalScenario } from "./runner.js"
import { assert, evalFakeModelEndpoint, isRecord } from "./scenario-utils.js"

export const backendOverviewScenario = createEvalScenario({
  id: "assistant.skeleton-overview-contract",
  title: "App command runtime summarizes first-screen state",
  tags: ["assistant-path", "overview", "distribution"],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-assistant-overview-"
    })
    const shell = await createBackendShell({
      storage: storage.storage,
      modelEndpoint: evalFakeModelEndpoint(
        "eval-assistant-overview",
        "eval-assistant-overview-model"
      )
    })

    try {
      const receipt = await shell.commands.submitConversationOperation({
        content: [{ type: "text", text: "seed overview scenario" }],
        sessionId: "ses_eval_assistant_overview"
      })
      await storage.settlements.waitForJob(receipt.jobId)
      const typed = await shell.commands.readAssistantOverview({
        now: 8_001,
        recentSessionLimit: 2
      })
      const port = await shell.dispatch({
        command: BACKEND_COMMAND_PORT_COMMANDS.readAssistantOverview,
        input: { now: 8_002, recentSessionLimit: 2 }
      })
      const json = await shell.dispatchJson(
        JSON.stringify({
          command: BACKEND_COMMAND_PORT_COMMANDS.readAssistantOverview,
          input: { now: 8_003, recentSessionLimit: 2 }
        })
      )
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const closureExcludes = assertBackendClosureExcludes(
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
        modelEndpointId: typed.provider.activeEndpointId,
        selectedCount: typed.capabilities.selectedCount,
        commandCount: typed.commands.totalCount,
        recentSessionCount: typed.sessions.recentCount,
        jsonStatus: json.status,
        diagnosticsGeneratedAt: typed.diagnostics.generatedAt,
        closureExcludes
      }
    } finally {
      await shell.dispose()
      await storage.dispose()
    }
  }
})

function assertOverview(value: unknown, generatedAt: number): asserts value is {
  readonly provider: { readonly activeEndpointId: string }
  readonly capabilities: { readonly selectedCount: number }
  readonly commands: { readonly totalCount: number }
  readonly sessions: { readonly recentCount: number }
  readonly diagnostics: { readonly generatedAt: number }
} {
  assert(isRecord(value), "overview should be an object")
  assert(value.kind === "assistant.backend.overview", "overview kind should match")
  assert(value.generatedAt === generatedAt, "overview generatedAt should match")
  assert(value.ready === true, "overview should report ready")
  assert(isRecord(value.provider), "overview should include provider")
  assert(
    value.provider.activeEndpointId === "eval-assistant-overview",
    "overview should expose the active model endpoint"
  )
  assert(isRecord(value.capabilities), "overview should include capabilities")
  assert(
    value.capabilities.selectedCount === 7 &&
      Array.isArray(value.capabilities.selectedIds) &&
      value.capabilities.selectedIds.includes(
        BACKEND_CAPABILITY_IDS.assistantCommandRegistry
      ),
    "overview should summarize selected capabilities"
  )
  assert(isRecord(value.commands), "overview should include commands")
  assert(
    value.commands.totalCount === 14 &&
      Array.isArray(value.commands.primary) &&
      value.commands.primary.some(
        (command) => isRecord(command) && command.id === "assistant.overview.read"
      ) &&
      value.commands.primary.some(
        (command) =>
          isRecord(command) &&
          command.id === "assistant.diagnostics.detail.read"
      ),
    "overview should summarize assistant commands"
  )
  assert(isRecord(value.sessions), "overview should include sessions")
  assert(
    value.sessions.recentCount === 1 &&
      Array.isArray(value.sessions.recent) &&
      value.sessions.recent.some(
        (session) =>
          isRecord(session) &&
          session.sessionId === "ses_eval_assistant_overview"
      ),
    "overview should summarize recent sessions"
  )
  assert(
    Array.isArray(value.recommendedActions) &&
      value.recommendedActions.some(
        (action) => isRecord(action) && action.commandId === "assistant.agent.submit"
      ),
    "overview should include recommended assistant actions"
  )
  assert(isRecord(value.diagnostics), "overview should include diagnostics")
  assert(
    value.diagnostics.generatedAt === generatedAt,
    "overview diagnostics generatedAt should match"
  )
}
