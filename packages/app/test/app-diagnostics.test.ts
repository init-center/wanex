import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { writeModelEndpoint } from "@wanex/runtime/provider"
import type {
  ProviderAdapter,
  ProviderEvent,
  PreparedProviderReplayMessage,
  ProviderRequest
} from "@wanex/runtime/provider"
import type { JsonValue } from "@wanex/protocol"
import { WanexRuntimeHost } from "@wanex/runtime/host"
import {
  buildAppDiagnosticsSnapshot,
  buildSupportBundle,
  getMemoryMaintenanceDiagnosticsSnapshot
} from "../src/diagnostics/index.js"
import { appTestModelEndpoint } from "./model-endpoint-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const clients: StorageTestStore[] = []

afterEach(async () => {
  while (clients.length > 0) {
    await clients.pop()?.dispose()
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/app/diagnostics", () => {
  it("builds sorted base diagnostics without runtime composition dependencies", () => {
    const snapshot = buildAppDiagnosticsSnapshot({
      now: 100,
      config: [{ key: "runtime.setting.default", updatedAt: 22 }],
      jobs: [
        {
          id: "job_failed",
          kind: "plugin.action",
          state: "failed",
          principalId: "principal",
          payload: {
            text: "secret plugin payload"
          },
          scheduledAt: 1,
          priority: 0,
          attempt: 2,
          maxAttempts: 2,
          retryPolicy: { strategy: "none" },
          lastError: { message: "secret failure text" },
          createdAt: 1,
          updatedAt: 23,
          finishedAt: 23
        },
        {
          id: "job_memory",
          kind: "memory.compaction",
          state: "succeeded",
          principalId: "principal",
          payload: {
            sessionId: "ses_memory"
          },
          result: {
            summaryDigest: "a".repeat(64)
          },
          scheduledAt: 1,
          priority: 0,
          attempt: 1,
          maxAttempts: 2,
          retryPolicy: { strategy: "none" },
          createdAt: 1,
          updatedAt: 26,
          finishedAt: 26
        }
      ],
      plugin: {
        manifests: [
          {
            id: "manifest_disabled",
            pluginId: "plugin.disabled",
            version: "1.0.0",
            state: "disabled",
            updatedAt: 24
          }
        ],
        installs: [
          {
            id: "install_removed",
            pluginId: "plugin.removed",
            version: "1.0.0",
            state: "removed",
            updatedAt: 25
          }
        ]
      }
    })

    const serialized = JSON.stringify(snapshot)
    expect(snapshot.generatedAt).toBe(100)
    expect(serialized).not.toContain("secret plugin payload")
    expect(serialized).not.toContain("secret failure text")
    expect(
      snapshot.diagnostics.find((item) => item.id === "scheduler-job:job_failed")
        ?.detail
    ).toMatchObject({
      id: "job_failed",
      kind: "plugin.action",
      state: "failed",
      attempt: 2,
      payloadSummary: {
        kind: "object",
        keyCount: 1
      },
      lastErrorSummary: {
        kind: "object",
        keyCount: 1
      }
    })
    expect(snapshot.diagnostics.map((item) => item.code)).toEqual([
      "memory.compaction.succeeded",
      "plugin.install.removed",
      "plugin.manifest.disabled",
      "scheduler.job.failed",
      "config.updated"
    ])
    expect(snapshot.activity.map((item) => item.id)).toEqual([
      "memory-job-activity:job_memory",
      "scheduler-job-activity:job_failed"
    ])
  })

  it("allows raw scheduler job detail only through explicit opt-in", () => {
    const snapshot = buildAppDiagnosticsSnapshot({
      now: 100,
      jobDetailMode: "raw",
      jobs: [
        {
          id: "job_raw",
          kind: "plugin.action",
          state: "failed",
          principalId: "principal",
          payload: {
            text: "raw plugin payload"
          },
          scheduledAt: 1,
          priority: 0,
          attempt: 1,
          maxAttempts: 1,
          retryPolicy: { strategy: "none" },
          result: {
            text: "raw result"
          },
          lastError: {
            message: "raw failure"
          },
          createdAt: 1,
          updatedAt: 2,
          finishedAt: 2
        }
      ]
    })

    expect(snapshot.diagnostics[0]?.detail).toMatchObject({
      id: "job_raw",
      kind: "plugin.action",
      payload: {
        text: "raw plugin payload"
      },
      result: {
        text: "raw result"
      },
      lastError: {
        message: "raw failure"
      }
    })
  })

  it("projects runtime-host summaries as app diagnostics", () => {
    const snapshot = buildAppDiagnosticsSnapshot({
      now: 100,
      runtimeHost: {
        generatedAt: 90,
        host: {
          started: true,
          workerCount: 2,
          memoryWorkerCount: 1,
          mediaGenerationWorkerCount: 0
        },
        totalJobs: 3,
        stateCounts: [
          { state: "running", count: 1 },
          { state: "failed", count: 1 },
          { state: "retry_scheduled", count: 1 }
        ],
        kindCounts: [
          { kind: "session.turn", count: 1 },
          { kind: "plugin.action", count: 2 }
        ],
        retryingByKind: [{ kind: "plugin.action", count: 1 }],
        failedByKind: [{ kind: "plugin.action", count: 1 }],
        backlogByKind: [{ kind: "session.turn", count: 2 }],
        runningLeases: [
          {
            jobId: "job_stale",
            kind: "session.turn",
            workerId: "worker_a",
            attempt: 1,
            leaseExpiresAt: 80,
            stale: true,
            remainingLeaseMs: 0
          }
        ],
        staleRunningLeases: [
          {
            jobId: "job_stale",
            kind: "session.turn",
            workerId: "worker_a",
            attempt: 1,
            leaseExpiresAt: 80,
            stale: true,
            remainingLeaseMs: 0
          }
        ]
      }
    })

    expect(snapshot.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "app.runtime_host.lease_stale",
        "app.runtime_host.jobs_failed",
        "app.runtime_host.backlog",
        "app.runtime_host.jobs_retrying"
      ])
    )
    expect(
      snapshot.diagnostics.find(
        (item) => item.code === "app.runtime_host.backlog"
      )?.detail
    ).toEqual({
      backlogByKind: [
        {
          kind: "session.turn",
          count: 2
        }
      ]
    })
    expect(snapshot.activity).toEqual([
      expect.objectContaining({
        id: "runtime-host-activity:summary",
        source: "app",
        severity: "warning"
      })
    ])
  })

  it("projects runtime-host live health as app diagnostics", () => {
    const snapshot = buildAppDiagnosticsSnapshot({
      now: 100,
      runtimeHostHealth: {
        generatedAt: 91,
        started: true,
        workerCount: 2,
        memoryWorkerCount: 1,
        mediaGenerationWorkerCount: 0,
        loopCount: 3,
        activeLoopCount: 3,
        stoppedLoopCount: 0,
        loops: [
          {
            id: "runtime_host_worker_0",
            kind: "agent",
            index: 0,
            startedAt: 10,
            stopped: false,
            runCount: 5,
            idleCount: 3,
            completedCount: 2,
            failedCount: 0,
            errorCount: 0,
            lastResultStatus: "completed",
            lastResultAt: 90
          },
          {
            id: "runtime_host_worker_1",
            kind: "agent",
            index: 1,
            startedAt: 11,
            stopped: false,
            runCount: 4,
            idleCount: 4,
            completedCount: 0,
            failedCount: 0,
            errorCount: 0,
            lastResultStatus: "idle",
            lastResultAt: 89
          },
          {
            id: "runtime_host_memory_worker_0",
            kind: "memory",
            index: 0,
            startedAt: 12,
            stopped: false,
            runCount: 2,
            idleCount: 2,
            completedCount: 0,
            failedCount: 0,
            errorCount: 0,
            lastResultStatus: "idle",
            lastResultAt: 88
          }
        ]
      }
    })

    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        id: "runtime-host:health",
        source: "app",
        severity: "info",
        code: "app.runtime_host.health",
        at: 91,
        detail: expect.objectContaining({
          started: true,
          loopCount: 3,
          activeLoopCount: 3,
          stoppedLoopCount: 0,
          loops: expect.arrayContaining([
            expect.objectContaining({
              id: "runtime_host_worker_0",
              kind: "agent",
              runCount: 5,
              completedCount: 2,
              lastResultStatus: "completed",
              lastResultAt: 90
            })
          ])
        })
      })
    ])
    expect(snapshot.activity).toEqual([
      expect.objectContaining({
        id: "runtime-host-activity:health",
        source: "app",
        severity: "info",
        at: 91,
        detail: {
          started: true,
          loopCount: 3,
          activeLoopCount: 3,
          stoppedLoopCount: 0,
          runCount: 11,
          failureCount: 0,
          errorCount: 0
        }
      })
    ])
  })

  it("projects stopped or failing runtime-host loops without raw errors", () => {
    const snapshot = buildAppDiagnosticsSnapshot({
      now: 100,
      runtimeHostHealth: {
        generatedAt: 92,
        started: true,
        workerCount: 1,
        memoryWorkerCount: 0,
        mediaGenerationWorkerCount: 0,
        loopCount: 1,
        activeLoopCount: 0,
        stoppedLoopCount: 1,
        loops: [
          {
            id: "runtime_host_worker_failed",
            kind: "agent",
            index: 0,
            startedAt: 10,
            stopped: true,
            runCount: 3,
            idleCount: 1,
            completedCount: 0,
            failedCount: 1,
            errorCount: 1,
            lastResultStatus: "failed",
            lastResultAt: 91,
            lastErrorAt: 92
          }
        ]
      }
    })

    expect(snapshot.diagnostics.map((item) => item.code)).toEqual([
      "app.runtime_host.loop_stopped",
      "app.runtime_host.loop_failures"
    ])
    expect(
      snapshot.diagnostics.find(
        (item) => item.code === "app.runtime_host.loop_failures"
      )?.detail
    ).toEqual({
      failureCount: 1,
      errorCount: 1,
      loops: [
        {
          id: "runtime_host_worker_failed",
          kind: "agent",
          index: 0,
          startedAt: 10,
          stopped: true,
          runCount: 3,
          idleCount: 1,
          completedCount: 0,
          failedCount: 1,
          errorCount: 1,
          lastResultStatus: "failed",
          lastResultAt: 91,
          lastErrorAt: 92
        }
      ]
    })
    expect(JSON.stringify(snapshot)).not.toContain("Error:")
    expect(JSON.stringify(snapshot)).not.toContain("stack")
    expect(snapshot.activity).toEqual([
      expect.objectContaining({
        id: "runtime-host-activity:health",
        source: "app",
        severity: "warning",
        detail: expect.objectContaining({
          failureCount: 1,
          errorCount: 1
        })
      })
    ])
  })

  it("builds read-only memory maintenance diagnostics from storage state", async () => {
    const storage = await createStorage()
    await seedActiveContextEpoch(storage, "ses_memory_with_epoch")
    await storage.createSession({
      id: "ses_memory_without_epoch",
      kind: "agent"
    })
    await storage.enqueueJob({
      id: "job_memory_backlog",
      kind: "memory.compaction",
      principalId: "principal_memory",
      payload: {
        sessionId: "ses_memory_with_epoch"
      }
    })

    const beforeJobs = await storage.listJobs({
      kind: "memory.compaction",
      limit: 10
    })
    const snapshot = await getMemoryMaintenanceDiagnosticsSnapshot({
      storage,
      now: Date.now() + 10_000,
      staleAfterMs: 0
    })
    const afterJobs = await storage.listJobs({
      kind: "memory.compaction",
      limit: 10
    })

    expect(afterJobs.map((job) => [job.id, job.state])).toEqual(
      beforeJobs.map((job) => [job.id, job.state])
    )
    expect(snapshot.summary).toMatchObject({
      scannedSessionCount: 2,
      activeEpochCount: 1,
      noActiveEpochSessionCount: 1,
      pendingJobCount: 1,
      staleEpochCount: 1
    })
  })

  it("builds a redacted read-only support bundle", async () => {
    const storage = await createStorage()
    await writeModelEndpoint(storage, appTestModelEndpoint({
      endpointId: "deepseek",
      protocolId: "openai-chat-completions",
      providerId: "deepseek",
      modelId: "deepseek-chat",
      baseUrl: "https://api.deepseek.com/v1",
      secretRef: "env://DEEPSEEK_API_KEY"
    }))
    await storage.createSession({
      id: "ses_support_bundle",
      kind: "agent"
    })
    await storage.enqueueJob({
      id: "job_support_memory_backlog",
      kind: "memory.compaction",
      principalId: "support",
      payload: {
        sessionId: "ses_support_bundle",
        prompt: "support bundle secret prompt"
      }
    })
    const beforeJobs = await storage.listJobs({
      kind: "memory.compaction",
      limit: 10
    })

    const bundle = await buildSupportBundle({
      storage,
      modelEndpointIds: ["deepseek", "missing"],
      sessionId: "ses_support_bundle",
      eventLimit: 20,
      jobLimit: 20,
      memoryMaintenance: true,
      now: 1_000
    })
    const afterJobs = await storage.listJobs({
      kind: "memory.compaction",
      limit: 10
    })

    expect(bundle.generatedAt).toBe(1_000)
    expect(bundle.doctor).toMatchObject({
      schemaVersion: 14
    })
    expect(bundle.modelEndpoints).toEqual([
      expect.objectContaining({
        id: "deepseek",
        found: true,
        endpoint: expect.objectContaining({
          id: "deepseek",
          credentialConfigured: true
        })
      }),
      {
        id: "missing",
        found: false
      }
    ])
    expect(JSON.stringify(bundle)).not.toContain("DEEPSEEK_API_KEY")
    expect(JSON.stringify(bundle)).not.toContain("secretRef")
    expect(JSON.stringify(bundle)).not.toContain("support bundle secret prompt")
    expect(bundle.diagnostics.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "memory.compaction.ready",
        "memory.maintenance.backlog.ready"
      ])
    )
    expect(afterJobs.map((job) => [job.id, job.state])).toEqual(
      beforeJobs.map((job) => [job.id, job.state])
    )
  })

  it("includes runtime-host diagnostics in support bundles from structural inputs", async () => {
    const storage = await createStorage()

    const bundle = await buildSupportBundle({
      storage,
      now: 2_000,
      runtimeHost: {
        generatedAt: 1_950,
        host: {
          started: true,
          workerCount: 2,
          memoryWorkerCount: 1,
          mediaGenerationWorkerCount: 0
        },
        totalJobs: 4,
        stateCounts: [
          { state: "ready", count: 2 },
          { state: "failed", count: 1 }
        ],
        kindCounts: [
          { kind: "session.turn", count: 3 },
          { kind: "memory.compaction", count: 1 }
        ],
        backlogByKind: [{ kind: "session.turn", count: 2 }],
        retryingByKind: [],
        failedByKind: [{ kind: "session.turn", count: 1 }],
        runningLeases: [],
        staleRunningLeases: []
      },
      runtimeHostHealth: {
        generatedAt: 1_990,
        started: true,
        workerCount: 2,
        memoryWorkerCount: 1,
        mediaGenerationWorkerCount: 0,
        loopCount: 2,
        activeLoopCount: 1,
        stoppedLoopCount: 1,
        loops: [
          {
            id: "runtime_host_worker_0",
            kind: "agent",
            index: 0,
            startedAt: 1_900,
            stopped: false,
            runCount: 3,
            idleCount: 1,
            completedCount: 2,
            failedCount: 0,
            errorCount: 0,
            lastResultStatus: "completed",
            lastResultAt: 1_980
          },
          {
            id: "runtime_host_worker_1",
            kind: "agent",
            index: 1,
            startedAt: 1_901,
            stopped: true,
            runCount: 2,
            idleCount: 0,
            completedCount: 1,
            failedCount: 1,
            errorCount: 1,
            lastResultStatus: "failed",
            lastResultAt: 1_985,
            lastErrorAt: 1_990
          }
        ]
      }
    })

    expect(bundle.diagnostics.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "app.runtime_host.summary",
        "app.runtime_host.backlog",
        "app.runtime_host.jobs_failed",
        "app.runtime_host.loop_stopped",
        "app.runtime_host.loop_failures"
      ])
    )
    expect(bundle.diagnostics.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "runtime-host-activity:summary",
          source: "app"
        }),
        expect.objectContaining({
          id: "runtime-host-activity:health",
          source: "app"
        })
      ])
    )
  })
})

async function createStorage(): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-app-diagnostics-"))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({ kind: "local-system-service", mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  return storage
}

async function seedActiveContextEpoch(
  storage: StorageTestStore,
  sessionId: string
): Promise<void> {
  const host = new WanexRuntimeHost({
    storage,
    workerCount: 1,
    provider: new DiagnosticsMemoryProvider(),
    memoryCompaction: {
      enabled: true,
      workerCount: 1,
      policy: {
        reserveInputTokens: 1_000,
        keepRecentTokens: 100,
        minimumRecentTurns: 1,
        maxSummaryOutputTokens: 100,
        minimumTokenSavings: 1
      }
    }
  })
  try {
    for (const text of ["memory first", "memory second", "memory third"]) {
      await host.submitUserTurn({
        sessionId,
        content: [{ type: "text", text }]
      })
      await host.runOnce()
    }
    const active = await storage.getActiveContextEpoch({ sessionId })
    if (active === null) throw new Error("expected active diagnostic context epoch")
  } finally {
    await host.dispose()
  }
}

class DiagnosticsMemoryProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "fake"
  readonly model = {
    id: "diagnostics-memory-model",
    operations: ["conversation"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    features: [],
    limits: { contextWindowTokens: 2_500, maxOutputTokens: 100 },
    catalog: {
      source: "custom",
      catalogId: "test.diagnostics-memory-model",
      revision: "1"
    }
  } as const

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    const isSummary = request.messages[0]?.content.some(
      (part) => part.type === "text" && part.text.includes("semantic checkpoint")
    ) === true
    yield {
      type: "text_delta",
      partId: "diagnostics_memory_text",
      delta: isSummary
        ? "## Goal\nDiagnostic semantic checkpoint"
        : "diagnostic memory response ".repeat(80)
    }
    yield { type: "finish", reason: "stop" }
  }

  buildReplayMessages(
    messages: readonly PreparedProviderReplayMessage[]
  ): JsonValue[] {
    return messages.map((message) => ({
      role: message.role,
      content: message.content as unknown as JsonValue
    }))
  }
}
