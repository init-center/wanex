import {
  delegationExecutorFromRuntimeHost,
  DelegationRuntime
} from "@wanex/team/delegation"
import { WanexRuntimeHost } from "@wanex/runtime/host"
import { createEvalScenario } from "./runner.js"
import { assert } from "./scenario-utils.js"

export const delegationRuntimeHostProductScenario = createEvalScenario({
  id: "delegation.runtime-host-product",
  title: "Delegation runtime runs sub-agent tasks through runtime-host",
  tags: ["delegation", "runtime-host", "multi-agent", "product-path"],
  async run(context) {
    const host = new WanexRuntimeHost({
      storage: context.storage,
      workerCount: 3,
      fakeResponseText: "delegation product response"
    })
    const runtime = new DelegationRuntime({
      executor: delegationExecutorFromRuntimeHost(host)
    })
    try {
      const result = await runtime.runDelegationOnce({
        id: "del_eval_runtime_host",
        title: "Eval delegation runtime host",
        principalId: "principal_eval_delegation",
        tasks: [
          { id: "api", prompt: "inspect api" },
          { id: "tests", prompt: "inspect tests" },
          { id: "docs", prompt: "inspect docs" }
        ]
      })
      const statuses = result.run.results.map((item) => item.worker.status)
      assert(
        statuses.every((status) => status === "completed"),
        `delegation runtime-host workers should complete: ${statuses.join(",")}`
      )
      assert(
        result.summary.status === "succeeded",
        `delegation summary should succeed: ${result.summary.status}`
      )
      const outputs = result.summary.tasks
        .map((task) =>
          task.output
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("")
        )
        .sort()
      assert(
        outputs.length === 3,
        "delegation summary should include all task outputs"
      )
      assert(
        outputs.every((output) => output === "delegation product response"),
        `unexpected delegation outputs: ${outputs.join(",")}`
      )
      const persistedJobs = result.summary.tasks.map((task) => task.job)
      assert(
        persistedJobs.length === 3 &&
          persistedJobs.every((job) => job?.state === "succeeded"),
        "delegation product path should persist three succeeded task jobs"
      )
      return {
        taskCount: result.summary.tasks.length,
        summaryStatus: result.summary.status,
        workerStatuses: statuses,
        succeededJobs: persistedJobs.length
      }
    } finally {
      await host.stop()
    }
  }
})
