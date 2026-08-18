import { createHash } from "node:crypto"

export function contextDigest(value: unknown): string {
  return createHash("sha256").update(stableContextJson(value)).digest("hex")
}

export function contextTextDigest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

export function stableContextJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map(stableContextJson).join(",")}]`
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableContextJson(item)}`)
    .join(",")}}`
}
