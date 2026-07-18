import type {
  AppExtensionContributionDomain,
  AppExtensionConflictPolicy
} from "./types-domain.js"
import type { AppExtensionDiagnostic } from "./types-diagnostic.js"
import type { AppExtensionProvenance } from "./types-source.js"
import type {
  AppAgentContributionValue,
  AppCommandContributionValue,
  AppInstructionContributionValue,
  AppLifecycleHookContributionValue,
  AppProviderCatalogContributionValue,
  AppSkillContributionValue,
  AppToolContributionValue
} from "./types-contribution-values.js"

export interface AppExtensionContributionBase<
  Domain extends AppExtensionContributionDomain,
  Value
> {
  readonly id: string
  readonly domain: Domain
  readonly value: Value
  readonly provenance: AppExtensionProvenance
  readonly priority?: number
  readonly order?: number
  readonly conflictPolicy?: AppExtensionConflictPolicy
  readonly privileged?: boolean
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly diagnostics?: readonly AppExtensionDiagnostic[]
}

export type AppInstructionContribution = AppExtensionContributionBase<
  "instruction",
  AppInstructionContributionValue
>

export type AppSkillContribution = AppExtensionContributionBase<
  "skill",
  AppSkillContributionValue
>

export type AppCommandContribution = AppExtensionContributionBase<
  "command",
  AppCommandContributionValue
>

export type AppAgentContribution = AppExtensionContributionBase<
  "agent",
  AppAgentContributionValue
>

export type AppToolContribution = AppExtensionContributionBase<
  "tool",
  AppToolContributionValue
>

export type AppProviderCatalogContribution = AppExtensionContributionBase<
  "provider_catalog",
  AppProviderCatalogContributionValue
>

export type AppLifecycleHookContribution = AppExtensionContributionBase<
  "lifecycle_hook",
  AppLifecycleHookContributionValue
>

export type AppExtensionContribution =
  | AppInstructionContribution
  | AppSkillContribution
  | AppCommandContribution
  | AppAgentContribution
  | AppToolContribution
  | AppProviderCatalogContribution
  | AppLifecycleHookContribution
