import type { FootprintEntry } from "./distribution-audit.js"
import { assert } from "./scenario-utils.js"

export const productAppBackendOptionalRuntimePackages = [
  "@wanex/product-app-command-host",
  "@wanex/plugin",
  "@wanex/connector"
] as const

export function assertProductAppBackendClosureExcludes(
  entry: FootprintEntry,
  label: string
): readonly string[] {
  const excluded = productAppBackendOptionalRuntimePackages.filter(
    (packageName) => !entry.workspaceClosure.includes(packageName)
  )
  assert(
    excluded.length === productAppBackendOptionalRuntimePackages.length,
    `${label} closure should stay slim`
  )
  return excluded
}
