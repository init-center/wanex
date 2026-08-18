import type { FootprintEntry } from "./distribution-audit.js"
import { assert } from "./scenario-utils.js"

export const backendOptionalRuntimePackages = [
  "@wanex/plugin-command-host",
  "@wanex/plugin",
  "@wanex/connector"
] as const

export function assertBackendClosureExcludes(
  entry: FootprintEntry,
  label: string
): readonly string[] {
  const excluded = backendOptionalRuntimePackages.filter(
    (packageName) => !entry.workspaceClosure.includes(packageName)
  )
  assert(
    excluded.length === backendOptionalRuntimePackages.length,
    `${label} closure should stay slim`
  )
  return excluded
}
