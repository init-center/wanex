import type { ConfigReloadMatcher } from "./hot-reload-types.js"

export function matchesConfigReloadMatcher(
  matcher: ConfigReloadMatcher,
  key: string
): boolean {
  if (matcher.kind === "exact") {
    return matcher.key === key
  }
  return key.startsWith(matcher.prefix)
}

export function assertConfigReloadMatcher(
  matcher: ConfigReloadMatcher,
  label: string
): void {
  if (matcher.kind === "exact") {
    assertConfigReloadKey(matcher.key, label)
    return
  }
  assertConfigReloadKey(matcher.prefix, label)
}

export function assertConfigReloadKey(key: string, label: string): void {
  if (key.length === 0) {
    throw new Error(`${label} key must not be empty`)
  }
}
