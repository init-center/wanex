import {
  DEFAULT_APP_COMMAND_INPUT_SCHEMA_LIMITS,
  type AppCommandInputValueSchema
} from "@wanex/extension"

export type TuiCommandInputValueResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string }

export function parseTuiCommandInputValue(
  schema: AppCommandInputValueSchema,
  raw: string
): TuiCommandInputValueResult {
  if (
    [...raw].length >
    DEFAULT_APP_COMMAND_INPUT_SCHEMA_LIMITS.maxStringLengthBound
  ) {
    return { ok: false, message: "value exceeds the local input limit" }
  }

  const value = raw.trim()
  if (value.length === 0) {
    return { ok: false, message: "value is required" }
  }
  if (schema.type === "string") {
    if (schema.enum !== undefined && !schema.enum.includes(raw)) {
      return { ok: false, message: "value is not an allowed option" }
    }
    const length = [...raw].length
    if (schema.minLength !== undefined && length < schema.minLength) {
      return { ok: false, message: "value is too short" }
    }
    if (schema.maxLength !== undefined && length > schema.maxLength) {
      return { ok: false, message: "value is too long" }
    }
    return { ok: true, value: raw }
  }
  if (schema.type === "number" || schema.type === "integer") {
    if (!isJsonNumberText(value)) {
      return { ok: false, message: `value must be a finite ${schema.type}` }
    }
    const parsed = Number(value)
    if (
      !Number.isFinite(parsed) ||
      (schema.type === "integer" && !Number.isInteger(parsed))
    ) {
      return { ok: false, message: `value must be a finite ${schema.type}` }
    }
    if (schema.minimum !== undefined && parsed < schema.minimum) {
      return { ok: false, message: "value is below the minimum" }
    }
    if (schema.maximum !== undefined && parsed > schema.maximum) {
      return { ok: false, message: "value exceeds the maximum" }
    }
    if (
      schema.exclusiveMinimum !== undefined &&
      parsed <= schema.exclusiveMinimum
    ) {
      return { ok: false, message: "value is below the exclusive minimum" }
    }
    if (
      schema.exclusiveMaximum !== undefined &&
      parsed >= schema.exclusiveMaximum
    ) {
      return { ok: false, message: "value exceeds the exclusive maximum" }
    }
    if (schema.enum !== undefined && !schema.enum.includes(parsed)) {
      return { ok: false, message: "value is not an allowed option" }
    }
    return { ok: true, value: parsed }
  }
  if (schema.type === "boolean") {
    if (value !== "true" && value !== "false") {
      return { ok: false, message: "value must be true or false" }
    }
    const parsed = value === "true"
    if (schema.enum !== undefined && !schema.enum.includes(parsed)) {
      return { ok: false, message: "value is not an allowed option" }
    }
    return { ok: true, value: parsed }
  }
  try {
    const parsed = JSON.parse(value) as unknown
    if (schema.type === "object" && isRecord(parsed)) {
      return { ok: true, value: parsed }
    }
    if (schema.type === "array" && Array.isArray(parsed)) {
      return { ok: true, value: parsed }
    }
    return { ok: false, message: `value must be a JSON ${schema.type}` }
  } catch {
    return { ok: false, message: `value must be valid JSON ${schema.type}` }
  }
}

export function tuiCommandInputAnnotation(
  schema: AppCommandInputValueSchema
): string {
  const enumValues =
    schema.type === "string" ||
    schema.type === "number" ||
    schema.type === "integer" ||
    schema.type === "boolean"
      ? schema.enum
      : undefined
  const hints = [
    schema.description,
    schema.default === undefined
      ? undefined
      : `default: ${JSON.stringify(schema.default)}`,
    enumValues === undefined
      ? undefined
      : `options: ${enumValues.join(", ")}`
  ].filter((value): value is string => value !== undefined)
  return hints.length === 0 ? "" : ` [${hints.join("; ")}]`
}

export function tuiCommandInputLabel(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/[_-]+/g, " ")
  return `${words[0]?.toUpperCase() ?? ""}${words.slice(1)}`
}

function isJsonNumberText(value: string): boolean {
  return /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
