import { join } from "node:path"
import { WanexRuntimeHost } from "@wanex/runtime/host"
import { createEvalScenario } from "./runner.js"
import { assert, EvalFailingProvider } from "./scenario-utils.js"
export {
  runtimeHostRemoteMultiOwnerScenario
} from "./runtime-host/remote-multi-owner-scenario.js"

export const runtimeHostFailureIsolationScenario = createEvalScenario({
  id: "runtime-host.failure-isolation",
  title: "Worker pool isolates one provider failure from another job",
  tags: ["worker", "multi-agent"],
  async run(context) {
    const host = new WanexRuntimeHost({
      storageConfig: {
        kind: "local-system-service",
        mode: "persistent",
        storeDir: join(context.storeDir, "runtime-host-isolation"),
        serviceBin: context.serviceBin
      },
      workerCount: 2,
      provider: new EvalFailingProvider("fail me")
    })
    try {
      await host.submitUserTurn({
        content: [{ type: "text", text: "fail me" }],
        sessionId: "ses_eval_host_fail"
      })
      await host.submitUserTurn({
        content: [{ type: "text", text: "succeed" }],
        sessionId: "ses_eval_host_success"
      })
      const result = await host.runOnce()
      const statuses = result.results.map((item) => item.worker.status).sort()
      assert(
        statuses.join(",") === "completed,failed",
        `unexpected worker statuses: ${statuses.join(",")}`
      )
      const succeeded = await host.listJobs({ state: "succeeded" })
      const failed = await host.listJobs({ state: "failed" })
      return {
        succeeded: succeeded.length,
        failed: failed.length
      }
    } finally {
      await host.dispose()
    }
  }
})
