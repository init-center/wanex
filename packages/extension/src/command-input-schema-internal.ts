import {
  DEFAULT_APP_COMMAND_INPUT_SCHEMA_LIMITS
} from "./command-input-schema-constants.js"
import type {
  AppCommandInputSchemaErrorCode,
  AppCommandInputSchemaLimits
} from "./command-input-schema-types.js"

export class CommandInputSchemaParseError extends Error {
  constructor(
    readonly code: AppCommandInputSchemaErrorCode,
    readonly path: string,
    message: string
  ) {
    super(message)
    this.name = "CommandInputSchemaParseError"
  }
}

export interface CommandInputSchemaParseState {
  readonly limits: AppCommandInputSchemaLimits
  readonly schemaAncestors: Set<object>
  schemaNodes: number
  properties: number
  enumValues: number
  valueNodes: number
}

export function resolveSchemaLimits(
  overrides: Partial<AppCommandInputSchemaLimits> | undefined
): AppCommandInputSchemaLimits {
  if (overrides === undefined) {
    return DEFAULT_APP_COMMAND_INPUT_SCHEMA_LIMITS
  }
  const resolved = { ...DEFAULT_APP_COMMAND_INPUT_SCHEMA_LIMITS }
  for (const key of Object.keys(overrides) as (keyof AppCommandInputSchemaLimits)[]) {
    const value = overrides[key]
    const maximum = DEFAULT_APP_COMMAND_INPUT_SCHEMA_LIMITS[key]
    if (
      value === undefined ||
      !Number.isInteger(value) ||
      value <= 0 ||
      value > maximum
    ) {
      fail(
        "invalid",
        "/",
        `schema limit ${key} must be a positive integer no greater than ${maximum}`
      )
    }
    resolved[key] = value
  }
  return resolved
}

export function readPlainDataRecord(
  input: unknown,
  path: string
): Readonly<Record<string, unknown>> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    fail("invalid", path, "schema node must be a plain object")
  }
  const prototype = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) {
    fail("invalid", path, "schema node must use a plain object prototype")
  }
  const descriptors = Object.getOwnPropertyDescriptors(input)
  const record: Record<string, unknown> = {}
  for (const ownKey of Reflect.ownKeys(input)) {
    if (typeof ownKey !== "string") {
      fail("invalid", path, "schema objects must not contain symbol properties")
    }
    const key = ownKey
    const descriptor = descriptors[key]
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail("invalid", joinSchemaPath(path, key), "accessor properties are not allowed")
    }
    defineDataProperty(record, key, descriptor.value)
  }
  return record
}

export function readPlainDataArray(
  input: unknown,
  path: string
): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
    fail("invalid", path, "schema arrays must be plain arrays")
  }
  let indexCount = 0
  for (const ownKey of Reflect.ownKeys(input)) {
    if (typeof ownKey !== "string") {
      fail("invalid", path, "schema arrays must not contain symbol properties")
    }
    if (ownKey === "length") {
      continue
    }
    if (!isCanonicalArrayIndex(ownKey, input.length)) {
      fail(
        "invalid",
        joinSchemaPath(path, ownKey),
        "schema arrays must not contain non-index properties"
      )
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, ownKey)
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail("invalid", joinSchemaPath(path, ownKey), "array accessors are not allowed")
    }
    indexCount += 1
  }
  if (indexCount !== input.length) {
    fail("invalid", path, "sparse arrays are not allowed")
  }
  return input
}

export function defineDataProperty<T>(
  target: Record<string, T>,
  key: string,
  value: T
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  })
}

export function rejectUnknownKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  path: string
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      fail(
        "unsupported",
        joinSchemaPath(path, key),
        "unsupported schema keyword"
      )
    }
  }
}

export function readOptionalString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  maxLength: number
): string | undefined {
  const value = record[key]
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== "string") {
    fail("invalid", joinSchemaPath(path, key), `${key} must be a string`)
  }
  if (value.length > maxLength) {
    fail(
      "limit_exceeded",
      joinSchemaPath(path, key),
      `${key} exceeds the ${maxLength} character limit`
    )
  }
  return value
}

export function rejectUndefinedValues(
  record: Readonly<Record<string, unknown>>,
  path: string
): void {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) {
      fail(
        "invalid",
        joinSchemaPath(path, key),
        "schema values must be JSON-compatible and must not be undefined"
      )
    }
  }
}

export function readOptionalBoolean(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string
): boolean | undefined {
  const value = record[key]
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== "boolean") {
    fail("invalid", joinSchemaPath(path, key), `${key} must be a boolean`)
  }
  return value
}

export function readOptionalFiniteNumber(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string
): number | undefined {
  const value = record[key]
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("invalid", joinSchemaPath(path, key), `${key} must be a finite number`)
  }
  return value
}

export function readOptionalBoundedInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  maximum: number
): number | undefined {
  const value = record[key]
  if (value === undefined) {
    return undefined
  }
  if (!Number.isInteger(value) || (value as number) < 0) {
    fail(
      "invalid",
      joinSchemaPath(path, key),
      `${key} must be a non-negative integer`
    )
  }
  if ((value as number) > maximum) {
    fail(
      "limit_exceeded",
      joinSchemaPath(path, key),
      `${key} exceeds the supported bound ${maximum}`
    )
  }
  return value as number
}

export function assertRange(
  minimum: number | undefined,
  maximum: number | undefined,
  path: string,
  minimumKey: string,
  maximumKey: string
): void {
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    fail(
      "invalid",
      path,
      `${minimumKey} must not exceed ${maximumKey}`
    )
  }
}

export function joinSchemaPath(path: string, key: string): string {
  const safeKey = boundedPathSegment(key)
  const escaped = safeKey.replaceAll("~", "~0").replaceAll("/", "~1")
  return path === "/" ? `/${escaped}` : `${path}/${escaped}`
}

export function fail(
  code: AppCommandInputSchemaErrorCode,
  path: string,
  message: string
): never {
  throw new CommandInputSchemaParseError(code, path, message)
}

function isCanonicalArrayIndex(key: string, length: number): boolean {
  if (!/^(0|[1-9]\d*)$/.test(key)) {
    return false
  }
  const index = Number(key)
  return Number.isSafeInteger(index) && index >= 0 && index < length
}

function boundedPathSegment(input: string): string {
  const sanitized = input.replace(/[\u0000-\u001f\u007f]/g, "?")
  const maximum = 128
  return sanitized.length <= maximum
    ? sanitized
    : `${sanitized.slice(0, maximum - 3)}...`
}
