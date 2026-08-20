import { createHash } from "node:crypto"

export function durableId(prefix: string, value: string): string {
  return `${prefix}_${sha256(value).slice(0, 40)}`
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}
