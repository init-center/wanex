import { join } from "node:path"
import {
  resolveInstructionDiscoveryOptions,
  type ResolvedInstructionDiscoveryOptions
} from "./discovery-options.js"
import {
  readInstructionSource,
  unavailableInstructionSnapshot
} from "./discovery-source.js"
import {
  discoverUntrustedProjectInstructionDiagnostics
} from "./discovery-untrusted-project.js"
import { upwardDirectories } from "./paths.js"
import type {
  InstructionDiagnostic,
  InstructionDiscoveryOptions,
  InstructionSnapshot,
  InstructionSource
} from "./types.js"

export async function discoverInstructionSnapshot(
  options: InstructionDiscoveryOptions
): Promise<InstructionSnapshot> {
  const resolved = resolveInstructionDiscoveryOptions(options)
  if (resolved.status === "unavailable") {
    return unavailableInstructionSnapshot(resolved.diagnostic)
  }

  const diagnostics: InstructionDiagnostic[] = []
  const sources: InstructionSource[] = []
  let order = 0

  const globalLoad = await loadInstructionScope({
    discovery: resolved.options,
    scope: "global",
    directories:
      resolved.options.globalConfigDir === undefined
        ? []
        : [resolved.options.globalConfigDir],
    sources,
    diagnostics,
    order
  })
  if (globalLoad.status === "unavailable") {
    return globalLoad.snapshot
  }
  order = globalLoad.order

  const projectDirectories = upwardDirectories({
    start: resolved.options.cwd,
    stop: resolved.options.projectRoot
  })
  if (
    projectDirectories.length > 0 &&
    resolved.options.trust.projectInstructions !== "trusted"
  ) {
    const projectDiagnostics =
      await discoverUntrustedProjectInstructionDiagnostics({
        discovery: resolved.options,
        projectDirectories,
        sources,
        diagnostics
      })
    if (projectDiagnostics.status === "unavailable") {
      return projectDiagnostics.snapshot
    }
    return {
      status: "available",
      sources,
      diagnostics: projectDiagnostics.diagnostics
    }
  }

  const projectLoad = await loadInstructionScope({
    discovery: resolved.options,
    scope: "project",
    directories: projectDirectories,
    sources,
    diagnostics,
    order
  })
  if (projectLoad.status === "unavailable") {
    return projectLoad.snapshot
  }
  order = projectLoad.order

  return {
    status: "available",
    sources,
    diagnostics
  }
}

async function loadInstructionScope(options: {
  readonly discovery: ResolvedInstructionDiscoveryOptions
  readonly scope: "global" | "project"
  readonly directories: readonly string[]
  readonly sources: InstructionSource[]
  readonly diagnostics: InstructionDiagnostic[]
  readonly order: number
}): Promise<
  | { readonly status: "available"; readonly order: number }
  | { readonly status: "unavailable"; readonly snapshot: InstructionSnapshot }
> {
  let order = options.order
  for (const directory of options.directories) {
    for (const target of options.discovery.targets) {
      const source = await readInstructionSource({
        fs: options.discovery.fs,
        path: join(directory, target),
        scope: options.scope,
        target,
        order
      })
      if (source.status === "unavailable") {
        options.diagnostics.push(source.diagnostic)
        return {
          status: "unavailable",
          snapshot: diagnosticsUnavailableSnapshot(
            options.sources,
            options.diagnostics
          )
        }
      }
      if (source.source !== undefined) {
        options.sources.push(source.source)
        order += 1
      }
    }
  }
  return {
    status: "available",
    order
  }
}

function diagnosticsUnavailableSnapshot(
  sources: readonly InstructionSource[],
  diagnostics: readonly InstructionDiagnostic[]
): InstructionSnapshot {
  return {
    status: "unavailable",
    sources,
    diagnostics
  }
}
