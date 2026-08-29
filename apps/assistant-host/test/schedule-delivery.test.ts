import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type {
  ScheduleDefinition,
  ScheduleDefinitionSpec,
} from "@wanex/assistant/schedule"
import {
  createStorageTestStore,
  type StorageTestStore,
} from "@wanex/storage/testing"
import {
  closeStartedAssistantHost,
  startAssistantHostInternal,
  type StartedAssistantHost,
} from "../src/application/assistant.js"
import { createLocalScheduleAdapter } from "../src/schedule/adapter.js"
import {
  deliverLocalScheduleOccurrence,
  skipLocalScheduleMisfire,
} from "../src/schedule/delivery.js"
import type {
  LocalScheduleAdapter,
  LocalScheduleOccurrence,
} from "../src/schedule/model.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
)
const tempDirs: string[] = []
const stores: StorageTestStore[] = []
const adapters: LocalScheduleAdapter[] = []
const hosts: StartedAssistantHost[] = []

afterEach(async () => {
  while (hosts.length > 0) {
    const host = hosts.pop()
    if (host !== undefined) await closeStartedAssistantHost(host)
  }
  while (adapters.length > 0) adapters.pop()?.dispose()
  while (stores.length > 0) await stores.pop()?.dispose()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("Local Schedule durable delivery", () => {
  it("projects safe status from durable pending and settled truth", async () => {
    const { adapter, occurrence, definition } = await createClaimedOccurrence()
    await expect(adapter.readStatus(definition.scheduleId)).resolves.toEqual({
      kind: "assistant.schedule-status",
      scheduleId: definition.scheduleId,
      definitionRevision: definition.revision,
      state: "running",
    })

    const retry = await adapter.updateOccurrenceDelivery({
      occurrence,
      delivery: {
        state: "pending",
        attempts: 1,
        nextAttemptAt: 11_000,
        lastFailure: { kind: "submission_failed", at: 10_500 },
      },
    })
    if (retry.kind !== "updated") throw new Error("expected retry update")
    await expect(adapter.readStatus(definition.scheduleId)).resolves.toEqual({
      kind: "assistant.schedule-status",
      scheduleId: definition.scheduleId,
      definitionRevision: definition.revision,
      state: "retrying",
      retryAt: 11_000,
    })

    const submitted = await adapter.updateOccurrenceDelivery({
      occurrence: retry.occurrence,
      delivery: {
        state: "submitted",
        settledAt: 12_000,
        sessionId: retry.occurrence.record.execution.sessionId,
        inputId: retry.occurrence.record.execution.inputId,
        turnId: retry.occurrence.record.execution.turnId,
        jobId: retry.occurrence.record.execution.jobId,
        submittedAt: 11_500,
      },
    })
    if (submitted.kind !== "updated") throw new Error("expected submitted update")
    await expect(adapter.readStatus(definition.scheduleId)).resolves.toEqual({
      kind: "assistant.schedule-status",
      scheduleId: definition.scheduleId,
      definitionRevision: definition.revision,
      state: "completed",
      lastOutcome: {
        kind: "submitted",
        occurrenceAt: 10_000,
        settledAt: 12_000,
      },
    })

    await expect(adapter.port.setEnabled({
      scheduleId: definition.scheduleId,
      expectedRevision: definition.revision,
      enabled: false,
    })).resolves.toMatchObject({ kind: "assistant.schedule.applied" })
    await expect(adapter.readStatus(definition.scheduleId)).resolves.toMatchObject({
      state: "disabled",
      definitionRevision: definition.revision + 1,
      lastOutcome: { kind: "submitted" },
    })

    const future = await adapter.port.createDefinition({
      definition: {
        ...scheduleSpec("Future"),
        trigger: { kind: "once", at: 20_000 },
      },
      idempotencyKey: "future-status",
    })
    const futureDefinition = requireDefinition(future)
    await expect(adapter.readStatus(futureDefinition.scheduleId)).resolves.toEqual({
      kind: "assistant.schedule-status",
      scheduleId: futureDefinition.scheduleId,
      definitionRevision: futureDefinition.revision,
      state: "scheduled",
      nextAt: 20_000,
    })
  })

  it("settles deterministic App admission and replays it idempotently", async () => {
    const { storage, adapter, occurrence } = await createClaimedOccurrence()
    const calls: unknown[] = []
    const submit = async (request: Parameters<
      StartedAssistantHost["shell"]["trustedExecution"]["submitScheduledTick"]
    >[0]) => {
      calls.push(request)
      return {
        status: "submitted" as const,
        scheduleId: request.scheduleId,
        tickId: request.tickId,
        modelEndpointId: "endpoint_schedule",
        receipt: {
          sessionId: request.sessionId!,
          inputId: request.inputId!,
          turnId: request.turnId!,
          jobId: request.jobId!,
          state: "queued" as const,
          submittedAt: 10_100,
        },
      }
    }
    const delivered = await deliverLocalScheduleOccurrence({
      adapter,
      storage,
      occurrence,
      submitScheduledTick: submit,
      now: () => 10_200,
    })
    expect(delivered).toMatchObject({
      kind: "submitted",
      occurrence: {
        revision: 2,
        record: {
          delivery: {
            state: "submitted",
            jobId: occurrence.record.execution.jobId,
            settledAt: 10_200,
          },
        },
      },
    })
    expect(calls).toEqual([
      expect.objectContaining({
        scheduleId: occurrence.record.scheduleId,
        tickId: occurrence.record.execution.tickId,
        sessionId: occurrence.record.execution.sessionId,
        inputId: occurrence.record.execution.inputId,
        turnId: occurrence.record.execution.turnId,
        jobId: occurrence.record.execution.jobId,
        nonOverlap: true,
      }),
    ])
    await expect(deliverLocalScheduleOccurrence({
      adapter,
      storage,
      occurrence: delivered.occurrence,
      submitScheduledTick: submit,
      now: () => 10_300,
    })).resolves.toMatchObject({ kind: "already_settled" })
    expect(calls).toHaveLength(1)
  })

  it("stores only a safe retry category with capped exponential backoff", async () => {
    const { storage, adapter, occurrence } = await createClaimedOccurrence()
    const failed = await deliverLocalScheduleOccurrence({
      adapter,
      storage,
      occurrence,
      submitScheduledTick: async () => {
        throw new Error("secret provider payload must not persist")
      },
      now: () => 10_000,
    })
    expect(failed).toMatchObject({
      kind: "retry_scheduled",
      occurrence: {
        record: {
          delivery: {
            state: "pending",
            attempts: 1,
            nextAttemptAt: 11_000,
            lastFailure: { kind: "submission_failed", at: 10_000 },
          },
        },
      },
    })
    expect(JSON.stringify(failed)).not.toContain("secret provider payload")
    let calls = 0
    await expect(deliverLocalScheduleOccurrence({
      adapter,
      storage,
      occurrence: failed.occurrence,
      submitScheduledTick: async () => {
        calls += 1
        throw new Error("not due")
      },
      now: () => 10_999,
    })).resolves.toMatchObject({ kind: "not_due" })
    expect(calls).toBe(0)
  })

  it("passes the exact previous submitted job to non-overlap admission", async () => {
    const { storage, adapter, definition, occurrence } =
      await createClaimedOccurrence()
    const first = await adapter.updateOccurrenceDelivery({
      occurrence,
      delivery: {
        state: "submitted",
        settledAt: 10_100,
        sessionId: occurrence.record.execution.sessionId,
        inputId: occurrence.record.execution.inputId,
        turnId: occurrence.record.execution.turnId,
        jobId: occurrence.record.execution.jobId,
        submittedAt: 10_050,
      },
    })
    expect(first.kind).toBe("updated")
    const secondClaim = await adapter.claimOccurrence({
      scheduleId: definition.scheduleId,
      expectedDefinitionRevision: definition.revision,
      occurrenceAt: 20_000,
    })
    const second = requireOccurrence(secondClaim)
    let previousJobId: string | undefined
    const result = await deliverLocalScheduleOccurrence({
      adapter,
      storage,
      occurrence: second,
      submitScheduledTick: async (request) => {
        previousJobId = request.previousJobId
        return {
          status: "skipped",
          reason: "previous_job_active",
          scheduleId: request.scheduleId,
          tickId: request.tickId,
          previousJob: {
            jobId: occurrence.record.execution.jobId,
            state: "running",
            kind: "session.turn",
            scheduledAt: 10_000,
            updatedAt: 10_100,
          },
        }
      },
      now: () => 20_100,
    })
    expect(previousJobId).toBe(occurrence.record.execution.jobId)
    expect(result).toMatchObject({
      kind: "skipped",
      occurrence: {
        record: {
          delivery: {
            state: "skipped",
            reason: "previous_job_active",
            previousJobId: occurrence.record.execution.jobId,
          },
        },
      },
    })
  })

  it("recovers an App admission committed before occurrence settlement", async () => {
    const storeDir = await createStoreDir()
    const host = await startAssistantHostInternal({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      modelEndpoint: fakeEndpoint("schedule-recovery", "schedule-recovery-model"),
    })
    hosts.push(host)
    await host.scheduleController.stop()
    const created = await host.scheduleAdapter.port.createDefinition({
      definition: scheduleSpec("Recover committed App admission"),
      idempotencyKey: "recover-app-admission",
    })
    const definition = requireDefinition(created)
    const claimed = await host.scheduleAdapter.claimOccurrence({
      scheduleId: definition.scheduleId,
      expectedDefinitionRevision: definition.revision,
      occurrenceAt: 30_000,
    })
    const occurrence = requireOccurrence(claimed)
    const execution = occurrence.record.execution
    await host.shell.trustedExecution.submitScheduledTick({
      scheduleId: definition.scheduleId,
      tickId: execution.tickId,
      text: occurrence.record.definition.prompt,
      sessionId: execution.sessionId,
      inputId: execution.inputId,
      turnId: execution.turnId,
      jobId: execution.jobId,
      idempotencyKey: execution.idempotencyKey,
      jobIdempotencyKey: execution.jobIdempotencyKey,
      nonOverlap: true,
    })

    let submitCalls = 0
    const recovered = await deliverLocalScheduleOccurrence({
      adapter: host.scheduleAdapter,
      storage: host.runtime.storage,
      occurrence,
      submitScheduledTick: async () => {
        submitCalls += 1
        throw new Error("recovery must observe the existing durable job")
      },
      now: () => occurrence.record.claimedAt + 100,
    })
    expect(recovered).toMatchObject({
      kind: "submitted",
      occurrence: {
        record: { delivery: { state: "submitted", jobId: execution.jobId } },
      },
    })
    expect(submitCalls).toBe(0)
    await expect(host.runtime.storage.listSessionInputs({
      sessionId: execution.sessionId,
    })).resolves.toHaveLength(1)
  })

  it("settles a skipped misfire without calling App", async () => {
    const { adapter, occurrence } = await createClaimedOccurrence()
    await expect(skipLocalScheduleMisfire({
      adapter,
      occurrence,
      now: () => 40_000,
    })).resolves.toMatchObject({
      kind: "skipped",
      occurrence: {
        record: {
          delivery: { state: "skipped", reason: "misfire", settledAt: 40_000 },
        },
      },
    })
  })

  it("converges concurrent pending replay through exact settlement CAS", async () => {
    const { storage, adapter, occurrence } = await createClaimedOccurrence()
    let calls = 0
    const submit = async (request: Parameters<
      StartedAssistantHost["shell"]["trustedExecution"]["submitScheduledTick"]
    >[0]) => {
      calls += 1
      return {
        status: "submitted" as const,
        scheduleId: request.scheduleId,
        tickId: request.tickId,
        modelEndpointId: "endpoint_schedule",
        receipt: {
          sessionId: request.sessionId!,
          inputId: request.inputId!,
          turnId: request.turnId!,
          jobId: request.jobId!,
          state: "queued" as const,
          submittedAt: 50_000,
        },
      }
    }
    const results = await Promise.all([
      deliverLocalScheduleOccurrence({
        adapter,
        storage,
        occurrence,
        submitScheduledTick: submit,
        now: () => 50_100,
      }),
      deliverLocalScheduleOccurrence({
        adapter,
        storage,
        occurrence,
        submitScheduledTick: submit,
        now: () => 50_101,
      }),
    ])
    expect(calls).toBe(2)
    expect(results.map((result) => result.kind).sort()).toEqual([
      "already_settled",
      "submitted",
    ])
    const page = await adapter.listOccurrences({
      scheduleId: occurrence.record.scheduleId,
      limit: 10,
    })
    expect(page.occurrences).toHaveLength(1)
    expect(page.occurrences[0]?.record.delivery.state).toBe("submitted")
  })

  it("supersedes an unsubmitted occurrence after definition replacement", async () => {
    const { storage, adapter, definition, occurrence } =
      await createClaimedOccurrence()
    const replaced = await adapter.port.replaceDefinition({
      scheduleId: definition.scheduleId,
      expectedRevision: definition.revision,
      definition: scheduleSpec("Replacement must fence the old prompt"),
    })
    expect(replaced).toMatchObject({
      kind: "assistant.schedule.applied",
      definition: { revision: 2 },
    })
    let calls = 0
    const result = await deliverLocalScheduleOccurrence({
      adapter,
      storage,
      occurrence,
      submitScheduledTick: async () => {
        calls += 1
        throw new Error("superseded occurrence must not reach App")
      },
      now: () => 60_000,
    })
    expect(calls).toBe(0)
    expect(result).toMatchObject({
      kind: "superseded",
      occurrence: {
        record: {
          delivery: { state: "skipped", reason: "superseded" },
        },
      },
    })
  })

  it("retains only the newest 64 settled occurrences", async () => {
    const { adapter, definition, occurrence } = await createClaimedOccurrence()
    await settleSkipped(adapter, occurrence, 70_000)
    for (let index = 1; index < 65; index += 1) {
      const claimed = await adapter.claimOccurrence({
        scheduleId: definition.scheduleId,
        expectedDefinitionRevision: definition.revision,
        occurrenceAt: 10_000 + index,
      })
      await settleSkipped(adapter, requireOccurrence(claimed), 70_000 + index)
    }
    await adapter.pruneSettledOccurrences(definition.scheduleId)
    const page = await adapter.listOccurrences({
      scheduleId: definition.scheduleId,
      limit: 100,
    })
    expect(page.occurrences).toHaveLength(64)
    expect(page.occurrences.map((item) => item.record.occurrenceAt))
      .not.toContain(10_000)
    expect(page.occurrences.map((item) => item.record.occurrenceAt))
      .toContain(10_064)
  })
})

async function settleSkipped(
  adapter: LocalScheduleAdapter,
  occurrence: LocalScheduleOccurrence,
  settledAt: number
): Promise<void> {
  const result = await adapter.updateOccurrenceDelivery({
    occurrence,
    delivery: { state: "skipped", reason: "misfire", settledAt },
  })
  if (result.kind !== "updated") {
    throw new Error("expected exact Schedule occurrence settlement")
  }
}

async function createClaimedOccurrence(): Promise<{
  readonly storage: StorageTestStore
  readonly adapter: LocalScheduleAdapter
  readonly definition: ScheduleDefinition
  readonly occurrence: LocalScheduleOccurrence
}> {
  const storeDir = await createStoreDir()
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin,
  })
  stores.push(storage)
  const adapter = createLocalScheduleAdapter({ storage, now: () => 10_000 })
  adapters.push(adapter)
  const created = await adapter.port.createDefinition({
    definition: scheduleSpec("Deliver the occurrence"),
    idempotencyKey: "delivery-occurrence",
  })
  const definition = requireDefinition(created)
  const claimed = await adapter.claimOccurrence({
    scheduleId: definition.scheduleId,
    expectedDefinitionRevision: definition.revision,
    occurrenceAt: 10_000,
  })
  return { storage, adapter, definition, occurrence: requireOccurrence(claimed) }
}

function requireOccurrence(result: Awaited<
  ReturnType<LocalScheduleAdapter["claimOccurrence"]>
>): LocalScheduleOccurrence {
  if (
    result.kind !== "local.schedule-occurrence.claimed" &&
    result.kind !== "local.schedule-occurrence.existing"
  ) {
    throw new Error("expected durable Schedule occurrence")
  }
  return result.occurrence
}

function requireDefinition(result: Awaited<
  ReturnType<LocalScheduleAdapter["port"]["createDefinition"]>
>): ScheduleDefinition {
  if (result.kind !== "assistant.schedule.applied" || result.operation === "remove") {
    throw new Error("expected applied Schedule definition")
  }
  return result.definition
}

function scheduleSpec(prompt: string): ScheduleDefinitionSpec {
  return {
    prompt,
    enabled: true,
    trigger: { kind: "once", at: 10_000 },
    sessionPolicy: { kind: "isolated" },
    modelPolicy: { kind: "active" },
    overlapPolicy: "skip_if_running",
    misfirePolicy: "fire_once",
  }
}

function fakeEndpoint(id: string, modelId: string) {
  return {
    id,
    connection: { id, providerId: "fake" },
    protocol: { id: "fake" },
    model: {
      id: modelId,
      operations: ["conversation" as const],
      inputModalities: ["text" as const],
      outputModalities: ["text" as const],
      features: [],
      catalog: {
        source: "builtin" as const,
        catalogId: `assistant-host.schedule.${id}`,
        revision: "1",
      },
    },
  }
}

async function createStoreDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-schedule-delivery-"))
  tempDirs.push(dir)
  return dir
}
