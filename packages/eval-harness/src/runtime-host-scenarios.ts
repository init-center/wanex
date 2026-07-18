import { join } from "node:path"
import {
  createRemoteStorageControlPlane,
  createStorageWireTransportPool
} from "@wanex/storage-control-plane"
import {
  OneShotSystemServiceStorageWireTransport,
  PersistentSystemServiceStorageWireTransport
} from "@wanex/storage"
import { WanexRuntimeHost } from "@wanex/runtime/host"
import { startEvalRemoteStorageServer } from "./eval-remote-storage-server.js"
import { createEvalScenario } from "./runner.js"
import { assert, EvalFailingProvider } from "./scenario-utils.js"

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
      await host.submitUserText({
        text: "fail me",
        sessionId: "ses_eval_host_fail"
      })
      await host.submitUserText({
        text: "succeed",
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

export const runtimeHostRemoteStorageScenario = createEvalScenario({
  id: "runtime-host.remote-storage",
  title: "Worker pool runs through remote HTTP storage transport",
  tags: ["worker", "storage", "remote", "multi-agent"],
  async run(context) {
    type RuntimeHostSubject = {
      readonly subjectId: "runtime-host"
    }
    const createdTransports: string[] = []
    const pool = createStorageWireTransportPool<RuntimeHostSubject>({
      createTransport(subject) {
        createdTransports.push(subject.subjectId)
        return new PersistentSystemServiceStorageWireTransport({
          storeDir: join(context.storeDir, "remote-runtime-host", subject.subjectId),
          serviceBin: context.serviceBin
        })
      }
    })
    const controlPlane = createRemoteStorageControlPlane<RuntimeHostSubject>({
      async authenticateBearerToken(token) {
        if (token === "runtime-host-token") {
          return { subjectId: "runtime-host" }
        }
        return null
      },
      resolveStorageWireTransport: pool.resolveStorageWireTransport
    })
    const server = await startEvalRemoteStorageServer(controlPlane.handle)
    const host = new WanexRuntimeHost({
      storageConfig: {
        kind: "remote-http",
        endpoint: server.endpoint,
        token: "runtime-host-token",
        timeoutMs: 5_000
      },
      workerCount: 2,
      provider: new EvalFailingProvider("fail me")
    })
    try {
      await host.submitUserText({
        text: "one",
        sessionId: "ses_eval_remote_host_one"
      })
      await host.submitUserText({
        text: "two",
        sessionId: "ses_eval_remote_host_two"
      })
      const result = await host.runOnce()
      const statuses = result.results.map((item) => item.worker.status).sort()
      const failed = await host.listJobs({ state: "failed" })
      assert(
        statuses.join(",") === "completed,completed",
        `unexpected remote worker statuses: ${statuses.join(",")}; failed=${JSON.stringify(failed.map((job) => job.lastError ?? null))}`
      )
      const succeeded = await host.listJobs({ state: "succeeded" })
      assert(succeeded.length === 2, "remote host should persist succeeded jobs")
      return {
        succeeded: succeeded.length,
        createdTransports
      }
    } finally {
      await host.dispose()
      await server.close()
      await pool.close()
    }
  }
})
