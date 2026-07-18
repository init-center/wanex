import type {
  AppCommandInputJsonValue
} from "./command-input-schema-types.js"
import {
  fail,
  joinSchemaPath,
  type CommandInputSchemaParseState
} from "./command-input-schema-internal.js"
import { cloneCommandInputJsonValue } from "./command-input-schema-value.js"

export function parseSchemaDefault(
  record: Readonly<Record<string, unknown>>,
  state: CommandInputSchemaParseState,
  path: string,
  type: "object"
): Readonly<Record<string, AppCommandInputJsonValue>> | undefined
export function parseSchemaDefault(
  record: Readonly<Record<string, unknown>>,
  state: CommandInputSchemaParseState,
  path: string,
  type: "array"
): readonly AppCommandInputJsonValue[] | undefined
export function parseSchemaDefault(
  record: Readonly<Record<string, unknown>>,
  state: CommandInputSchemaParseState,
  path: string,
  type: "string"
): string | undefined
export function parseSchemaDefault(
  record: Readonly<Record<string, unknown>>,
  state: CommandInputSchemaParseState,
  path: string,
  type: "number" | "integer"
): number | undefined
export function parseSchemaDefault(
  record: Readonly<Record<string, unknown>>,
  state: CommandInputSchemaParseState,
  path: string,
  type: "boolean"
): boolean | undefined
export function parseSchemaDefault(
  record: Readonly<Record<string, unknown>>,
  state: CommandInputSchemaParseState,
  path: string,
  type: "object" | "string" | "number" | "integer" | "boolean" | "array"
): AppCommandInputJsonValue | undefined {
  if (record.default === undefined) {
    return undefined
  }
  const defaultPath = joinSchemaPath(path, "default")
  const value = cloneCommandInputJsonValue(record.default, state, defaultPath)
  const valid =
    (type === "object" &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)) ||
    (type === "array" && Array.isArray(value)) ||
    (type === "string" && typeof value === "string") ||
    (type === "boolean" && typeof value === "boolean") ||
    (type === "number" && typeof value === "number") ||
    (type === "integer" && typeof value === "number" && Number.isInteger(value))
  if (!valid) {
    fail("invalid", defaultPath, `default must match schema type ${type}`)
  }
  return value
}

export function assertSchemaDefaultInEnum<T>(
  defaultValue: T | undefined,
  enumValues: readonly T[] | undefined,
  path: string
): void {
  if (
    defaultValue !== undefined &&
    enumValues !== undefined &&
    !enumValues.some((value) => Object.is(value, defaultValue))
  ) {
    fail(
      "invalid",
      joinSchemaPath(path, "default"),
      "default must be one of the declared enum values"
    )
  }
}
