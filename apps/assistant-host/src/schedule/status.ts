import type { ScheduleStatus } from "@wanex/assistant/schedule"
import type { CoreStore } from "@wanex/storage"
import {
  decodeLocalScheduleDefinitionEntry,
  decodeLocalScheduleOccurrenceEntry,
  decodeLocalSchedulePendingEntry,
} from "./codec.js"
import {
  isLocalScheduleId,
  localScheduleDefinitionKey,
  localScheduleOccurrencePrefix,
  localSchedulePendingKey,
} from "./identity.js"
import type { LocalScheduleOccurrence } from "./model.js"
import { planLocalScheduleRecurrence } from "./recurrence.js"

const MAX_HISTORY_SCAN = 65

export function createLocalScheduleStatusReader(options: {
  readonly storage: CoreStore
  readonly now: () => number
}) {
  return {
    readStatus: async (scheduleId: string): Promise<ScheduleStatus | null> =>
      await readStatus(options.storage, scheduleId, options.now),
  }
}

async function readStatus(
  storage: CoreStore,
  scheduleId: string,
  now: () => number,
): Promise<ScheduleStatus | null> {
  if (!isLocalScheduleId(scheduleId)) return null
  const definitionEntry = await storage.getConfigEntry(
    localScheduleDefinitionKey(scheduleId),
  )
  if (definitionEntry === null) return null
  const definition = decodeLocalScheduleDefinitionEntry(definitionEntry).definition
  const latestOutcome = await latestSettledOutcome(storage, scheduleId)
  const pendingEntry = await storage.getConfigEntry(localSchedulePendingKey(scheduleId))
  if (pendingEntry !== null) {
    const pending = decodeLocalSchedulePendingEntry(pendingEntry)
    if (pending.record.scheduleId !== scheduleId) {
      throw new Error("Schedule pending record has a conflicting schedule id")
    }
    const occurrenceEntry = await storage.getConfigEntry(
      pending.record.occurrenceKey,
    )
    if (occurrenceEntry === null) {
      throw new Error("Schedule pending record points to a missing occurrence")
    }
    const occurrence = decodeLocalScheduleOccurrenceEntry(occurrenceEntry)
    if (
      occurrence.record.scheduleId !== scheduleId ||
      occurrence.record.delivery.state !== "pending"
    ) {
      throw new Error("Schedule pending record points to a settled occurrence")
    }
    const delivery = occurrence.record.delivery
    const retrying = delivery.lastFailure !== undefined &&
      delivery.nextAttemptAt > safeNow(now)
    return {
      kind: "assistant.schedule-status",
      scheduleId,
      definitionRevision: definition.revision,
      state: retrying ? "retrying" : "running",
      ...(retrying ? { retryAt: delivery.nextAttemptAt } : {}),
      ...(latestOutcome === undefined ? {} : { lastOutcome: latestOutcome }),
    }
  }

  if (!definition.enabled) {
    return {
      kind: "assistant.schedule-status",
      scheduleId,
      definitionRevision: definition.revision,
      state: "disabled",
      ...(latestOutcome === undefined ? {} : { lastOutcome: latestOutcome }),
    }
  }

  const plan = planLocalScheduleRecurrence({
    definition,
    now: safeNow(now),
  })
  const dueAlreadySettled = plan.due !== undefined &&
    latestOutcome?.occurrenceAt === plan.due.occurrenceAt
  if (plan.due !== undefined && !dueAlreadySettled) {
    return {
      kind: "assistant.schedule-status",
      scheduleId,
      definitionRevision: definition.revision,
      state: "running",
      ...(latestOutcome === undefined ? {} : { lastOutcome: latestOutcome }),
    }
  }
  if (plan.nextAt !== undefined) {
    return {
      kind: "assistant.schedule-status",
      scheduleId,
      definitionRevision: definition.revision,
      state: "scheduled",
      nextAt: plan.nextAt,
      ...(latestOutcome === undefined ? {} : { lastOutcome: latestOutcome }),
    }
  }
  if (latestOutcome === undefined) {
    return {
      kind: "assistant.schedule-status",
      scheduleId,
      definitionRevision: definition.revision,
      state: "running",
    }
  }
  return {
    kind: "assistant.schedule-status",
    scheduleId,
    definitionRevision: definition.revision,
    state: "completed",
    lastOutcome: latestOutcome,
  }
}

async function latestSettledOutcome(
  storage: CoreStore,
  scheduleId: string,
): Promise<ScheduleStatus["lastOutcome"]> {
  const prefix = localScheduleOccurrencePrefix(scheduleId)
  const entries = await storage.listConfigEntries({
    prefix,
    limit: MAX_HISTORY_SCAN,
  })
  const occurrences: LocalScheduleOccurrence[] = entries.map(
    decodeLocalScheduleOccurrenceEntry,
  )
  const latest = occurrences
    .filter((occurrence) => occurrence.record.delivery.state !== "pending")
    .sort(
      (left, right) =>
        right.record.occurrenceAt - left.record.occurrenceAt ||
        right.record.definitionRevision - left.record.definitionRevision,
    )[0]
  if (latest === undefined) return undefined
  const delivery = latest.record.delivery
  if (delivery.state === "submitted") {
    return {
      kind: "submitted",
      occurrenceAt: latest.record.occurrenceAt,
      settledAt: delivery.settledAt,
    }
  }
  if (delivery.state !== "skipped") return undefined
  return {
    kind: "skipped",
    occurrenceAt: latest.record.occurrenceAt,
    settledAt: delivery.settledAt,
    reason: delivery.reason,
  }
}

function safeNow(now: () => number): number {
  const value = now()
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Schedule status clock must be a non-negative safe integer")
  }
  return value
}
