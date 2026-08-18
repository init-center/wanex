import type {
  AppCommandInputSchema,
  AppCommandInputValueSchema
} from "@wanex/extension"
import type {
  CommandCatalogReadModel
} from "@wanex/product/surface"
import {
  parseTuiCommandInputValue,
  tuiCommandInputAnnotation,
  tuiCommandInputLabel
} from "./value.js"

export type TuiGuidedInputResult =
  | { readonly kind: "completed"; readonly input: unknown }
  | { readonly kind: "cancelled"; readonly quit: boolean }

export async function collectTuiCommandInput(options: {
  readonly command: CommandCatalogReadModel["commands"][number]
  readonly readLine: () => Promise<string | undefined>
  readonly write: (text: string) => void | Promise<void>
}): Promise<TuiGuidedInputResult> {
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
  const label =
    options.schema.title ?? tuiCommandInputLabel(options.name)
  if (!options.required) {
    await options.write(
      `Include ${label}? (y/N)${tuiCommandInputAnnotation(options.schema)}`
    )
    const decision = await options.readLine()
    if (decision === undefined) return { kind: "cancelled", quit: false }
    const trimmed = decision.trim()
    if (isQuit(trimmed)) return { kind: "cancelled", quit: true }
    if (trimmed === "cancel") return { kind: "cancelled", quit: false }
    if (!isYes(trimmed)) return { kind: "completed", included: false }
  }

  for (;;) {
    await options.write(
      `${label}${tuiCommandInputAnnotation(options.schema)}:`
    )
    const line = await options.readLine()
    if (line === undefined) return { kind: "cancelled", quit: false }
    const trimmed = line.trim()
    if (isQuit(trimmed)) return { kind: "cancelled", quit: true }
    if (trimmed === "cancel") return { kind: "cancelled", quit: false }
    const parsed = parseTuiCommandInputValue(options.schema, line)
    if (parsed.ok) {
      return { kind: "completed", included: true, value: parsed.value }
    }
    await options.write(`Invalid ${label}: ${parsed.message}`)
  }
}

function isYes(value: string): boolean {
  return value === "y" || value === "yes"
}

function isQuit(value: string): boolean {
  return value === "quit" || value === "exit"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
