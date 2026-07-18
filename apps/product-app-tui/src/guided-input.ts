import type {
  AppCommandInputSchema,
  AppCommandInputValueSchema
} from "@wanex/extension"
import type {
  ProductAppCommandCatalogReadModel
} from "@wanex/product-app/surface-client"

export type ProductAppTuiGuidedInputResult =
  | { readonly kind: "completed"; readonly input: unknown }
  | { readonly kind: "cancelled"; readonly quit: boolean }

export async function collectProductAppTuiCommandInput(options: {
  readonly command: ProductAppCommandCatalogReadModel["commands"][number]
  readonly readLine: () => Promise<string | undefined>
  readonly write: (text: string) => void | Promise<void>
}): Promise<ProductAppTuiGuidedInputResult> {
  const schema = options.command.inputSchema
  if (schema === undefined) {
    return { kind: "completed", input: undefined }
  }

  if (schema.additionalProperties !== false) {
    for (;;) {
      await options.write("Command input JSON object (or cancel):")
      const line = await options.readLine()
      if (line === undefined || line.trim() === "cancel") {
        return { kind: "cancelled", quit: false }
      }
      if (isQuit(line.trim())) return { kind: "cancelled", quit: true }
      try {
        const value = JSON.parse(line.trim()) as unknown
        if (isRecord(value)) return { kind: "completed", input: value }
        await options.write("Invalid command input: value must be a JSON object")
      } catch {
        await options.write("Invalid command input: value must be valid JSON")
      }
    }
  }

  if ((schema.required?.length ?? 0) === 0) {
    return { kind: "completed", input: {} }
  }

  const input: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    const value = await collectProperty({
      name,
      schema: property,
      required: schema.required?.includes(name) === true,
      readLine: options.readLine,
      write: options.write
    })
    if (value.kind !== "completed") return value
    if (value.included) {
      Object.defineProperty(input, name, {
        value: value.value,
        enumerable: true,
        configurable: true,
        writable: true
      })
    }
  }
  return { kind: "completed", input }
}

async function collectProperty(options: {
  readonly name: string
  readonly schema: AppCommandInputValueSchema
  readonly required: boolean
  readonly readLine: () => Promise<string | undefined>
  readonly write: (text: string) => void | Promise<void>
}): Promise<
  | { readonly kind: "completed"; readonly included: boolean; readonly value?: unknown }
  | { readonly kind: "cancelled"; readonly quit: boolean }
> {
  const label = options.schema.title ?? humanize(options.name)
  if (!options.required) {
    await options.write(
      `Include ${label}? (y/N)${annotation(options.schema)}`
    )
    const decision = await options.readLine()
    if (decision === undefined) return { kind: "cancelled", quit: false }
    const trimmed = decision.trim()
    if (isQuit(trimmed)) return { kind: "cancelled", quit: true }
    if (trimmed === "cancel") return { kind: "cancelled", quit: false }
    if (!isYes(trimmed)) return { kind: "completed", included: false }
  }

  for (;;) {
    await options.write(`${label}${annotation(options.schema)}:`)
    const line = await options.readLine()
    if (line === undefined) return { kind: "cancelled", quit: false }
    const trimmed = line.trim()
    if (isQuit(trimmed)) return { kind: "cancelled", quit: true }
    if (trimmed === "cancel") return { kind: "cancelled", quit: false }
    const parsed = parseGuidedValue(options.schema, line)
    if (parsed.ok) {
      return { kind: "completed", included: true, value: parsed.value }
    }
    await options.write(`Invalid ${label}: ${parsed.message}`)
  }
}

function parseGuidedValue(
  schema: AppCommandInputValueSchema,
  raw: string
):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string } {
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

function annotation(schema: AppCommandInputValueSchema): string {
  const enumValues =
    schema.type === "string" ||
    schema.type === "number" ||
    schema.type === "integer" ||
    schema.type === "boolean"
      ? schema.enum
      : undefined
  const hints = [
    schema.description,
    schema.default === undefined ? undefined : `default: ${JSON.stringify(schema.default)}`,
    enumValues === undefined ? undefined : `options: ${enumValues.join(", ")}`
  ].filter((value): value is string => value !== undefined)
  return hints.length === 0 ? "" : ` [${hints.join("; ")}]`
}

function humanize(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll(/[_-]+/g, " ")
  return `${words[0]?.toUpperCase() ?? ""}${words.slice(1)}`
}

function isYes(value: string): boolean {
  return value === "y" || value === "yes"
}

function isQuit(value: string): boolean {
  return value === "quit" || value === "exit"
}

function isJsonNumberText(value: string): boolean {
  return /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
