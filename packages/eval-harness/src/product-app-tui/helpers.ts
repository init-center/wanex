import { isRecord } from "../scenario-utils.js"

export function completedCommandId(value: unknown): string | undefined {
  if (!isRecord(value) || value.kind !== "product-app-tui.command.completed") {
    return undefined
  }
  return typeof value.commandId === "string" ? value.commandId : undefined
}

export async function* lines(
  values: readonly string[]
): AsyncIterable<string> {
  for (const value of values) {
    yield value
  }
}

export function parseOkJsonValue<T>(text: string): T {
  const parsed = JSON.parse(text) as {
    readonly ok?: unknown
    readonly value?: unknown
  }
  if (parsed.ok !== true) {
    throw new Error("expected ok JSON result")
  }
  return parsed.value as T
}
