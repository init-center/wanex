import { createHash } from "node:crypto"
import type { JsonValue } from "@wanex/protocol"

export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value)
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON numbers must be finite")
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`
  }
  const object = value as Readonly<Record<string, JsonValue>>
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key] as JsonValue)}`)
    .join(",")}}`
}

export function digestCanonicalJson(value: JsonValue): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex")
}
