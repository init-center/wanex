export const defaultPrincipalId = "app-shell-user"

export function normalizeOptionalRef(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized
}
