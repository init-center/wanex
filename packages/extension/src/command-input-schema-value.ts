import type {
  AppCommandInputJsonValue
} from "./command-input-schema-types.js"
import {
  defineDataProperty,
  fail,
  joinSchemaPath,
  readPlainDataArray,
  readPlainDataRecord,
  type CommandInputSchemaParseState
} from "./command-input-schema-internal.js"

export function cloneCommandInputJsonValue(
  input: unknown,
  state: CommandInputSchemaParseState,
  path: string,
  depth = 1,
  ancestors = new Set<object>()
): AppCommandInputJsonValue {
  state.valueNodes += 1
  if (state.valueNodes > state.limits.maxValueNodes) {
    fail(
      "limit_exceeded",
      path,
      `schema defaults exceed ${state.limits.maxValueNodes} JSON values`
    )
  }
  if (depth > state.limits.maxValueDepth) {
    fail(
      "limit_exceeded",
      path,
      `schema default nesting exceeds depth ${state.limits.maxValueDepth}`
    )
  }
  if (
    input === null ||
    typeof input === "string" ||
    typeof input === "boolean"
  ) {
    return input
  }
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      fail("invalid", path, "schema default numbers must be finite")
    }
    return input
  }
  if (Array.isArray(input)) {
    const array = readPlainDataArray(input, path)
    if (ancestors.has(input)) {
      fail("invalid", path, "schema defaults must not contain cycles")
    }
    if (array.length > state.limits.maxCollectionBound) {
      fail(
        "limit_exceeded",
        path,
        `schema default array exceeds ${state.limits.maxCollectionBound} items`
      )
    }
    ancestors.add(input)
    const values: AppCommandInputJsonValue[] = []
    for (let index = 0; index < array.length; index += 1) {
      values.push(cloneCommandInputJsonValue(
        array[index],
        state,
        joinSchemaPath(path, String(index)),
        depth + 1,
        ancestors
      ))
    }
    ancestors.delete(input)
    return values
  }
  if (typeof input === "object" && input !== null) {
    if (ancestors.has(input)) {
      fail("invalid", path, "schema defaults must not contain cycles")
    }
    const record = readPlainDataRecord(input, path)
    const keys = Object.keys(record).sort()
    if (keys.length > state.limits.maxCollectionBound) {
      fail(
        "limit_exceeded",
        path,
        `schema default object exceeds ${state.limits.maxCollectionBound} properties`
      )
    }
    ancestors.add(input)
    const clone: Record<string, AppCommandInputJsonValue> = {}
    for (const key of keys) {
      if (key.length > state.limits.maxPropertyNameLength) {
        fail(
          "limit_exceeded",
          joinSchemaPath(path, key),
          `default property name exceeds ${state.limits.maxPropertyNameLength} characters`
        )
      }
      defineDataProperty(clone, key, cloneCommandInputJsonValue(
        record[key],
        state,
        joinSchemaPath(path, key),
        depth + 1,
        ancestors
      ))
    }
    ancestors.delete(input)
    return clone
  }
  fail("invalid", path, "schema defaults must be JSON-compatible values")
}
