import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { SessionMessageRecord, TextMessagePart } from "@wanex/protocol"
import { assert, isRecord } from "../scenario-utils.js"

export async function mktemp(prefix: string): Promise<string> {
  return await mkdtemp(join(tmpdir(), prefix))
}

export function expectRecord(value: unknown): Record<string, unknown> {
  assert(isRecord(value), "expected record")
  return value
}

export function expectArray(value: unknown): unknown[] {
  assert(Array.isArray(value), "expected array")
  return value
}

export function expectNumber(value: unknown): number {
  assert(typeof value === "number", "expected number")
  return value
}

export function assistantText(messages: readonly SessionMessageRecord[]): string {
  return messages
    .flatMap((message) => message.content)
    .filter((part): part is TextMessagePart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

export function textFromParts(parts: readonly unknown[]): string {
  return parts
    .filter((part): part is TextMessagePart => {
      return (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "text"
      )
    })
    .map((part) => part.text)
    .join("\n")
}
