import { buildSupportBundle } from "@wanex/app/diagnostics"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"

export const supportBundleOperationalScenario = createEvalScenario({
  id: "support-bundle.redaction-operational",
  title: "Support bundle redacts provider credentials and stays read-only",
  tags: ["support", "diagnostics", "security"],
  async run(context) {
    await context.storage.putConfig("provider.profile.support", {
      id: "support",
      kind: "openai-compatible",
      providerId: "deepseek",
      modelId: "deepseek-chat",
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "secret-token"
    })
    await context.storage.enqueueJob({
      id: "job_eval_support_bundle_memory",
      kind: "memory.compaction",
      principalId: "support",
      payload: {
        sessionId: "ses_eval_support_bundle"
      }
    })
    const jobsBefore = await context.storage.listJobs({
      kind: "memory.compaction",
      limit: 10
    })

    const bundle = await buildSupportBundle({
      storage: context.storage,
      providerProfileIds: ["support"],
      memoryMaintenance: true,
      runtimeHost: {
        generatedAt: 900,
        host: {
          started: true,
          workerCount: 1,
          memoryWorkerCount: 1
        },
        totalJobs: 2,
        stateCounts: [
          { state: "ready", count: 1 },
          { state: "failed", count: 1 }
        ],
        kindCounts: [
          { kind: "session.run", count: 1 },
          { kind: "memory.compaction", count: 1 }
        ],
        backlogByKind: [{ kind: "session.run", count: 1 }],
        retryingByKind: [],
        failedByKind: [{ kind: "memory.compaction", count: 1 }],
        runningLeases: [],
        staleRunningLeases: []
      },
      runtimeHostHealth: {
        generatedAt: 950,
        started: true,
        workerCount: 1,
        memoryWorkerCount: 1,
        loopCount: 1,
        activeLoopCount: 1,
        stoppedLoopCount: 0,
        loops: [
          {
            id: "runtime_host_eval_support_worker",
            kind: "agent",
            index: 0,
            startedAt: 800,
            stopped: false,
            runCount: 1,
            idleCount: 0,
            completedCount: 1,
            failedCount: 0,
            errorCount: 0,
            lastResultStatus: "completed",
            lastResultAt: 940
          }
        ]
      },
      jobLimit: 100,
      eventLimit: 10,
      now: 1_000
    })
    const jobsAfter = await context.storage.listJobs({
      kind: "memory.compaction",
      limit: 10
    })
    const serialized = JSON.stringify(bundle)

    assert(!serialized.includes("secret-token"), "support bundle must redact secrets")
    assert(
      bundle.providers[0]?.profile?.apiKey === "***",
      "support bundle should expose redacted provider profile"
    )
    assert(
      bundle.diagnostics.diagnostics.some(
        (entry) => entry.code === "memory.compaction.ready"
      ),
      "support bundle should include app diagnostics"
    )
    assert(
      bundle.diagnostics.diagnostics.some(
        (entry) => entry.code === "app.runtime_host.summary"
      ) &&
        bundle.diagnostics.activity.some(
          (entry) => entry.id === "runtime-host-activity:health"
        ),
      "support bundle should include runtime-host diagnostics"
    )
    assert(
      JSON.stringify(jobsBefore.map((job) => [job.id, job.state])) ===
        JSON.stringify(jobsAfter.map((job) => [job.id, job.state])),
      "support bundle should be read-only"
    )

    return {
      providerRedacted: bundle.providers[0]?.profile?.apiKey === "***",
      runtimeHostIncluded: bundle.diagnostics.diagnostics.some(
        (entry) => entry.code === "app.runtime_host.summary"
      ),
      diagnosticCount: bundle.diagnostics.diagnostics.length,
      eventCount: bundle.events.length
    }
  }
})
