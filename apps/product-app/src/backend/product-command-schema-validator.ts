import {
  DEFAULT_APP_COMMAND_INPUT_SCHEMA_LIMITS,
  type AppCommandInputSchema,
  type AppCommandInputValueSchema
} from "@wanex/extension"
import type {
  ProductAppBackendCommandInputValidationIssue
} from "./types.js"

const MAX_ISSUES = 32

export function validateProductAppBackendCommandSchemaInput(
  schema: AppCommandInputSchema,
  input: unknown
): readonly ProductAppBackendCommandInputValidationIssue[] {
  if (input === undefined) {
    return [{ path: "/", keyword: "instance", message: "command input is required" }]
  }
  const state: ValidationState = {
    issues: [],
    nodes: 0,
    ancestors: new Set<object>()
  }
  validateNode(schema, input, "/", state, 1)
  return state.issues
}

interface ValidationState {
  readonly issues: ProductAppBackendCommandInputValidationIssue[]
  readonly ancestors: Set<object>
  nodes: number
}

function validateNode(
  schema: AppCommandInputValueSchema,
  value: unknown,
  path: string,
  state: ValidationState,
  depth: number
): void {
  if (!enterValue(value, path, state, depth)) {
    return
  }
  try {
    switch (schema.type) {
      case "object":
        validateObject(schema, value, path, state, depth)
        return
      case "array":
        validateArray(schema, value, path, state, depth)
        return
      case "string":
        validateString(schema, value, path, state)
        return
      case "number":
      case "integer":
        validateNumber(schema, value, path, state)
        return
      case "boolean":
        if (typeof value !== "boolean") {
          issue(state, path, "type", "input must be a boolean")
          return
        }
        validateEnum(schema.enum, value, path, state)
        return
    }
  } finally {
    if (typeof value === "object" && value !== null) {
      state.ancestors.delete(value)
    }
  }
}

function validateObject(
  schema: Extract<AppCommandInputValueSchema, { type: "object" }>,
  value: unknown,
  path: string,
  state: ValidationState,
  depth: number
): void {
  const record = readObject(value, path, state)
  if (record === undefined) {
    return
  }
  const keys = Object.keys(record).sort()
  if (keys.length > DEFAULT_APP_COMMAND_INPUT_SCHEMA_LIMITS.maxCollectionBound) {
    issue(state, path, "limit", "input object has too many properties")
    return
  }
  if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
    issue(state, path, "minProperties", "input has too few properties")
  }
  if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) {
    issue(state, path, "maxProperties", "input has too many properties")
  }
  for (const required of [...(schema.required ?? [])].sort()) {
    if (!Object.prototype.hasOwnProperty.call(record, required)) {
      issue(state, joinPath(path, required), "required", "required input is missing")
    }
  }
  const properties = schema.properties ?? {}
  for (const key of keys) {
    const child = properties[key]
    if (child !== undefined) {
      validateNode(child, record[key], joinPath(path, key), state, depth + 1)
    } else if (schema.additionalProperties === false) {
      issue(
        state,
        joinPath(path, key),
        "additionalProperties",
        "additional input property is not allowed"
      )
    } else {
      validateJsonValue(record[key], joinPath(path, key), state, depth + 1)
    }
  }
}

function validateArray(
  schema: Extract<AppCommandInputValueSchema, { type: "array" }>,
  value: unknown,
  path: string,
  state: ValidationState,
  depth: number
): void {
  const array = readArray(value, path, state)
  if (array === undefined) {
    return
  }
  if (array.length > DEFAULT_APP_COMMAND_INPUT_SCHEMA_LIMITS.maxCollectionBound) {
    issue(state, path, "limit", "input array has too many items")
    return
  }
  if (schema.minItems !== undefined && array.length < schema.minItems) {
    issue(state, path, "minItems", "input array has too few items")
  }
  if (schema.maxItems !== undefined && array.length > schema.maxItems) {
    issue(state, path, "maxItems", "input array has too many items")
  }
  const issuesBeforeItems = state.issues.length
  for (let index = 0; index < array.length; index += 1) {
    validateNode(
      schema.items,
      array[index],
      joinPath(path, String(index)),
      state,
      depth + 1
    )
  }
  if (schema.uniqueItems === true && state.issues.length === issuesBeforeItems) {
    const keys = array.map(canonicalJson)
    if (new Set(keys).size !== keys.length) {
      issue(state, path, "uniqueItems", "input array items must be unique")
    }
  }
}

function validateString(
  schema: Extract<AppCommandInputValueSchema, { type: "string" }>,
  value: unknown,
  path: string,
  state: ValidationState
): void {
  if (typeof value !== "string") {
    issue(state, path, "type", "input must be a string")
    return
  }
  const length = [...value].length
  if (schema.minLength !== undefined && length < schema.minLength) {
    issue(state, path, "minLength", "input string is too short")
  }
  if (schema.maxLength !== undefined && length > schema.maxLength) {
    issue(state, path, "maxLength", "input string is too long")
  }
  validateEnum(schema.enum, value, path, state)
}

function validateNumber(
  schema: Extract<AppCommandInputValueSchema, { type: "number" | "integer" }>,
  value: unknown,
  path: string,
  state: ValidationState
): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (schema.type === "integer" && !Number.isInteger(value))
  ) {
    issue(state, path, "type", `input must be a finite ${schema.type}`)
    return
  }
  if (schema.minimum !== undefined && value < schema.minimum) {
    issue(state, path, "minimum", "input number is below the minimum")
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    issue(state, path, "maximum", "input number exceeds the maximum")
  }
  if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
    issue(state, path, "exclusiveMinimum", "input number is below the exclusive minimum")
  }
  if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
    issue(state, path, "exclusiveMaximum", "input number exceeds the exclusive maximum")
  }
  validateEnum(schema.enum, value, path, state)
}

function validateEnum<T>(
  values: readonly T[] | undefined,
  value: T,
  path: string,
  state: ValidationState
): void {
  if (values !== undefined && !values.some((item) => item === value)) {
    issue(state, path, "enum", "input is not an allowed enum value")
  }
}

function validateJsonValue(
  value: unknown,
  path: string,
  state: ValidationState,
  depth: number
): void {
  if (!enterValue(value, path, state, depth)) {
    return
  }
  try {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      return
    }
    const array = readArray(value, path, state, false)
    if (array !== undefined) {
      if (array.length > DEFAULT_APP_COMMAND_INPUT_SCHEMA_LIMITS.maxCollectionBound) {
        issue(state, path, "limit", "input array has too many items")
        return
      }
      for (let index = 0; index < array.length; index += 1) {
        validateJsonValue(array[index], joinPath(path, String(index)), state, depth + 1)
      }
      return
    }
    const record = readObject(value, path, state, false)
    if (record !== undefined) {
      const keys = Object.keys(record)
      if (keys.length > DEFAULT_APP_COMMAND_INPUT_SCHEMA_LIMITS.maxCollectionBound) {
        issue(state, path, "limit", "input object has too many properties")
        return
      }
      for (const key of keys) {
        validateJsonValue(record[key], joinPath(path, key), state, depth + 1)
      }
      return
    }
    issue(state, path, "json", "input must be JSON-compatible")
  } finally {
    if (typeof value === "object" && value !== null) {
      state.ancestors.delete(value)
    }
  }
}

function enterValue(
  value: unknown,
  path: string,
  state: ValidationState,
  depth: number
): boolean {
  state.nodes += 1
  if (state.nodes > DEFAULT_APP_COMMAND_INPUT_SCHEMA_LIMITS.maxValueNodes) {
    issue(state, path, "limit", "input exceeds the node limit")
    return false
  }
  if (depth > DEFAULT_APP_COMMAND_INPUT_SCHEMA_LIMITS.maxValueDepth) {
    issue(state, path, "limit", "input exceeds the nesting limit")
    return false
  }
  if (typeof value === "object" && value !== null) {
    if (state.ancestors.has(value)) {
      issue(state, path, "json", "input must not contain cycles")
      return false
    }
    state.ancestors.add(value)
  }
  return true
}

function readObject(
  value: unknown,
  path: string,
  state: ValidationState,
  reportType = true
): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    if (reportType) issue(state, path, "type", "input must be an object")
    return undefined
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    issue(state, path, "json", "input must use a plain object")
    return undefined
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      issue(state, path, "json", "input must not contain symbol properties")
      return undefined
    }
    const descriptor = descriptors[key]
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      issue(state, joinPath(path, key), "json", "input properties must be plain data")
      return undefined
    }
  }
  return value as Readonly<Record<string, unknown>>
}

function readArray(
  value: unknown,
  path: string,
  state: ValidationState,
  reportType = true
): readonly unknown[] | undefined {
  if (!Array.isArray(value)) {
    if (reportType) issue(state, path, "type", "input must be an array")
    return undefined
  }
  const keys = Reflect.ownKeys(value).filter((key) => key !== "length")
  const validKeys = keys.every((key) => {
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)) {
      return false
    }
    const index = Number(key)
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return index < value.length &&
      descriptor !== undefined &&
      "value" in descriptor &&
      descriptor.enumerable === true
  })
  if (
    Object.getPrototypeOf(value) !== Array.prototype ||
    !validKeys ||
    keys.length !== value.length
  ) {
    issue(state, path, "json", "input must be a dense plain array")
    return undefined
  }
  return value
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

function issue(
  state: ValidationState,
  path: string,
  keyword: string,
  message: string
): void {
  if (state.issues.length < MAX_ISSUES) {
    state.issues.push({ path: boundedPath(path), keyword, message })
  }
}

function joinPath(path: string, key: string): string {
  const safe = key.replace(/[\u0000-\u001f\u007f]/g, "?").slice(0, 128)
  const escaped = safe.replaceAll("~", "~0").replaceAll("/", "~1")
  return path === "/" ? `/${escaped}` : `${path}/${escaped}`
}

function boundedPath(path: string): string {
  return path.length <= 1_024 ? path : `${path.slice(0, 1_021)}...`
}
