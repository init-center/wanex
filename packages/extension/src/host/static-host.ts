import {
  DEFAULT_APP_EXTENSION_SOURCE_ORDER,
  resolveAppExtensionContributions,
  type AppExtensionContribution,
  type AppExtensionDiagnostic,
  type AppExtensionProvenance,
  type AppExtensionSource,
  type AppExtensionSourceKind
} from "@wanex/extension"
import type {
  ExtensionHostResolvedSnapshot,
  ExtensionHostSourceDescriptor,
  ExtensionHostSourceLoadContext,
  ExtensionHostSourceReport,
  ResolveExtensionHostSnapshotOptions,
  StaticExtensionHost
} from "./types.js"

export function createStaticExtensionHost(options: {
  readonly sources: readonly ExtensionHostSourceDescriptor[]
}): StaticExtensionHost {
  return {
    resolve(resolveOptions = {}) {
      return resolveExtensionHostSnapshot({
        sources: options.sources,
        ...resolveOptions
      })
    }
  }
}

export async function resolveExtensionHostSnapshot(
  options: ResolveExtensionHostSnapshotOptions
): Promise<ExtensionHostResolvedSnapshot> {
  const collected: AppExtensionContribution[] = []
  const diagnostics: AppExtensionDiagnostic[] = []
  const reports: ExtensionHostSourceReport[] = []
  const sourceRank = new Map(
    (options.resolution?.sourceOrder ?? DEFAULT_APP_EXTENSION_SOURCE_ORDER).map(
      (source, index) => [source, index] as const
    )
  )

  for (const descriptor of [...options.sources].sort((left, right) =>
    compareSourceDescriptors(left, right, sourceRank)
  )) {
    const sourceDiagnostics = [...(descriptor.diagnostics ?? [])]
    diagnostics.push(...sourceDiagnostics)
    if (descriptor.enabled === false) {
      reports.push({
        source: descriptor.source,
        trust: descriptor.trust,
        status: "blocked",
        contributionCount: 0,
        diagnosticCodes: [
          ...sourceDiagnostics.map((diagnostic) => diagnostic.code),
          "extension.blocked_source"
        ]
      })
      diagnostics.push(blockedSourceDiagnostic(descriptor.source))
      continue
    }
    if (descriptor.trust === "blocked") {
      reports.push({
        source: descriptor.source,
        trust: descriptor.trust,
        status: "blocked",
        contributionCount: 0,
        diagnosticCodes: [
          ...sourceDiagnostics.map((diagnostic) => diagnostic.code),
          "extension.blocked_source"
        ]
      })
      diagnostics.push(blockedSourceDiagnostic(descriptor.source))
      continue
    }

    let loaded: readonly AppExtensionContribution[]
    try {
      loaded = await loadContributions({
        descriptor,
        ...(options.signal === undefined ? {} : { signal: options.signal })
      })
    } catch (error) {
      const diagnostic = failedSourceDiagnostic(descriptor.source, error)
      diagnostics.push(diagnostic)
      reports.push({
        source: descriptor.source,
        trust: descriptor.trust,
        status: "failed",
        contributionCount: 0,
        diagnosticCodes: [
          ...sourceDiagnostics.map((entry) => entry.code),
          diagnostic.code
        ],
        errorMessage: error instanceof Error ? error.message : String(error)
      })
      continue
    }

    const contributions = loaded.map((contribution) =>
      contributionWithSourceDefaults(contribution, descriptor)
    )
    collected.push(...contributions)
    reports.push({
      source: descriptor.source,
      trust: descriptor.trust,
      status: contributions.length === 0 ? "empty" : "loaded",
      contributionCount: contributions.length,
      diagnosticCodes: sourceDiagnostics.map((diagnostic) => diagnostic.code)
    })
  }

  const resolved = resolveAppExtensionContributions(
    collected,
    options.resolution ?? {}
  )
  return {
    contributions: collected,
    resolved,
    sources: reports,
    diagnostics: [...diagnostics, ...resolved.diagnostics]
  }
}

async function loadContributions(options: {
  readonly descriptor: ExtensionHostSourceDescriptor
  readonly signal?: AbortSignal
}): Promise<readonly AppExtensionContribution[]> {
  if (options.signal?.aborted === true) {
    throw new Error("extension source load aborted")
  }
  if (typeof options.descriptor.contributions !== "function") {
    return options.descriptor.contributions
  }
  const context: ExtensionHostSourceLoadContext = {
    source: options.descriptor.source,
    trust: options.descriptor.trust,
    ...(options.signal === undefined ? {} : { signal: options.signal })
  }
  return await options.descriptor.contributions(context)
}

function contributionWithSourceDefaults(
  contribution: AppExtensionContribution,
  descriptor: ExtensionHostSourceDescriptor
): AppExtensionContribution {
  const provenance: AppExtensionProvenance = {
    ...contribution.provenance,
    source: descriptor.source,
    trust: descriptor.trust
  }
  return {
    ...contribution,
    provenance,
    order: contribution.order ?? descriptor.order
  } as AppExtensionContribution
}

function blockedSourceDiagnostic(
  source: AppExtensionSource
): AppExtensionDiagnostic {
  return {
    code: "extension.blocked_source",
    severity: "error",
    message: `blocked extension source ${source.id}`,
    sourceId: source.id,
    metadata: {
      sourceKind: source.kind,
      sourceScope: source.scope
    }
  }
}

function failedSourceDiagnostic(
  source: AppExtensionSource,
  error: unknown
): AppExtensionDiagnostic {
  return {
    code: "extension.blocked_source",
    severity: "error",
    message: `extension source ${source.id} failed to load: ${error instanceof Error ? error.message : String(error)}`,
    sourceId: source.id,
    metadata: {
      sourceKind: source.kind,
      sourceScope: source.scope
    }
  }
}

function compareSourceDescriptors(
  left: ExtensionHostSourceDescriptor,
  right: ExtensionHostSourceDescriptor,
  sourceRank: ReadonlyMap<AppExtensionSourceKind, number>
): number {
  return (
    rankSourceKind(left.source.kind, sourceRank) -
      rankSourceKind(right.source.kind, sourceRank) ||
    (left.order ?? 0) - (right.order ?? 0) ||
    left.source.kind.localeCompare(right.source.kind) ||
    left.source.scope.localeCompare(right.source.scope) ||
    left.source.id.localeCompare(right.source.id)
  )
}

function rankSourceKind(
  kind: AppExtensionSourceKind,
  sourceRank: ReadonlyMap<AppExtensionSourceKind, number>
): number {
  return sourceRank.get(kind) ?? Number.MAX_SAFE_INTEGER
}
