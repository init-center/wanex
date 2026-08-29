import { DelegationGraphRuntime } from "@wanex/team/delegation/graph"
import { runRetryPolicyFixture } from "./delegation-graph-terminal-policy/retry-policy.js"
import { runTerminalReleasePolicyFixture } from "./delegation-graph-terminal-policy/terminal-release.js"
import { createEvalScenario } from "./runner.js"

export const delegationGraphTerminalPolicyScenario = createEvalScenario({
  id: "delegation-graph.terminal-policy",
  title: "Delegation graph terminal policy gates dependents by dependency kind",
  tags: ["delegation", "graph", "scheduler", "assistant-path", "multi-agent"],
  async run(context) {
    const runtime = new DelegationGraphRuntime({
      storage: context.storage,
      principalId: "principal_eval_delegation_graph_policy"
    })
    const terminal = await runTerminalReleasePolicyFixture({
      runtime,
      context
    })
    const retry = await runRetryPolicyFixture({
      runtime,
      context
    })

    return {
      ...terminal,
      ...retry
    }
  }
})
