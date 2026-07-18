import {
  APP_COMMAND_INPUT_SCHEMA_DRAFT_2020_12,
  type AppCommandInputObjectSchema,
  type AppCommandInputSchema,
  type AppCommandInputSchemaAnnotations,
  type AppCommandInputValueSchema,
  type ParseAppCommandInputSchemaOptions,
  type ParseAppCommandInputSchemaResult
} from "./command-input-schema-types.js"
import {
  CommandInputSchemaParseError,
  assertRange,
  defineDataProperty,
  fail,
  joinSchemaPath,
  readOptionalBoolean,
  readOptionalBoundedInteger,
  readOptionalString,
  readPlainDataArray,
  readPlainDataRecord,
  rejectUndefinedValues,
  rejectUnknownKeys,
  resolveSchemaLimits,
  type CommandInputSchemaParseState
} from "./command-input-schema-internal.js"
import { parseSchemaDefault } from "./command-input-schema-default.js"
import {
  parseArraySchema,
  parseBooleanSchema,
  parseNumberSchema,
  parseStringSchema
} from "./command-input-schema-scalar.js"

const COMMON_KEYS = ["type", "title", "description", "default", "enum"]

export function parseAppCommandInputSchema(
  input: unknown,
  options: ParseAppCommandInputSchemaOptions = {}
): ParseAppCommandInputSchemaResult {
  try {
    const limits = resolveSchemaLimits(options.limits)
    const state: CommandInputSchemaParseState = {
      limits,
      schemaAncestors: new Set<object>(),
      schemaNodes: 0,
      properties: 0,
      enumValues: 0,
      valueNodes: 0
    }
    const schema = parseSchemaNode(input, state, "/", 1, true)
    if (schema.type !== "object") {
      fail("invalid", "/type", "command input schema root type must be object")
    }
    const serialized = JSON.stringify(schema)
    const bytes = utf8ByteLength(serialized)
    if (bytes > limits.maxSerializedBytes) {
      fail(
        "limit_exceeded",
        "/",
        `normalized schema exceeds ${limits.maxSerializedBytes} bytes`
      )
    }
    return { ok: true, value: schema as AppCommandInputSchema }
  } catch (error) {
    if (error instanceof CommandInputSchemaParseError) {
      return {
        ok: false,
        error: {
          code: error.code,
          path: error.path,
          message: error.message
        }
      }
    }
    return {
      ok: false,
      error: {
        code: "invalid",
        path: "/",
        message: "command input schema could not be read safely"
      }
    }
  }
}

function utf8ByteLength(value: string): number {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x7f) {
      bytes += 1
    } else if (code <= 0x7ff) {
      bytes += 2
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index += 1
      } else {
        bytes += 3
      }
    } else {
      bytes += 3
    }
  }
  return bytes
}

function parseSchemaNode(
  input: unknown,
  state: CommandInputSchemaParseState,
  path: string,
  depth: number,
  root: boolean
): AppCommandInputValueSchema {
  state.schemaNodes += 1
  if (state.schemaNodes > state.limits.maxSchemaNodes) {
    fail(
      "limit_exceeded",
      path,
      `schema exceeds ${state.limits.maxSchemaNodes} nodes`
    )
  }
  if (depth > state.limits.maxSchemaDepth) {
    fail(
      "limit_exceeded",
      path,
      `schema nesting exceeds depth ${state.limits.maxSchemaDepth}`
    )
  }
  const record = readPlainDataRecord(input, path)
  rejectUndefinedValues(record, path)
  const schemaObject = input as object
  if (state.schemaAncestors.has(schemaObject)) {
    fail("invalid", path, "command input schemas must not contain cycles")
  }
  state.schemaAncestors.add(schemaObject)
  try {
    const type = record.type
    if (
      type !== "object" &&
      type !== "string" &&
      type !== "number" &&
      type !== "integer" &&
      type !== "boolean" &&
      type !== "array"
    ) {
      fail(
        "invalid",
        joinSchemaPath(path, "type"),
        "schema type must be object, string, number, integer, boolean, or array"
      )
    }
    if (root && type !== "object") {
      fail(
        "invalid",
        joinSchemaPath(path, "type"),
        "root schema type must be object"
      )
    }
    const annotations = parseAnnotations(record, state, path)
    switch (type) {
      case "object":
        return parseObjectSchema(record, state, path, depth, root, annotations)
      case "string":
        return parseStringSchema(record, state, path, annotations)
      case "number":
        return parseNumberSchema(record, state, path, annotations, false)
      case "integer":
        return parseNumberSchema(record, state, path, annotations, true)
      case "boolean":
        return parseBooleanSchema(record, state, path, annotations)
      case "array":
        return parseArraySchema(
          record,
          state,
          path,
          depth,
          annotations,
          parseSchemaNode
        )
    }
  } finally {
    state.schemaAncestors.delete(schemaObject)
  }
}

function parseAnnotations(
  record: Readonly<Record<string, unknown>>,
  state: CommandInputSchemaParseState,
  path: string
): AppCommandInputSchemaAnnotations {
  const title = readOptionalString(
    record,
    "title",
    path,
    state.limits.maxTitleLength
  )
  const description = readOptionalString(
    record,
    "description",
    path,
    state.limits.maxDescriptionLength
  )
  return {
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description })
  }
}

function parseObjectSchema(
  record: Readonly<Record<string, unknown>>,
  state: CommandInputSchemaParseState,
  path: string,
  depth: number,
  root: boolean,
  annotations: AppCommandInputSchemaAnnotations
): AppCommandInputObjectSchema {
  rejectUnknownKeys(
    record,
    new Set([
      ...COMMON_KEYS.filter((key) => key !== "enum"),
      ...(root ? ["$schema"] : []),
      "properties",
      "required",
      "additionalProperties",
      "minProperties",
      "maxProperties"
    ]),
    path
  )
  const properties = parseProperties(record.properties, state, path, depth)
  const required = parseRequired(record.required, properties, state, path)
  const additionalProperties = readOptionalBoolean(
    record,
    "additionalProperties",
    path
  )
  const minProperties = readOptionalBoundedInteger(
    record,
    "minProperties",
    path,
    state.limits.maxCollectionBound
  )
  const maxProperties = readOptionalBoundedInteger(
    record,
    "maxProperties",
    path,
    state.limits.maxCollectionBound
  )
  assertRange(
    minProperties,
    maxProperties,
    path,
    "minProperties",
    "maxProperties"
  )
  const defaultValue = parseSchemaDefault(record, state, path, "object")
  if (root && record.$schema !== undefined) {
    if (record.$schema !== APP_COMMAND_INPUT_SCHEMA_DRAFT_2020_12) {
      fail(
        "unsupported",
        joinSchemaPath(path, "$schema"),
        "only JSON Schema Draft 2020-12 is supported"
      )
    }
  }
  return {
    ...(root && record.$schema !== undefined
      ? { $schema: APP_COMMAND_INPUT_SCHEMA_DRAFT_2020_12 }
      : {}),
    type: "object",
    ...annotations,
    ...(properties === undefined ? {} : { properties }),
    ...(required === undefined ? {} : { required }),
    ...(additionalProperties === undefined ? {} : { additionalProperties }),
    ...(minProperties === undefined ? {} : { minProperties }),
    ...(maxProperties === undefined ? {} : { maxProperties }),
    ...(defaultValue === undefined ? {} : { default: defaultValue })
  }
}

function parseProperties(
  input: unknown,
  state: CommandInputSchemaParseState,
  path: string,
  depth: number
): Readonly<Record<string, AppCommandInputValueSchema>> | undefined {
  if (input === undefined) {
    return undefined
  }
  const propertiesPath = joinSchemaPath(path, "properties")
  const record = readPlainDataRecord(input, propertiesPath)
  const keys = Object.keys(record).sort()
  state.properties += keys.length
  if (state.properties > state.limits.maxProperties) {
    fail(
      "limit_exceeded",
      propertiesPath,
      `schema exceeds ${state.limits.maxProperties} object properties`
    )
  }
  const properties: Record<string, AppCommandInputValueSchema> = {}
  for (const key of keys) {
    if (key.length > state.limits.maxPropertyNameLength) {
      fail(
        "limit_exceeded",
        joinSchemaPath(propertiesPath, key),
        `property name exceeds ${state.limits.maxPropertyNameLength} characters`
      )
    }
    defineDataProperty(properties, key, parseSchemaNode(
      record[key],
      state,
      joinSchemaPath(propertiesPath, key),
      depth + 1,
      false
    ))
  }
  return properties
}

function parseRequired(
  input: unknown,
  properties: Readonly<Record<string, AppCommandInputValueSchema>> | undefined,
  state: CommandInputSchemaParseState,
  path: string
): readonly string[] | undefined {
  if (input === undefined) {
    return undefined
  }
  const requiredPath = joinSchemaPath(path, "required")
  const requiredValues = readPlainDataArray(input, requiredPath)
  if (requiredValues.length > state.limits.maxRequiredNames) {
    fail(
      "limit_exceeded",
      requiredPath,
      `required exceeds ${state.limits.maxRequiredNames} names`
    )
  }
  const names: string[] = []
  for (let index = 0; index < requiredValues.length; index += 1) {
    const value = requiredValues[index]
    if (typeof value !== "string") {
      fail(
        "invalid",
        joinSchemaPath(requiredPath, String(index)),
        "required names must be strings"
      )
    }
    if (value.length > state.limits.maxPropertyNameLength) {
      fail(
        "limit_exceeded",
        joinSchemaPath(requiredPath, String(index)),
        `required name exceeds ${state.limits.maxPropertyNameLength} characters`
      )
    }
    names.push(value)
  }
  const unique = new Set(names)
  if (unique.size !== names.length) {
    fail("invalid", requiredPath, "required names must be unique")
  }
  for (const name of names) {
    if (properties?.[name] === undefined) {
      fail(
        "invalid",
        requiredPath,
        "required names must exist in properties"
      )
    }
  }
  return [...names].sort()
}
