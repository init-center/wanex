import { createHash } from "node:crypto"

export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

export function sha256Optional(text: string | null | undefined): string | undefined {
  return text === null || text === undefined ? undefined : sha256Text(text)
}
