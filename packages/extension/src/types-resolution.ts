import type {
  AppAgentContribution,
  AppCommandContribution,
  AppExtensionContribution,
  AppInstructionContribution,
  AppLifecycleHookContribution,
  AppProviderCatalogContribution,
  AppSkillContribution,
  AppToolContribution
} from "./types-contribution.js"
import type { AppExtensionDiagnostic } from "./types-diagnostic.js"
import type { AppExtensionSourceKind } from "./types-source.js"

export interface AppExtensionResolutionOptions {
  readonly sourceOrder?: readonly AppExtensionSourceKind[]
  readonly allowUntrustedPrivileged?: boolean
}

export interface AppExtensionResolvedDomain<
  Contribution extends AppExtensionContribution = AppExtensionContribution
> {
  readonly all: readonly Contribution[]
  readonly byId: ReadonlyMap<string, Contribution>
}

export interface AppExtensionResolvedSnapshot {
  readonly contributions: readonly AppExtensionContribution[]
  readonly byDomain: Readonly<{
    instruction: AppExtensionResolvedDomain<AppInstructionContribution>
    skill: AppExtensionResolvedDomain<AppSkillContribution>
    command: AppExtensionResolvedDomain<AppCommandContribution>
    agent: AppExtensionResolvedDomain<AppAgentContribution>
    tool: AppExtensionResolvedDomain<AppToolContribution>
    provider_catalog: AppExtensionResolvedDomain<AppProviderCatalogContribution>
    lifecycle_hook: AppExtensionResolvedDomain<AppLifecycleHookContribution>
  }>
  readonly diagnostics: readonly AppExtensionDiagnostic[]
}
