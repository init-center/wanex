import type {
  AppCommandInputArraySchema,
  AppCommandInputBooleanSchema,
  AppCommandInputIntegerSchema,
  AppCommandInputNumberSchema,
  AppCommandInputSchemaAnnotations,
  AppCommandInputStringSchema,
  AppCommandInputValueSchema
} from "./command-input-schema-types.js"
import {
  assertRange,
  fail,
  joinSchemaPath,
  readOptionalBoolean,
  readOptionalBoundedInteger,
  readOptionalFiniteNumber,
  readPlainDataArray,
  rejectUnknownKeys,
  type CommandInputSchemaParseState
} from "./command-input-schema-internal.js"
import {
  assertSchemaDefaultInEnum,
  parseSchemaDefault
} from "./command-input-schema-default.js"

const COMMON_KEYS = ["type", "title", "description", "default", "enum"]

export type ParseCommandInputSchemaNode = (
  input: unknown,
  state: CommandInputSchemaParseState,
  path: string,
  depth: number,
  root: boolean
) => AppCommandInputValueSchema

export function parseStringSchema(
  record: Readonly<Record<string, unknown>>,
  state: CommandInputSchemaParseState,
  path: string,
  annotations: AppCommandInputSchemaAnnotations
): AppCommandInputStringSchema {
  rejectUnknownKeys(
    record,
    new Set([...COMMON_KEYS, "minLength", "maxLength"]),
    path
  )
  const enumValues = parseScalarEnum(record.enum, "string", state, path)
  const minLength = readOptionalBoundedInteger(
    record,
    "minLength",
    path,
    state.limits.maxStringLengthBound
  )
  const maxLength = readOptionalBoundedInteger(
    record,
    "maxLength",
    path,
    state.limits.maxStringLengthBound
  )
  assertRange(minLength, maxLength, path, "minLength", "maxLength")
  const defaultValue = parseSchemaDefault(record, state, path, "string")
  assertSchemaDefaultInEnum(defaultValue, enumValues, path)
  return {
    type: "string",
    ...annotations,
    ...(enumValues === undefined ? {} : { enum: enumValues }),
    ...(minLength === undefined ? {} : { minLength }),
    ...(maxLength === undefined ? {} : { maxLength }),
    ...(defaultValue === undefined ? {} : { default: defaultValue })
  }
}

export function parseNumberSchema(
  record: Readonly<Record<string, unknown>>,
  state: CommandInputSchemaParseState,
  path: string,
  annotations: AppCommandInputSchemaAnnotations,
  integer: boolean
): AppCommandInputNumberSchema | AppCommandInputIntegerSchema {
  rejectUnknownKeys(
    record,
    new Set([
      ...COMMON_KEYS,
      "minimum",
      "maximum",
      "exclusiveMinimum",
      "exclusiveMaximum"
    ]),
    path
  )
  const enumValues = parseScalarEnum(
    record.enum,
    integer ? "integer" : "number",
    state,
    path
  )
  const minimum = readOptionalFiniteNumber(record, "minimum", path)
  const maximum = readOptionalFiniteNumber(record, "maximum", path)
  const exclusiveMinimum = readOptionalFiniteNumber(
    record,
    "exclusiveMinimum",
    path
  )
  const exclusiveMaximum = readOptionalFiniteNumber(
    record,
    "exclusiveMaximum",
    path
  )
  assertRange(minimum, maximum, path, "minimum", "maximum")
  assertRange(
    exclusiveMinimum,
    exclusiveMaximum,
    path,
    "exclusiveMinimum",
    "exclusiveMaximum"
  )
  const defaultValue = integer
    ? parseSchemaDefault(record, state, path, "integer")
    : parseSchemaDefault(record, state, path, "number")
  assertSchemaDefaultInEnum(defaultValue, enumValues, path)
  const common = {
    ...annotations,
    ...(enumValues === undefined ? {} : { enum: enumValues }),
    ...(minimum === undefined ? {} : { minimum }),
    ...(maximum === undefined ? {} : { maximum }),
    ...(exclusiveMinimum === undefined ? {} : { exclusiveMinimum }),
    ...(exclusiveMaximum === undefined ? {} : { exclusiveMaximum }),
    ...(defaultValue === undefined ? {} : { default: defaultValue })
  }
  return integer
    ? { type: "integer", ...common }
    : { type: "number", ...common }
}

export function parseBooleanSchema(
  record: Readonly<Record<string, unknown>>,
  state: CommandInputSchemaParseState,
  path: string,
  annotations: AppCommandInputSchemaAnnotations
): AppCommandInputBooleanSchema {
  rejectUnknownKeys(record, new Set(COMMON_KEYS), path)
  const enumValues = parseScalarEnum(record.enum, "boolean", state, path)
  const defaultValue = parseSchemaDefault(record, state, path, "boolean")
  assertSchemaDefaultInEnum(defaultValue, enumValues, path)
  return {
    type: "boolean",
    ...annotations,
    ...(enumValues === undefined ? {} : { enum: enumValues }),
    ...(defaultValue === undefined ? {} : { default: defaultValue })
  }
}

export function parseArraySchema(
  record: Readonly<Record<string, unknown>>,
  state: CommandInputSchemaParseState,
  path: string,
  depth: number,
  annotations: AppCommandInputSchemaAnnotations,
  parseNode: ParseCommandInputSchemaNode
): AppCommandInputArraySchema {
  rejectUnknownKeys(
    record,
    new Set([
      ...COMMON_KEYS.filter((key) => key !== "enum"),
      "items",
      "minItems",
      "maxItems",
      "uniqueItems"
    ]),
    path
  )
  if (record.items === undefined) {
    fail("invalid", joinSchemaPath(path, "items"), "array schemas require items")
  }
  const items = parseNode(
    record.items,
    state,
    joinSchemaPath(path, "items"),
    depth + 1,
    false
  )
  const minItems = readOptionalBoundedInteger(
    record,
    "minItems",
    path,
    state.limits.maxCollectionBound
  )
  const maxItems = readOptionalBoundedInteger(
    record,
    "maxItems",
    path,
    state.limits.maxCollectionBound
  )
  assertRange(minItems, maxItems, path, "minItems", "maxItems")
  const uniqueItems = readOptionalBoolean(record, "uniqueItems", path)
  const defaultValue = parseSchemaDefault(record, state, path, "array")
  return {
    type: "array",
    ...annotations,
    items,
    ...(minItems === undefined ? {} : { minItems }),
    ...(maxItems === undefined ? {} : { maxItems }),
    ...(uniqueItems === undefined ? {} : { uniqueItems }),
    ...(defaultValue === undefined ? {} : { default: defaultValue })
  }
}

function parseScalarEnum<Type extends "string" | "number" | "integer" | "boolean">(
  input: unknown,
  type: Type,
  state: CommandInputSchemaParseState,
  path: string
): readonly ScalarFor<Type>[] | undefined {
  if (input === undefined) {
    return undefined
  }
  const enumPath = joinSchemaPath(path, "enum")
  const enumInput = readPlainDataArray(input, enumPath)
  if (enumInput.length === 0) {
    fail("invalid", enumPath, "enum must be a non-empty array")
  }
  if (enumInput.length > state.limits.maxEnumValuesPerNode) {
    fail(
      "limit_exceeded",
      enumPath,
      `enum exceeds ${state.limits.maxEnumValuesPerNode} values`
    )
  }
  state.enumValues += enumInput.length
  if (state.enumValues > state.limits.maxEnumValuesTotal) {
    fail(
      "limit_exceeded",
      enumPath,
      `schema exceeds ${state.limits.maxEnumValuesTotal} enum values`
    )
  }
  const values: ScalarFor<Type>[] = []
  for (let index = 0; index < enumInput.length; index += 1) {
    const value = enumInput[index]
    if (!matchesScalarType(value, type)) {
      fail(
        "invalid",
        joinSchemaPath(enumPath, String(index)),
        `enum value must match schema type ${type}`
      )
    }
    values.push(value as ScalarFor<Type>)
  }
  if (new Set(values.map(scalarKey)).size !== values.length) {
    fail("invalid", enumPath, "enum values must be unique")
  }
  return values
}

type ScalarFor<Type extends "string" | "number" | "integer" | "boolean"> =
  Type extends "string"
    ? string
    : Type extends "boolean"
      ? boolean
      : number

function matchesScalarType(
  value: unknown,
  type: "string" | "number" | "integer" | "boolean"
): boolean {
  switch (type) {
    case "string":
      return typeof value === "string"
    case "boolean":
      return typeof value === "boolean"
    case "number":
      return typeof value === "number" && Number.isFinite(value)
    case "integer":
      return typeof value === "number" && Number.isInteger(value)
  }
}

function scalarKey(value: string | number | boolean): string {
  return `${typeof value}:${JSON.stringify(value)}`
}
