import type {
  AppExtensionContribution,
  AppExtensionDiagnostic,
  AppExtensionResolutionOptions,
  AppExtensionResolvedSnapshot,
  AppExtensionSource,
  AppExtensionTrustLevel
} from "@wanex/extension"

export type ExtensionHostSourceStatus =
  | "loaded"
  | "blocked"
  | "failed"
  | "empty"

export interface ExtensionHostSourceDescriptor {
  readonly source: AppExtensionSource
  readonly trust: AppExtensionTrustLevel
  readonly contributions:
    | readonly AppExtensionContribution[]
    | ExtensionHostContributionLoader
  readonly diagnostics?: readonly AppExtensionDiagnostic[]
  readonly enabled?: boolean
  readonly order?: number
}

export type ExtensionHostContributionLoader = (
  context: ExtensionHostSourceLoadContext
) =>
  | readonly AppExtensionContribution[]
  | Promise<readonly AppExtensionContribution[]>

export interface ExtensionHostSourceLoadContext {
  readonly source: AppExtensionSource
  readonly trust: AppExtensionTrustLevel
  readonly signal?: AbortSignal
}

export interface ExtensionHostSourceReport {
  readonly source: AppExtensionSource
  readonly trust: AppExtensionTrustLevel
  readonly status: ExtensionHostSourceStatus
  readonly contributionCount: number
  readonly diagnosticCodes: readonly string[]
  readonly errorMessage?: string
}

export interface ExtensionHostResolvedSnapshot {
  readonly contributions: readonly AppExtensionContribution[]
  readonly resolved: AppExtensionResolvedSnapshot
  readonly sources: readonly ExtensionHostSourceReport[]
  readonly diagnostics: readonly AppExtensionDiagnostic[]
}

export interface ResolveExtensionHostSnapshotOptions {
  readonly sources: readonly ExtensionHostSourceDescriptor[]
  readonly resolution?: AppExtensionResolutionOptions
  readonly signal?: AbortSignal
}

export interface StaticExtensionHost {
  resolve(
    options?: Omit<ResolveExtensionHostSnapshotOptions, "sources">
  ): Promise<ExtensionHostResolvedSnapshot>
}
