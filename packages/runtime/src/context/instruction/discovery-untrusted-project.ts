import { join } from "node:path"
import { safeStat } from "./discovery-source.js"
import type { ResolvedInstructionDiscoveryOptions } from "./discovery-options.js"
import type {
  InstructionDiagnostic,
  InstructionSnapshot,
  InstructionSource
} from "./types.js"

export async function discoverUntrustedProjectInstructionDiagnostics(options: {
  readonly discovery: ResolvedInstructionDiscoveryOptions
  readonly projectDirectories: readonly string[]
  readonly sources: readonly InstructionSource[]
  readonly diagnostics: readonly InstructionDiagnostic[]
}): Promise<
  | {
      readonly status: "available"
      readonly diagnostics: readonly InstructionDiagnostic[]
    }
  | { readonly status: "unavailable"; readonly snapshot: InstructionSnapshot }
> {
  const diagnostics = [...options.diagnostics]
  for (const directory of options.projectDirectories) {
    for (const target of options.discovery.targets) {
      const path = join(directory, target)
      const stat = await safeStat(options.discovery.fs, path, "project")
      if (stat.status === "unavailable") {
        return {
          status: "unavailable",
          snapshot: {
            status: "unavailable",
            sources: options.sources,
            diagnostics: [...diagnostics, stat.diagnostic]
          }
        }
      }
      if (stat.stat?.isFile === true) {
        diagnostics.push({
          code: "instruction.project_untrusted",
          severity: "warning",
          message:
            "Project instruction file was discovered but not loaded because project instructions are untrusted.",
          path,
          scope: "project"
        })
      }
    }
  }
  return {
    status: "available",
    diagnostics
  }
}
