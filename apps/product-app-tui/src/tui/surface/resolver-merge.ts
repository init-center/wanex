import type { TuiContribution } from "./types.js"

export function mergeContribution(
  current: TuiContribution,
  next: TuiContribution
): TuiContribution {
  return {
    ...current,
    ...next,
    value:
      isRecord(current.value) && isRecord(next.value)
        ? {
            ...current.value,
            ...next.value
          }
        : next.value,
    metadata: {
      ...(current.metadata ?? {}),
      ...(next.metadata ?? {})
    },
    diagnostics: [
      ...(current.diagnostics ?? []),
      ...(next.diagnostics ?? [])
    ]
  } as TuiContribution
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
