import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  createEvalHarnessContext,
  createEvalScenario,
  createWanexRegressionScenarios,
  runEvalSuite
} from "../src/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const pluginHostFixture = join(
  import.meta.dirname,
  "../../plugin/test/fixtures/plugin-host-fixture.mjs"
)

describe("@wanex/eval-harness", () => {
  it("runs scenarios and aggregates pass, fail, and skip results", async () => {
    const { context, cleanup } = await createEvalHarnessContext({
      serviceBin,
      pluginHostFixture,
      prefix: "wanex-eval-runner-"
    })
    try {
      const result = await runEvalSuite({
        context,
        now: tickingClock(),
        only: ["pass", "fail"],
        scenarios: [
          createEvalScenario({
            id: "pass",
            title: "Pass",
            tags: ["unit"],
            run: () => ({ ok: true })
          }),
          createEvalScenario({
            id: "fail",
            title: "Fail",
            run: () => {
              throw new Error("planned failure")
            }
          }),
          createEvalScenario({
            id: "skip",
            title: "Skip",
            run: () => ({ skipped: false })
          })
        ]
      })

      expect(result.totals).toEqual({
        passed: 1,
        failed: 1,
        skipped: 1
      })
      expect(result.results).toEqual([
        expect.objectContaining({
          id: "pass",
          status: "passed",
          output: { ok: true },
          tags: ["unit"]
        }),
        expect.objectContaining({
          id: "fail",
          status: "failed",
          error: expect.objectContaining({
            message: "planned failure"
          })
        }),
        expect.objectContaining({
          id: "skip",
          status: "skipped"
        })
      ])
    } finally {
      await cleanup()
    }
  })

  it("registers the complete built-in Wanex regression scenario inventory", () => {
    const scenarios = createWanexRegressionScenarios()
    expect(scenarios).toHaveLength(64)
    expect(new Set(scenarios.map((item) => item.id)).size).toBe(64)
    expect(scenarios.map((item) => item.id)).toEqual([
      "assistant.smoke-matrix",
      "assistant.capability-readiness-contract",
      "assistant.skeleton-command-port-contract",
      "assistant.skeleton-json-mapping-contract",
      "assistant.skeleton-backend-shell-contract",
      "assistant.skeleton-integration-contract",
      "assistant.app-shell-contract",
      "assistant.app-surface-contract",
      "assistant.app-surface-client-contract",
      "assistant.app-surface-message-transport-contract",
      "assistant.conversation-lifecycle-operational",
      "assistant.recovery-review-operational",
      "assistant.tool-approval-journey",
      "assistant.guided-follow-up-operational",
      "assistant.same-turn-steering-operational",
      "assistant.side-query-operational",
      "assistant.plan-review-execution-operational",
      "assistant.goal-mode-operational",
      "assistant.capability-setup-linked-continuation",
      "assistant.long-session-continuity-operational",
      "assistant.app-host-endpoint-contract",
      "assistant.app-web-surface-contract",
      "assistant.app-feedback-matrix-contract",
      "assistant.app-local-desktop-host-contract",
      "assistant.app-assistant-host-contract",
      "assistant.app-tui-surface-contract",
      "assistant.app-tui-line-session-contract",
      "assistant.app-tui-cli-contract",
      "assistant.app-tui-host-message-transport-contract",
      "assistant.skeleton-overview-contract",
      "assistant.skeleton-workbench-contract",
      "assistant.skeleton-diagnostics-detail-contract",
      "extension.plugin-action-assistant-path",
      "assistant.declarative-command-input",
      "memory.compaction-durable-projection",
      "memory.compaction-agent-replay",
      "media-generation.app-path",
      "media-generation.conversation-tool-resume",
      "optional-capability.turn-binding",
      "tool-approval.durable-app-contract",
      "resource.ticket-expiry-cleanup",
      "workspace.apply-undo-reapply",
      "workspace.controlled-tools",
      "workspace.conflict-plan",
      "workspace-task.multi-agent-conflict",
      "provider.deepseek-thinking-fidelity",
      "storage.remote-control-plane-isolation",
      "runtime-host.remote-multi-owner",
      "runtime-host.failure-isolation",
      "team.lead-delegation-durable",
      "delegation-graph.assistant-smoke",
      "delegation-graph.terminal-policy",
      "app.default-entry-contract",
      "bootstrap.local-runtime-operational",
      "agent.starter-contract",
      "agent.starter-context-contract",
      "agent.side-query-contract",
      "distribution.cold-footprint-policy",
      "distribution.package-packlist-policy",
      "distribution.hot-path-capability-contract",
      "cli.memory-sweep-operational",
      "cli.diagnostics-operational",
      "cli.support-bundle-operational",
      "support-bundle.redaction-operational"
    ])
  })
})

function tickingClock(): () => number {
  let value = 1_000
  return () => {
    value += 10
    return value
  }
}
