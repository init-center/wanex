import type {
  ScheduleDefinition,
  ScheduleDefinitionSpec,
  ScheduleMutationConflictResult,
  ScheduleMutationOperation,
  ScheduleMutationResult,
  SchedulePort,
} from "@wanex/product/schedule"
import type {
  ConfigConditionConflict,
  ConfigEntryRecord,
  CoreStore,
} from "@wanex/storage"
import {
  decodeLocalScheduleDefinitionEntry,
  decodeLocalScheduleOccurrenceEntry,
  decodeLocalSchedulePendingEntry,
  encodeLocalScheduleDefinitionRecord,
  encodeLocalScheduleOccurrenceRecord,
  encodeLocalSchedulePendingRecord,
  localScheduleDefinitionSpecsEqual,
} from "./codec.js"
import { createLocalScheduleInvalidationHub } from "./events.js"
import {
  decodeLocalScheduleCursor,
  deriveLocalScheduleExecutionIdentity,
  deriveLocalScheduleIdentity,
  encodeLocalScheduleCursor,
  isLocalScheduleId,
  LOCAL_SCHEDULE_DEFINITION_PREFIX,
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
  LocalScheduleAdapter,
  LocalScheduleDefinitionRecord,
  LocalScheduleOccurrence,
  LocalScheduleOccurrenceDelivery,
  LocalScheduleOccurrenceRecord,
} from "./model.js"
import { validateLocalScheduleDefinitionSpec } from "./recurrence.js"

const MAX_LIST_LIMIT = 100
const MAX_OCCURRENCE_LIST_LIMIT = 199
const MAX_RETAINED_SETTLED_OCCURRENCES = 64
const MAX_CLEANUP_BATCH = 64

export function createLocalScheduleAdapter(options: {
  readonly storage: CoreStore
  readonly now?: () => number
}): LocalScheduleAdapter {
  const now = options.now ?? Date.now
  const events = createLocalScheduleInvalidationHub()
  const port = createPort(options.storage, events, now)
  return {
    port,
    listDefinitionRecords: async (request) =>
      await listDefinitionRecords(options.storage, request),
    claimOccurrence: async (request) =>
      await claimOccurrence(options.storage, request, now),
    listOccurrences: async (request) =>
      await listOccurrences(options.storage, request),
    listPendingOccurrences: async (request) =>
      await listPendingOccurrences(options.storage, request),
    updateOccurrenceDelivery: async (request) =>
      await updateOccurrenceDelivery(options.storage, request),
    pruneSettledOccurrences: async (scheduleId) =>
      await pruneSettledOccurrences(options.storage, scheduleId),
    dispose: () => events.dispose(),
  }
}

async function listDefinitionRecords(
  storage: CoreStore,
  request: { readonly afterKey?: string; readonly limit: number }
): Promise<{
  readonly definitions: readonly ScheduleDefinition[]
  readonly invalidEntryCount: number
  readonly nextAfterKey?: string
}> {
  const limit = boundedOccurrenceLimit(request.limit)
  if (
    request.afterKey !== undefined &&
    !request.afterKey.startsWith(LOCAL_SCHEDULE_DEFINITION_PREFIX)
  ) {
    throw new Error("Schedule definition cursor is outside its namespace")
  }
  const entries = await storage.listConfigEntries({
    prefix: LOCAL_SCHEDULE_DEFINITION_PREFIX,
    ...(request.afterKey === undefined ? {} : { afterKey: request.afterKey }),
    limit: limit + 1,
  })
  const page = entries.slice(0, limit)
  const definitions: ScheduleDefinition[] = []
  let invalidEntryCount = 0
  for (const entry of page) {
    try {
      definitions.push(decodeLocalScheduleDefinitionEntry(entry).definition)
    } catch {
      invalidEntryCount += 1
    }
  }
  return {
    definitions,
    invalidEntryCount,
    ...(entries.length <= limit || page.length === 0
      ? {}
      : { nextAfterKey: page.at(-1)!.key }),
  }
}

function createPort(
  storage: CoreStore,
  events: ReturnType<typeof createLocalScheduleInvalidationHub>,
  now: () => number
): SchedulePort {
  return {
    async listDefinitions(request) {
      const limit = boundedLimit(request.limit)
      const afterScheduleId = decodeLocalScheduleCursor(request.cursor)
      const entries = await storage.listConfigEntries({
        prefix: LOCAL_SCHEDULE_DEFINITION_PREFIX,
        ...(afterScheduleId === undefined
          ? {}
          : { afterKey: localScheduleDefinitionKey(afterScheduleId) }),
        limit: limit + 1,
      })
      const pageEntries = entries.slice(0, limit)
      const definitions = pageEntries.map(
        (entry) => decodeLocalScheduleDefinitionEntry(entry).definition
      )
      const last = definitions.at(-1)
      return {
        definitions,
        ...(entries.length <= limit || last === undefined
          ? {}
          : { nextCursor: encodeLocalScheduleCursor(last.scheduleId) }),
      }
    },
    async readDefinition(scheduleId) {
      if (!isLocalScheduleId(scheduleId)) return null
      const entry = await storage.getConfigEntry(localScheduleDefinitionKey(scheduleId))
      return entry === null
        ? null
        : decodeLocalScheduleDefinitionEntry(entry).definition
    },
    async createDefinition(request) {
      const invalid = invalidDefinition("create", request.definition)
      if (invalid !== null) return invalid
      const identity = deriveLocalScheduleIdentity(request.idempotencyKey)
      const key = localScheduleDefinitionKey(identity.scheduleId)
      const record: LocalScheduleDefinitionRecord = {
        kind: "local.schedule-definition",
        scheduleId: identity.scheduleId,
        idempotencyDigest: identity.idempotencyDigest,
        definition: request.definition,
        createdAt: safeNow(now),
      }
      const result = await storage.compareAndApplyConfigMutations({
        conditions: [{ key, expectedRevision: null }],
        puts: [{ key, value: encodeLocalScheduleDefinitionRecord(record) }],
        deletes: [],
      })
      if (result.kind === "applied") {
        const definition = requireAppliedDefinition(result.entries, key)
        events.publish({ at: definition.updatedAt, revision: definition.revision })
        return appliedDefinition("create", definition)
      }
      const current = requireConflict(result.conflicts, key).current
      if (current === null) {
        throw new Error("Schedule create conflict is missing current evidence")
      }
      const decoded = decodeLocalScheduleDefinitionEntry(current)
      if (
        decoded.record.idempotencyDigest === identity.idempotencyDigest &&
        localScheduleDefinitionSpecsEqual(
          decoded.record.definition,
          request.definition
        )
      ) {
        return appliedDefinition("create", decoded.definition)
      }
      return {
        kind: "product.schedule.conflict",
        operation: "create",
        reason: "idempotency_conflict",
        scheduleId: identity.scheduleId,
        current: decoded.definition,
        message: "The idempotency key already identifies another Schedule definition.",
      }
    },
    async replaceDefinition(request) {
      const invalid = invalidDefinition("replace", request.definition)
      if (invalid !== null) return invalid
      return await mutateDefinition({
        storage,
        events,
        operation: "replace",
        scheduleId: request.scheduleId,
        expectedRevision: request.expectedRevision,
        update(record) {
          return { ...record, definition: request.definition }
        },
      })
    },
    async setEnabled(request) {
      return await mutateDefinition({
        storage,
        events,
        operation: "set_enabled",
        scheduleId: request.scheduleId,
        expectedRevision: request.expectedRevision,
        update(record) {
          return {
            ...record,
            definition: { ...record.definition, enabled: request.enabled },
          }
        },
      })
    },
    async removeDefinition(request) {
      if (!isLocalScheduleId(request.scheduleId)) {
        return missingConflict(
          "remove",
          request.scheduleId,
          request.expectedRevision
        )
      }
      const key = localScheduleDefinitionKey(request.scheduleId)
      const current = await storage.getConfigEntry(key)
      if (current === null) {
        return missingConflict(
          "remove",
          request.scheduleId,
          request.expectedRevision
        )
      }
      const definition = decodeLocalScheduleDefinitionEntry(current).definition
      if (definition.revision !== request.expectedRevision) {
        return revisionConflict("remove", request.expectedRevision, definition)
      }
      const result = await storage.compareAndApplyConfigMutations({
        conditions: [{ key, expectedRevision: request.expectedRevision }],
        puts: [],
        deletes: [key],
      })
      if (result.kind === "conflict") {
        return conflictFromEvidence(
          "remove",
          request.scheduleId,
          request.expectedRevision,
          requireConflict(result.conflicts, key)
        )
      }
      const revision = request.expectedRevision + 1
      events.publish({ at: safeNow(now), revision })
      return {
        kind: "product.schedule.applied",
        operation: "remove",
        scheduleId: request.scheduleId,
        revision,
      }
    },
    subscribeInvalidations: (listener) => events.subscribe(listener),
  }
}

function invalidDefinition(
  operation: "create" | "replace",
  definition: ScheduleDefinitionSpec
): ScheduleMutationResult | null {
  try {
    validateLocalScheduleDefinitionSpec(definition)
    return null
  } catch {
    return {
      kind: "product.schedule.rejected",
      operation,
      reason: "invalid_definition",
      message: "Schedule recurrence or time zone is invalid.",
    }
  }
}

async function mutateDefinition(request: {
  readonly storage: CoreStore
  readonly events: ReturnType<typeof createLocalScheduleInvalidationHub>
  readonly operation: "replace" | "set_enabled"
  readonly scheduleId: string
  readonly expectedRevision: number
  update(record: LocalScheduleDefinitionRecord): LocalScheduleDefinitionRecord
}): Promise<ScheduleMutationResult> {
  if (!isLocalScheduleId(request.scheduleId)) {
    return missingConflict(
      request.operation,
      request.scheduleId,
      request.expectedRevision
    )
  }
  const key = localScheduleDefinitionKey(request.scheduleId)
  const current = await request.storage.getConfigEntry(key)
  if (current === null) {
    return missingConflict(
      request.operation,
      request.scheduleId,
      request.expectedRevision
    )
  }
  const decoded = decodeLocalScheduleDefinitionEntry(current)
  if (decoded.definition.revision !== request.expectedRevision) {
    return revisionConflict(
      request.operation,
      request.expectedRevision,
      decoded.definition
    )
  }
  const nextRecord = request.update(decoded.record)
  const result = await request.storage.compareAndApplyConfigMutations({
    conditions: [{ key, expectedRevision: request.expectedRevision }],
    puts: [{ key, value: encodeLocalScheduleDefinitionRecord(nextRecord) }],
    deletes: [],
  })
  if (result.kind === "conflict") {
    return conflictFromEvidence(
      request.operation,
      request.scheduleId,
      request.expectedRevision,
      requireConflict(result.conflicts, key)
    )
  }
  const definition = requireAppliedDefinition(result.entries, key)
  request.events.publish({ at: definition.updatedAt, revision: definition.revision })
  return appliedDefinition(request.operation, definition)
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
): Promise<{
  readonly occurrences: readonly LocalScheduleOccurrence[]
  readonly nextAfterKey?: string
}> {
  const limit = boundedOccurrenceLimit(request.limit)
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
    puts: [{
      key,
      value: encodeLocalScheduleOccurrenceRecord({
        ...request.occurrence.record,
        delivery: request.delivery,
      }),
    }],
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
): Promise<{
  readonly occurrences: readonly LocalScheduleOccurrence[]
  readonly nextAfterKey?: string
}> {
  const limit = boundedOccurrenceLimit(request.limit)
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
    limit: MAX_OCCURRENCE_LIST_LIMIT,
  })
  const settled = page.occurrences
    .filter((occurrence) => occurrence.record.delivery.state !== "pending")
    .sort((left, right) =>
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

function conflictFromEvidence(
  operation: "replace" | "set_enabled" | "remove",
  scheduleId: string,
  expectedRevision: number,
  conflict: ConfigConditionConflict
): ScheduleMutationConflictResult {
  if (conflict.current === null) {
    return missingConflict(operation, scheduleId, expectedRevision)
  }
  return revisionConflict(
    operation,
    expectedRevision,
    decodeLocalScheduleDefinitionEntry(conflict.current).definition
  )
}

function missingConflict(
  operation: Exclude<ScheduleMutationOperation, "create">,
  scheduleId: string,
  expectedRevision: number
): ScheduleMutationConflictResult {
  return {
    kind: "product.schedule.conflict",
    operation,
    reason: "not_found",
    scheduleId,
    expectedRevision,
    message: "Schedule definition does not exist.",
  }
}

function revisionConflict(
  operation: Exclude<ScheduleMutationOperation, "create">,
  expectedRevision: number,
  current: ScheduleDefinition
): ScheduleMutationConflictResult {
  return {
    kind: "product.schedule.conflict",
    operation,
    reason: "revision_conflict",
    scheduleId: current.scheduleId,
    expectedRevision,
    current,
    message: "Schedule definition changed.",
  }
}

function appliedDefinition(
  operation: "create" | "replace" | "set_enabled",
  definition: ScheduleDefinition
): ScheduleMutationResult {
  return {
    kind: "product.schedule.applied",
    operation,
    definition,
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

function requireAppliedDefinition(
  entries: readonly ConfigEntryRecord[],
  key: string
): ScheduleDefinition {
  return decodeLocalScheduleDefinitionEntry(requireEntry(entries, key)).definition
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

function requireConflict(
  conflicts: readonly ConfigConditionConflict[],
  key: string
): ConfigConditionConflict {
  const conflict = conflicts.find((candidate) => candidate.key === key)
  if (conflict === undefined) {
    throw new Error(`Storage omitted Schedule conflict evidence for ${key}`)
  }
  return conflict
}

function boundedLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_LIST_LIMIT) {
    throw new Error(`Schedule list limit must be between 1 and ${MAX_LIST_LIMIT}`)
  }
  return value
}

function boundedOccurrenceLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_OCCURRENCE_LIST_LIMIT) {
    throw new Error(
      `Schedule occurrence list limit must be between 1 and ${MAX_OCCURRENCE_LIST_LIMIT}`
    )
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
