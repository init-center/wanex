import type { JsonValue } from "./json.js"

interface ModelOptionBase {
  readonly name: string
  readonly description: string
}

export type ModelOptionDescriptor =
  | (ModelOptionBase & { readonly type: "string"; readonly enum: readonly string[] })
  | (ModelOptionBase & {
      readonly type: "integer"
      readonly minimum: number
      readonly maximum: number
    })
  | (ModelOptionBase & { readonly type: "boolean" })

export function normalizeModelOptions(value: unknown): readonly ModelOptionDescriptor[] {
  if (!Array.isArray(value) || value.length > 32) {
    throw new Error("model options must be an array of at most 32 descriptors")
  }
  const names = new Set<string>()
  const descriptors = value.map((raw): ModelOptionDescriptor => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("model option descriptor must be an object")
    }
    const item = raw as Record<string, unknown>
    const { name, description, type } = item
    if (typeof name !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(name) || names.has(name)) {
      throw new Error("model option name is invalid or duplicated")
    }
    if (typeof description !== "string" || description.trim().length === 0 || description.length > 512) {
      throw new Error("model option description must contain 1-512 characters")
    }
    names.add(name)
    const base = { name, description: description.trim() }
    const fields = type === "string"
      ? ["name", "description", "type", "enum"]
      : type === "integer"
        ? ["name", "description", "type", "minimum", "maximum"]
        : ["name", "description", "type"]
    if (Object.keys(item).length !== fields.length || Object.keys(item).some((key) => !fields.includes(key))) {
      throw new Error("model option descriptor contains missing or unknown fields")
    }
    if (type === "boolean") return { ...base, type }
    if (type === "integer") {
      const { minimum, maximum } = item
      if (
        typeof minimum !== "number" || typeof maximum !== "number" ||
        !Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) ||
        minimum > maximum
      ) {
        throw new Error("model option integer bounds are invalid")
      }
      return { ...base, type, minimum, maximum }
    }
    if (
      type !== "string" || !Array.isArray(item.enum) ||
      item.enum.length === 0 || item.enum.length > 32 ||
      item.enum.some((entry) => typeof entry !== "string" || entry.length === 0 || entry.length > 128) ||
      new Set(item.enum).size !== item.enum.length
    ) {
      throw new Error("model option string enum is invalid")
    }
    return { ...base, type, enum: [...item.enum as string[]].sort() }
  })
  return descriptors.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
}

export function validateModelOptionValues(
  descriptors: readonly ModelOptionDescriptor[] | undefined,
  value: JsonValue
): Record<string, JsonValue> {
  const catalog = new Map(
    normalizeModelOptions(descriptors ?? []).map((option) => [option.name, option])
  )
  if (value === null) return {}
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("model options must be an object")
  }
  const result: Record<string, JsonValue> = Object.create(null)
  for (const [name, entry] of Object.entries(value)) {
    const option = catalog.get(name)
    if (option === undefined) throw new Error(`model option is unsupported: ${name}`)
    const valid = option.type === "string"
      ? typeof entry === "string" && option.enum.includes(entry)
      : option.type === "boolean"
        ? typeof entry === "boolean"
        : typeof entry === "number" && Number.isSafeInteger(entry) &&
          entry >= option.minimum && entry <= option.maximum
    if (!valid) throw new Error(`model option value is invalid: ${name}`)
    result[name] = entry
  }
  return result
}
