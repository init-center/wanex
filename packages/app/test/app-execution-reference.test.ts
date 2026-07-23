import { describe, expect, it } from "vitest"
import type { SchedulerJobRecord, SchedulerJobState } from "@wanex/protocol"
import {
  createWanexApp,
  projectWanexAppJobExecutionReference
} from "../src/internal-index.js"
import { createStoreDir, serviceBin } from "./helpers.js"

describe("wanex-app execution reference read contract", () => {
  it.each([
    ["succeeded", undefined],
    ["retry_scheduled", "retry_pending"],
    ["failed", "terminal_failure"],
    ["cancelled", "cancelled"]
  ] as const)(
    "projects %s jobs without raw scheduler internals",
    (state, failureCategory) => {
      const result = projectWanexAppJobExecutionReference(
        jobRecord(state)
      )

      expect(result).toEqual({
        kind: "found",
        reference: {
          kind: "job",
          id: "job_execution_reference"
        },
        activity: {
          kind: "wanex-app.execution.job",
          jobKind: "plugin.action",
          state,
          attempt: 2,
          maxAttempts: 4,
          scheduledAt: 100,
          notBefore: 110,
          createdAt: 90,
          updatedAt: 120,
          finishedAt: 130,
          ...(failureCategory === undefined ? {} : { failureCategory })
        }
      })
      const serialized = JSON.stringify(result)
      for (const forbidden of [
        "secret-payload",
        "secret-result",
        "secret-error",
        "principal-secret",
        "lease-secret",
        "worker-secret",
        "idempotency-secret",
        "budget-secret"
      ]) {
        expect(serialized).not.toContain(forbidden)
      }
    }
  )

  it("reads found, missing, and unsupported references through the trusted shell", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })

    try {
      await app.commands.runAgentTurn({
        content: [{ type: "text", text: "execution reference integration" }],
        sessionId: "ses_execution_reference",
        jobId: "job_execution_reference_integration"
      })

      await expect(
        app.commands.readExecutionReference({
          kind: " job ",
          id: " job_execution_reference_integration "
        })
      ).resolves.toMatchObject({
        kind: "found",
        reference: {
          kind: "job",
          id: "job_execution_reference_integration"
        },
        activity: {
          kind: "wanex-app.execution.job",
          jobKind: "session.turn",
          state: "succeeded"
        }
      })
      await expect(
        app.commands.readExecutionReference({
          kind: "job",
          id: "job_missing"
        })
      ).resolves.toEqual({
        kind: "missing",
        reference: { kind: "job", id: "job_missing" }
      })
      await expect(
        app.commands.readExecutionReference({
          kind: "resource",
          id: "res_unsupported"
        })
      ).resolves.toEqual({
        kind: "unsupported",
        reference: { kind: "resource", id: "res_unsupported" }
      })
    } finally {
      await app.dispose()
    }
  })

  it.each([
    [{ kind: "", id: "job_1" }, "execution reference kind"],
    [{ kind: "job", id: "  " }, "execution reference id"]
  ])("rejects invalid references", async (request, message) => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })

    try {
      await expect(
        app.commands.readExecutionReference(request)
      ).rejects.toThrow(message)
    } finally {
      await app.dispose()
    }
  })
})

function jobRecord(state: SchedulerJobState): SchedulerJobRecord {
  return {
    id: "job_execution_reference",
    kind: "plugin.action",
    state,
    principalId: "principal-secret",
    payload: { value: "secret-payload" },
    scheduledAt: 100,
    notBefore: 110,
    priority: 9,
    attempt: 2,
    maxAttempts: 4,
    retryPolicy: {
      strategy: "exponential",
      initialDelayMs: 10,
      maxDelayMs: 1_000
    },
    idempotencyKey: "idempotency-secret",
    budgetGrantId: "budget-secret",
    leaseOwner: "worker-secret",
    leaseToken: "lease-secret",
    leaseExpiresAt: 125,
    result: { value: "secret-result" },
    lastError: { message: "secret-error" },
    createdAt: 90,
    updatedAt: 120,
    finishedAt: 130
  }
}
