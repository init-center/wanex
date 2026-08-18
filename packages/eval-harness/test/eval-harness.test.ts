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
      "product.smoke-matrix",
      "product.capability-readiness-contract",
      "product.skeleton-command-port-contract",
      "product.skeleton-json-mapping-contract",
      "product.skeleton-backend-shell-contract",
      "product.skeleton-integration-contract",
      "product.app-shell-contract",
      "product.app-surface-contract",
      "product.app-surface-client-contract",
      "product.app-surface-message-transport-contract",
      "product.conversation-lifecycle-operational",
      "product.recovery-review-operational",
      "product.tool-approval-journey",
      "product.guided-follow-up-operational",
      "product.same-turn-steering-operational",
      "product.side-query-operational",
      "product.plan-review-execution-operational",
      "product.goal-mode-operational",
      "product.capability-setup-linked-continuation",
      "product.long-session-continuity-operational",
      "product.app-host-endpoint-contract",
      "product.app-web-surface-contract",
      "product.app-feedback-matrix-contract",
      "product.app-local-desktop-host-contract",
      "product.app-local-host-contract",
      "product.app-tui-surface-contract",
      "product.app-tui-line-session-contract",
      "product.app-tui-cli-contract",
      "product.app-tui-host-message-transport-contract",
      "product.skeleton-overview-contract",
      "product.skeleton-workbench-contract",
      "product.skeleton-diagnostics-detail-contract",
      "extension.plugin-action-product-path",
      "product.declarative-command-input",
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
      "delegation-graph.product-smoke",
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
