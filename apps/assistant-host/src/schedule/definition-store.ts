import type {
  ScheduleDefinition,
  ScheduleDefinitionSpec,
  ScheduleMutationConflictResult,
  ScheduleMutationOperation,
  ScheduleMutationResult,
  SchedulePort,
  ScheduleStatus,
} from "@wanex/assistant/schedule"
import type {
  ConfigConditionConflict,
  ConfigEntryRecord,
  CoreStore,
} from "@wanex/storage"
import {
  decodeLocalScheduleDefinitionEntry,
  encodeLocalScheduleDefinitionRecord,
  localScheduleDefinitionSpecsEqual,
} from "./codec.js"
import type { LocalScheduleInvalidationHub } from "./events.js"
import {
  decodeLocalScheduleCursor,
  deriveLocalScheduleIdentity,
  encodeLocalScheduleCursor,
  isLocalScheduleId,
  LOCAL_SCHEDULE_DEFINITION_PREFIX,
  localScheduleDefinitionKey,
} from "./identity.js"
import type {
  LocalScheduleDefinitionPage,
  LocalScheduleDefinitionRecord,
} from "./model.js"
import { validateLocalScheduleDefinitionSpec } from "./recurrence.js"

const MAX_LIST_LIMIT = 100
const MAX_INTERNAL_LIST_LIMIT = 199

export function createLocalScheduleDefinitionStore(options: {
  readonly storage: CoreStore
  readonly events: LocalScheduleInvalidationHub
  readonly now: () => number
  readonly readStatus: (scheduleId: string) => Promise<ScheduleStatus | null>
}) {
  return {
    port: createPort(
      options.storage,
      options.events,
      options.now,
      options.readStatus,
    ),
    listDefinitionRecords: async (request: {
      readonly afterKey?: string
      readonly limit: number
    }): Promise<LocalScheduleDefinitionPage> =>
      await listDefinitionRecords(options.storage, request),
  }
}

async function listDefinitionRecords(
  storage: CoreStore,
  request: { readonly afterKey?: string; readonly limit: number }
): Promise<LocalScheduleDefinitionPage> {
  const limit = boundedInternalListLimit(request.limit)
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
  events: LocalScheduleInvalidationHub,
  now: () => number,
  readStatus: (scheduleId: string) => Promise<ScheduleStatus | null>,
): SchedulePort {
  return {
    async listDefinitions(request) {
      const limit = boundedListLimit(request.limit)
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
    async readStatus(scheduleId) {
      return await readStatus(scheduleId)
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
        kind: "assistant.schedule.conflict",
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
        kind: "assistant.schedule.applied",
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
      kind: "assistant.schedule.rejected",
      operation,
      reason: "invalid_definition",
      message: "Schedule recurrence or time zone is invalid.",
    }
  }
}

async function mutateDefinition(request: {
  readonly storage: CoreStore
  readonly events: LocalScheduleInvalidationHub
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
    kind: "assistant.schedule.conflict",
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
    kind: "assistant.schedule.conflict",
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
    kind: "assistant.schedule.applied",
    operation,
    definition,
  }
}

function requireAppliedDefinition(
  entries: readonly ConfigEntryRecord[],
  key: string
): ScheduleDefinition {
  const entry = entries.find((candidate) => candidate.key === key)
  if (entry === undefined) {
    throw new Error(`Storage omitted applied Schedule evidence for ${key}`)
  }
  return decodeLocalScheduleDefinitionEntry(entry).definition
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

function boundedListLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_LIST_LIMIT) {
    throw new Error(`Schedule list limit must be between 1 and ${MAX_LIST_LIMIT}`)
  }
  return value
}

function boundedInternalListLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_INTERNAL_LIST_LIMIT) {
    throw new Error(
      `Schedule internal list limit must be between 1 and ${MAX_INTERNAL_LIST_LIMIT}`
    )
  }
  return value
}

function safeNow(now: () => number): number {
  const value = now()
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Schedule clock must be a non-negative safe integer")
  }
  return value
}
