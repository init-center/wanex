import type {
  CreateScheduleDefinitionRequest,
  ListScheduleDefinitionsRequest,
  RemoveScheduleDefinitionRequest,
  ReplaceScheduleDefinitionRequest,
  ScheduleDefinitionInput,
  ScheduleReplacementInput,
  SetScheduleEnabledRequest
} from "../../schedule/model.js"
import {
  optionalPositiveIntegerField,
  optionalStringField,
  parseRecord,
  parseRequiredPositiveIntegerField,
  parseRequiredStringField,
  parseString,
  SurfaceValidationError
} from "./common.js"

export function parseSurfaceListSchedulesRequest(
  input: unknown
): ListScheduleDefinitionsRequest | undefined {
  if (input === undefined) return undefined
  const context = "listSchedules input"
  const record = parseRecord(input, context)
  assertFields(record, ["cursor", "limit"], context)
  return {
    ...optionalStringField(record, "cursor", context),
    ...optionalPositiveIntegerField(record, "limit", context)
  }
}

export function parseSurfaceReadScheduleRequest(input: unknown): {
  readonly scheduleId: string
} {
  const context = "readSchedule input"
  const record = parseRecord(input, context)
  assertFields(record, ["scheduleId"], context)
  return {
    scheduleId: parseRequiredStringField(record, "scheduleId", context)
  }
}

export function parseSurfaceCreateScheduleRequest(
  input: unknown
): CreateScheduleDefinitionRequest {
  const context = "createSchedule input"
  const record = parseRecord(input, context)
  assertFields(record, ["definition", "idempotencyKey"], context)
  return {
    definition: parseScheduleDefinitionInput(record.definition, context, false),
    idempotencyKey: parseString(
      record.idempotencyKey,
      `${context}.idempotencyKey`
    )
  }
}

export function parseSurfaceReplaceScheduleRequest(
  input: unknown
): ReplaceScheduleDefinitionRequest {
  const context = "replaceSchedule input"
  const record = parseRecord(input, context)
  assertFields(record, ["scheduleId", "expectedRevision", "definition"], context)
  return {
    scheduleId: parseRequiredStringField(
      record,
      "scheduleId",
      context
    ),
    expectedRevision: parseRequiredPositiveIntegerField(
      record,
      "expectedRevision",
      context
    ),
    definition: parseScheduleDefinitionInput(
      record.definition,
      context,
      true
    ) as ScheduleReplacementInput
  }
}

export function parseSurfaceSetScheduleEnabledRequest(
  input: unknown
): SetScheduleEnabledRequest {
  const context = "setScheduleEnabled input"
  const record = parseRecord(input, context)
  assertFields(record, ["scheduleId", "expectedRevision", "enabled"], context)
  if (typeof record.enabled !== "boolean") {
    throw new SurfaceValidationError(`${context}.enabled must be a boolean`)
  }
  return {
    scheduleId: parseRequiredStringField(record, "scheduleId", context),
    expectedRevision: parseRequiredPositiveIntegerField(
      record,
      "expectedRevision",
      context
    ),
    enabled: record.enabled
  }
}

export function parseSurfaceRemoveScheduleRequest(
  input: unknown
): RemoveScheduleDefinitionRequest {
  const context = "removeSchedule input"
  const record = parseRecord(input, context)
  assertFields(record, ["scheduleId", "expectedRevision"], context)
  return {
    scheduleId: parseRequiredStringField(record, "scheduleId", context),
    expectedRevision: parseRequiredPositiveIntegerField(
      record,
      "expectedRevision",
      context
    )
  }
}

function parseScheduleDefinitionInput(
  input: unknown,
  parentContext: string,
  replacement: boolean
): ScheduleDefinitionInput | ScheduleReplacementInput {
  const context = `${parentContext}.definition`
  const record = parseRecord(input, context)
  const allowed = [
    "title",
    "prompt",
    "enabled",
    "trigger",
    "sessionPolicy",
    "modelPolicy",
    "misfirePolicy"
  ]
  assertFields(record, allowed, context)
  const enabled = record.enabled
  let normalizedEnabled: boolean | undefined
  if (enabled === undefined) {
    if (replacement) {
      throw new SurfaceValidationError(`${context}.enabled must be a boolean`)
    }
  } else if (typeof enabled === "boolean") {
    normalizedEnabled = enabled
  } else {
    throw new SurfaceValidationError(`${context}.enabled must be a boolean`)
  }
  const base = {
    ...optionalStringField(record, "title", context),
    prompt: parseString(record.prompt, `${context}.prompt`),
    trigger: parseScheduleTrigger(record.trigger, context),
    ...(record.sessionPolicy === undefined
      ? {}
      : { sessionPolicy: parseSessionPolicy(record.sessionPolicy, context) }),
    ...(record.modelPolicy === undefined
      ? {}
      : { modelPolicy: parseModelPolicy(record.modelPolicy, context) }),
    ...(record.misfirePolicy === undefined
      ? {}
      : { misfirePolicy: parseMisfirePolicy(record.misfirePolicy, context) })
  }
  return replacement
    ? ({ ...base, enabled: normalizedEnabled as boolean } as ScheduleReplacementInput)
    : {
        ...base,
        ...(normalizedEnabled === undefined ? {} : { enabled: normalizedEnabled })
      } as ScheduleDefinitionInput
}

function parseScheduleTrigger(
  input: unknown,
  parentContext: string
): ScheduleDefinitionInput["trigger"] {
  const context = `${parentContext}.trigger`
  const record = parseRecord(input, context)
  if (record.kind === "once") {
    assertFields(record, ["kind", "at"], context)
    return {
      kind: "once",
      at: parseNonNegativeInteger(record.at, `${context}.at`)
    }
  }
  if (record.kind === "interval") {
    assertFields(record, ["kind", "anchorAt", "intervalMs"], context)
    return {
      kind: "interval",
      anchorAt: parseNonNegativeInteger(
        record.anchorAt,
        `${context}.anchorAt`
      ),
      intervalMs: parsePositiveInteger(
        record.intervalMs,
        `${context}.intervalMs`
      )
    }
  }
  if (record.kind === "cron") {
    assertFields(record, ["kind", "expression", "timeZone"], context)
    return {
      kind: "cron",
      expression: parseString(record.expression, `${context}.expression`),
      timeZone: parseString(record.timeZone, `${context}.timeZone`)
    }
  }
  throw new SurfaceValidationError(`${context}.kind is not supported`)
}

function parseSessionPolicy(
  input: unknown,
  parentContext: string
): ScheduleDefinitionInput["sessionPolicy"] {
  const context = `${parentContext}.sessionPolicy`
  const record = parseRecord(input, context)
  if (record.kind === "isolated") {
    assertFields(record, ["kind"], context)
    return { kind: "isolated" }
  }
  if (record.kind === "reuse") {
    assertFields(record, ["kind", "sessionId"], context)
    return {
      kind: "reuse",
      sessionId: parseRequiredStringField(record, "sessionId", context)
    }
  }
  throw new SurfaceValidationError(`${context}.kind is not supported`)
}

function parseModelPolicy(
  input: unknown,
  parentContext: string
): ScheduleDefinitionInput["modelPolicy"] {
  const context = `${parentContext}.modelPolicy`
  const record = parseRecord(input, context)
  if (record.kind === "active") {
    assertFields(record, ["kind"], context)
    return { kind: "active" }
  }
  if (record.kind === "pinned") {
    assertFields(record, ["kind", "endpointId"], context)
    return {
      kind: "pinned",
      endpointId: parseRequiredStringField(record, "endpointId", context)
    }
  }
  throw new SurfaceValidationError(`${context}.kind is not supported`)
}

function parseMisfirePolicy(
  input: unknown,
  parentContext: string
): ScheduleDefinitionInput["misfirePolicy"] {
  if (input === "fire_once" || input === "skip") return input
  throw new SurfaceValidationError(
    `${parentContext}.misfirePolicy is not supported`
  )
}

function parsePositiveInteger(value: unknown, context: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new SurfaceValidationError(`${context} must be a positive integer`)
  }
  return value as number
}

function parseNonNegativeInteger(value: unknown, context: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new SurfaceValidationError(
      `${context} must be a non-negative integer`
    )
  }
  return value as number
}

function assertFields(
  record: Record<string, unknown>,
  allowed: readonly string[],
  context: string
): void {
  const unexpected = Object.keys(record).find((key) => !allowed.includes(key))
  if (unexpected !== undefined) {
    throw new SurfaceValidationError(`${context}.${unexpected} is not supported`)
  }
}
