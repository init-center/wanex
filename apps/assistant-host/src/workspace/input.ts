import type { JsonValue } from "@wanex/protocol"

export function workspaceInput(input: JsonValue): Record<string, JsonValue> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("workspace input must be an object")
  }
  return input as Record<string, JsonValue>
}

export function requiredWorkspaceString(
  input: Record<string, JsonValue>,
  key: string
): string {
  const value = input[key]
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 4096 ||
    value.includes("\0")
  ) {
    throw new Error(`workspace ${key} is invalid`)
  }
  return value
}
