import type { ScheduleDefinition } from "@wanex/product/schedule"
import type { ConfigEntryRecord, CoreStore } from "@wanex/storage"
import {
  decodeLocalScheduleDefinitionEntry,
  decodeLocalScheduleOccurrenceEntry,
  decodeLocalSchedulePendingEntry,
  encodeLocalScheduleOccurrenceRecord,
  encodeLocalSchedulePendingRecord,
} from "./codec.js"
import {
  deriveLocalScheduleExecutionIdentity,
  isLocalScheduleId,
  LOCAL_SCHEDULE_OCCURRENCE_PREFIX,
  LOCAL_SCHEDULE_PENDING_PREFIX,
  localScheduleDefinitionKey,
  localScheduleOccurrenceKey,
  localScheduleOccurrencePrefix,
  localSchedulePendingKey,
} from "./identity.js"
import type {
  ClaimLocalScheduleOccurrenceRequest,
  ClaimLocalScheduleOccurrenceResult,
  LocalScheduleOccurrence,
  LocalScheduleOccurrenceDelivery,
  LocalScheduleOccurrencePage,
  LocalScheduleOccurrenceRecord,
} from "./model.js"

const MAX_LIST_LIMIT = 199
const MAX_RETAINED_SETTLED_OCCURRENCES = 64
const MAX_CLEANUP_BATCH = 64

export function createLocalScheduleOccurrenceStore(options: {
  readonly storage: CoreStore
  readonly now: () => number
}) {
  return {
    claimOccurrence: async (
      request: ClaimLocalScheduleOccurrenceRequest
    ): Promise<ClaimLocalScheduleOccurrenceResult> =>
      await claimOccurrence(options.storage, request, options.now),
    listOccurrences: async (request: {
      readonly scheduleId?: string
      readonly afterKey?: string
      readonly limit: number
    }): Promise<LocalScheduleOccurrencePage> =>
      await listOccurrences(options.storage, request),
    listPendingOccurrences: async (request: {
      readonly afterKey?: string
      readonly limit: number
    }): Promise<LocalScheduleOccurrencePage> =>
      await listPendingOccurrences(options.storage, request),
    updateOccurrenceDelivery: async (request: {
      readonly occurrence: LocalScheduleOccurrence
      readonly delivery: LocalScheduleOccurrenceDelivery
    }) => await updateOccurrenceDelivery(options.storage, request),
    pruneSettledOccurrences: async (scheduleId: string): Promise<void> =>
      await pruneSettledOccurrences(options.storage, scheduleId),
  }
}

async function claimOccurrence(
  storage: CoreStore,
  request: ClaimLocalScheduleOccurrenceRequest,
  now: () => number
): Promise<ClaimLocalScheduleOccurrenceResult> {
  requirePositiveInteger(
    request.expectedDefinitionRevision,
    "expected definition revision"
  )
  requireNonNegativeInteger(request.occurrenceAt, "occurrence time")
  if (!isLocalScheduleId(request.scheduleId)) {
    return definitionMissing(request)
  }
  const definitionKey = localScheduleDefinitionKey(request.scheduleId)
  const current = await storage.getConfigEntry(definitionKey)
  if (current === null) return definitionMissing(request)
  const decoded = decodeLocalScheduleDefinitionEntry(current)
  if (decoded.definition.revision !== request.expectedDefinitionRevision) {
    return definitionChanged(request, decoded.definition)
  }
  if (!decoded.definition.enabled) {
    return {
      kind: "local.schedule-occurrence.definition-disabled",
      scheduleId: request.scheduleId,
      occurrenceAt: request.occurrenceAt,
      definition: decoded.definition,
    }
  }

  const occurrenceKey = localScheduleOccurrenceKey({
    scheduleId: request.scheduleId,
    definitionRevision: request.expectedDefinitionRevision,
    occurrenceAt: request.occurrenceAt,
  })
  const pendingKey = localSchedulePendingKey(request.scheduleId)
  const claimedAt = safeNow(now)
  const occurrence: LocalScheduleOccurrenceRecord = {
    kind: "local.schedule-occurrence",
    scheduleId: request.scheduleId,
    definitionRevision: request.expectedDefinitionRevision,
    occurrenceAt: request.occurrenceAt,
    definition: decoded.record.definition,
    execution: deriveLocalScheduleExecutionIdentity({
      scheduleId: request.scheduleId,
      definitionRevision: request.expectedDefinitionRevision,
      occurrenceAt: request.occurrenceAt,
      definition: decoded.record.definition,
    }),
    claimedAt,
    delivery: {
      state: "pending",
      attempts: 0,
      nextAttemptAt: claimedAt,
    },
  }
  const result = await storage.compareAndApplyConfigMutations({
    conditions: [
      {
        key: definitionKey,
        expectedRevision: request.expectedDefinitionRevision,
      },
      { key: pendingKey, expectedRevision: null },
      { key: occurrenceKey, expectedRevision: null },
    ],
    puts: [
      {
        key: occurrenceKey,
        value: encodeLocalScheduleOccurrenceRecord(occurrence),
      },
      {
        key: pendingKey,
        value: encodeLocalSchedulePendingRecord({
          kind: "local.schedule-pending",
          scheduleId: request.scheduleId,
          occurrenceKey,
        }),
      },
    ],
    deletes: [],
  })
  if (result.kind === "applied") {
    const entry = requireEntry(result.entries, occurrenceKey)
    return {
      kind: "local.schedule-occurrence.claimed",
      definition: decoded.definition,
      occurrence: decodeLocalScheduleOccurrenceEntry(entry),
    }
  }

  const definitionConflict = result.conflicts.find(
    (conflict) => conflict.key === definitionKey
  )
  if (definitionConflict !== undefined) {
    if (definitionConflict.current === null) return definitionMissing(request)
    return definitionChanged(
      request,
      decodeLocalScheduleDefinitionEntry(definitionConflict.current).definition
    )
  }
  const occurrenceConflict = result.conflicts.find(
    (conflict) => conflict.key === occurrenceKey
  )
  if (occurrenceConflict?.current !== undefined && occurrenceConflict.current !== null) {
    return {
      kind: "local.schedule-occurrence.existing",
      occurrence: decodeLocalScheduleOccurrenceEntry(occurrenceConflict.current),
    }
  }
  const pendingConflict = result.conflicts.find(
    (conflict) => conflict.key === pendingKey
  )
  if (pendingConflict?.current !== undefined && pendingConflict.current !== null) {
    const pending = decodeLocalSchedulePendingEntry(pendingConflict.current)
    const pendingOccurrence = await storage.getConfigEntry(
      pending.record.occurrenceKey
    )
    if (pendingOccurrence === null) {
      throw new Error("Schedule pending record points to a missing occurrence")
    }
    const decodedPending = decodeLocalScheduleOccurrenceEntry(pendingOccurrence)
    if (decodedPending.record.delivery.state !== "pending") {
      throw new Error("Schedule pending record points to a settled occurrence")
    }
    return {
      kind: "local.schedule-occurrence.pending",
      occurrence: decodedPending,
    }
  }
  throw new Error("Schedule occurrence conflict evidence is incomplete")
}

async function listOccurrences(
  storage: CoreStore,
  request: {
    readonly scheduleId?: string
    readonly afterKey?: string
    readonly limit: number
  }
): Promise<LocalScheduleOccurrencePage> {
  const limit = boundedListLimit(request.limit)
  const prefix =
    request.scheduleId === undefined
      ? LOCAL_SCHEDULE_OCCURRENCE_PREFIX
      : localScheduleOccurrencePrefix(request.scheduleId)
  if (request.afterKey !== undefined && !request.afterKey.startsWith(prefix)) {
    throw new Error("Schedule occurrence cursor is outside its namespace")
  }
  const entries = await storage.listConfigEntries({
    prefix,
    ...(request.afterKey === undefined ? {} : { afterKey: request.afterKey }),
    limit: limit + 1,
  })
  const page = entries.slice(0, limit)
  return {
    occurrences: page.map(decodeLocalScheduleOccurrenceEntry),
    ...(entries.length <= limit || page.length === 0
      ? {}
      : { nextAfterKey: page.at(-1)!.key }),
  }
}

async function updateOccurrenceDelivery(
  storage: CoreStore,
  request: {
    readonly occurrence: LocalScheduleOccurrence
    readonly delivery: LocalScheduleOccurrenceDelivery
  }
): Promise<
  | { readonly kind: "updated"; readonly occurrence: LocalScheduleOccurrence }
  | { readonly kind: "conflict"; readonly current: LocalScheduleOccurrence | null }
> {
  const key = localScheduleOccurrenceKey(request.occurrence.record)
  const pendingKey = localSchedulePendingKey(
    request.occurrence.record.scheduleId
  )
  const pendingEntry = await storage.getConfigEntry(pendingKey)
  if (pendingEntry === null) {
    const current = await storage.getConfigEntry(key)
    return {
      kind: "conflict",
      current: current === null ? null : decodeLocalScheduleOccurrenceEntry(current),
    }
  }
  const pending = decodeLocalSchedulePendingEntry(pendingEntry)
  if (pending.record.occurrenceKey !== key) {
    const current = await storage.getConfigEntry(key)
    return {
      kind: "conflict",
      current: current === null ? null : decodeLocalScheduleOccurrenceEntry(current),
    }
  }
  const result = await storage.compareAndApplyConfigMutations({
    conditions: [
      { key, expectedRevision: request.occurrence.revision },
      { key: pendingKey, expectedRevision: pending.revision },
    ],
    puts: [
      {
        key,
        value: encodeLocalScheduleOccurrenceRecord({
          ...request.occurrence.record,
          delivery: request.delivery,
        }),
      },
    ],
    deletes: request.delivery.state === "pending" ? [] : [pendingKey],
  })
  if (result.kind === "applied") {
    return {
      kind: "updated",
      occurrence: decodeLocalScheduleOccurrenceEntry(requireEntry(result.entries, key)),
    }
  }
  const current = await storage.getConfigEntry(key)
  return {
    kind: "conflict",
    current: current === null ? null : decodeLocalScheduleOccurrenceEntry(current),
  }
}

async function listPendingOccurrences(
  storage: CoreStore,
  request: { readonly afterKey?: string; readonly limit: number }
): Promise<LocalScheduleOccurrencePage> {
  const limit = boundedListLimit(request.limit)
  if (
    request.afterKey !== undefined &&
    !request.afterKey.startsWith(LOCAL_SCHEDULE_PENDING_PREFIX)
  ) {
    throw new Error("Schedule pending cursor is outside its namespace")
  }
  const entries = await storage.listConfigEntries({
    prefix: LOCAL_SCHEDULE_PENDING_PREFIX,
    ...(request.afterKey === undefined ? {} : { afterKey: request.afterKey }),
    limit: limit + 1,
  })
  const page = entries.slice(0, limit)
  const occurrences: LocalScheduleOccurrence[] = []
  for (const entry of page) {
    const pending = decodeLocalSchedulePendingEntry(entry)
    const occurrenceEntry = await storage.getConfigEntry(
      pending.record.occurrenceKey
    )
    if (occurrenceEntry === null) {
      throw new Error("Schedule pending record points to a missing occurrence")
    }
    const occurrence = decodeLocalScheduleOccurrenceEntry(occurrenceEntry)
    if (occurrence.record.delivery.state !== "pending") {
      throw new Error("Schedule pending record points to a settled occurrence")
    }
    occurrences.push(occurrence)
  }
  return {
    occurrences,
    ...(entries.length <= limit || page.length === 0
      ? {}
      : { nextAfterKey: page.at(-1)!.key }),
  }
}

async function pruneSettledOccurrences(
  storage: CoreStore,
  scheduleId: string
): Promise<void> {
  const page = await listOccurrences(storage, {
    scheduleId,
    limit: MAX_LIST_LIMIT,
  })
  const settled = page.occurrences
    .filter((occurrence) => occurrence.record.delivery.state !== "pending")
    .sort(
      (left, right) =>
        right.record.occurrenceAt - left.record.occurrenceAt ||
        right.record.definitionRevision - left.record.definitionRevision
    )
  const expired = settled.slice(MAX_RETAINED_SETTLED_OCCURRENCES)
  for (let offset = 0; offset < expired.length; offset += MAX_CLEANUP_BATCH) {
    const batch = expired.slice(offset, offset + MAX_CLEANUP_BATCH)
    const entries = batch.map((occurrence) => ({
      key: localScheduleOccurrenceKey(occurrence.record),
      expectedRevision: occurrence.revision,
    }))
    const result = await storage.compareAndApplyConfigMutations({
      conditions: entries,
      puts: [],
      deletes: entries.map((entry) => entry.key),
    })
    if (result.kind === "conflict") return
  }
}

function definitionMissing(
  request: ClaimLocalScheduleOccurrenceRequest
): ClaimLocalScheduleOccurrenceResult {
  return {
    kind: "local.schedule-occurrence.definition-missing",
    scheduleId: request.scheduleId,
    occurrenceAt: request.occurrenceAt,
  }
}

function definitionChanged(
  request: ClaimLocalScheduleOccurrenceRequest,
  currentDefinition: ScheduleDefinition
): ClaimLocalScheduleOccurrenceResult {
  return {
    kind: "local.schedule-occurrence.definition-changed",
    scheduleId: request.scheduleId,
    occurrenceAt: request.occurrenceAt,
    expectedDefinitionRevision: request.expectedDefinitionRevision,
    currentDefinition,
  }
}

function requireEntry(
  entries: readonly ConfigEntryRecord[],
  key: string
): ConfigEntryRecord {
  const entry = entries.find((candidate) => candidate.key === key)
  if (entry === undefined) {
    throw new Error(`Storage omitted applied Schedule evidence for ${key}`)
  }
  return entry
}

function boundedListLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_LIST_LIMIT) {
    throw new Error(`Schedule list limit must be between 1 and ${MAX_LIST_LIMIT}`)
  }
  return value
}

function safeNow(now: () => number): number {
  const value = now()
  requireNonNegativeInteger(value, "Schedule clock")
  return value
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`)
  }
}

function requireNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`)
  }
}
