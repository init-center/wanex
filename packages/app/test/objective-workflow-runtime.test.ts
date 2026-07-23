import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { ObjectiveWorkflow } from "../src/workflows/objective/index.js"

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
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/app-objective-workflow", () => {
  it("records an objective lifecycle with attempts, verifications, and history", async () => {
    const { runtime, storage } = await createRuntime()
    await storage.createSession({
      id: "ses_objective_runtime",
      kind: "agent",
      title: "Objective source"
    })

    const objective = await runtime.createObjective({
      id: "objective_runtime",
      objective: "Reduce login LCP below 2.5s",
      scope: "apps/web",
      constraints: ["do not change public auth API"],
      successCriteria: ["verification passes"],
      stopPolicy: {
        maxAttempts: 3,
        requireVerification: true
      },
      references: [
        { kind: "session", id: "ses_objective_runtime", role: "source" }
      ],
      metadata: { source: "runtime-test" },
      idempotencyKey: "app-objective-workflow-key"
    })
    const duplicate = await runtime.createObjective({
      objective: "Reduce login LCP below 2.5s",
      scope: "apps/web",
      constraints: ["do not change public auth API"],
      successCriteria: ["verification passes"],
      stopPolicy: {
        maxAttempts: 3,
        requireVerification: true
      },
      references: [
        { kind: "session", id: "ses_objective_runtime", role: "source" }
      ],
      metadata: { source: "runtime-test" },
      idempotencyKey: "app-objective-workflow-key"
    })

    expect(duplicate.id).toBe(objective.id)
    expect(objective).toMatchObject({
      id: "objective_runtime",
      principalId: "agent_objective_runtime",
      state: "open",
      metadata: { source: "runtime-test" }
    })

    await expect(
      runtime.markSucceeded({
        objectiveId: objective.id,
        actorId: "runtime_objective_runtime"
      })
    ).rejects.toThrow(/invalid objective run transition/)

    await expect(
      runtime.startObjective({
        objectiveId: objective.id,
        actorId: "reviewer_objective_runtime",
        reason: "approved"
      })
    ).resolves.toMatchObject({
      operation: "start",
      fromState: "open",
      toState: "running"
    })

    await expect(
      runtime.recordBlocked({
        objectiveId: objective.id,
        actorId: "runtime_objective_runtime",
        reason: "needs credentials"
      })
    ).resolves.toMatchObject({
      operation: "record_blocked",
      fromState: "running",
      toState: "blocked"
    })

    await runtime.startObjective({
      objectiveId: objective.id,
      actorId: "reviewer_objective_runtime",
      reason: "credentials provided"
    })

    const attempt = await runtime.recordAttempt({
      id: "objectiveatt_runtime_1",
      objectiveId: objective.id,
      attemptNumber: 1,
      state: "succeeded",
      sessionId: "ses_objective_runtime",
      sessionTurnId: "turn_objective_runtime",
      schedulerJobId: "job_objective_runtime",
      summary: "Verified target",
      result: { lcpMs: 2300 },
      idempotencyKey: "app-objective-workflow-attempt"
    })
    const duplicateAttempt = await runtime.recordAttempt({
      id: "ignored_objectiveatt_runtime",
      objectiveId: objective.id,
      attemptNumber: 1,
      state: "succeeded",
      sessionId: "ses_objective_runtime",
      sessionTurnId: "turn_objective_runtime",
      schedulerJobId: "job_objective_runtime",
      summary: "Verified target",
      result: { lcpMs: 2300 },
      idempotencyKey: "app-objective-workflow-attempt"
    })
    expect(duplicateAttempt.id).toBe(attempt.id)
    expect(attempt.sessionTurnId).toBe("turn_objective_runtime")

    const verification = await runtime.recordVerification({
      id: "objectivever_runtime_1",
      objectiveId: objective.id,
      attemptId: attempt.id,
      kind: "script",
      state: "passed",
      reason: "tests passed",
      evidence: { command: "npm test", exitCode: 0 },
      verifierRef: "local-script",
      idempotencyKey: "app-objective-workflow-verification"
    })

    await expect(
      runtime.markSucceeded({
        objectiveId: objective.id,
        actorId: "runtime_objective_runtime",
        metadata: { verificationId: verification.id }
      })
    ).resolves.toMatchObject({
      operation: "mark_succeeded",
      fromState: "running",
      toState: "succeeded"
    })

    await expect(runtime.getObjective(objective.id)).resolves.toMatchObject({
      id: objective.id,
      state: "succeeded"
    })
    await expect(
      runtime.listObjectives({
        referenceKind: "session",
        referenceId: "ses_objective_runtime",
        state: "succeeded"
      })
    ).resolves.toEqual([expect.objectContaining({ id: objective.id })])

    const history = await runtime.getHistory(objective.id)
    expect(history?.objective.state).toBe("succeeded")
    expect(history?.operations.map((operation) => operation.operation)).toEqual([
      "start",
      "record_blocked",
      "start",
      "mark_succeeded"
    ])
    expect(history?.attempts).toEqual([
      expect.objectContaining({ id: attempt.id, state: "succeeded" })
    ])
    expect(history?.verifications).toEqual([
      expect.objectContaining({ id: verification.id, state: "passed" })
    ])

    const events = await storage.queryEvents({
      scope: { objectiveId: objective.id },
      limit: 10
    })
    expect(events.map((event) => event.type)).toEqual([
      "objective.run.created",
      "objective.run.operation_recorded",
      "objective.run.operation_recorded",
      "objective.run.operation_recorded",
      "objective.attempt.recorded",
      "objective.verification.recorded",
      "objective.run.operation_recorded"
    ])
  })

  it("records terminal failure and cancellation without downstream side effects", async () => {
    const { runtime } = await createRuntime()
    const failed = await runtime.createObjective({
      id: "objective_failed_runtime",
      objective: "Fail explicitly"
    })
    const cancelled = await runtime.createObjective({
      id: "objective_cancel_runtime",
      objective: "Cancel explicitly"
    })

    await runtime.startObjective({ objectiveId: failed.id })
    await expect(
      runtime.markFailed({
        objectiveId: failed.id,
        reason: "verification failed"
      })
    ).resolves.toMatchObject({
      operation: "mark_failed",
      fromState: "running",
      toState: "failed"
    })

    await expect(
      runtime.cancelObjective({
        objectiveId: cancelled.id,
        actorId: "reviewer_objective_runtime",
        reason: "superseded"
      })
    ).resolves.toMatchObject({
      operation: "cancel",
      fromState: "open",
      toState: "cancelled"
    })

    await expect(runtime.getObjective(failed.id)).resolves.toMatchObject({
      state: "failed",
      closedAt: expect.any(Number)
    })
    await expect(runtime.getObjective(cancelled.id)).resolves.toMatchObject({
      state: "cancelled",
      closedAt: expect.any(Number)
    })
  })
})

async function createRuntime(): Promise<{
  readonly storeDir: string
  readonly storage: StorageTestStore
  readonly runtime: ObjectiveWorkflow
}> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-app-objective-workflow-"))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({ kind: "local-system-service", mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  const runtime = new ObjectiveWorkflow({
    storage,
    principalId: "agent_objective_runtime"
  })
  return { storeDir, storage, runtime }
}
