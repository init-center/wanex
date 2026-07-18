export type TuiContributionDomain =
  | "command_palette"
  | "keybinding"
  | "panel"
  | "status_item"
  | "prompt_decoration"
  | "theme"
  | "notification"

export type TuiContributionSourceKind =
  | "builtin"
  | "policy"
  | "global_config"
  | "project_config"
  | "plugin"
  | "marketplace"
  | "connector"
  | "runtime_override"

export type TuiContributionSourceScope =
  | "builtin"
  | "enterprise"
  | "global"
  | "project"
  | "workspace"
  | "user"
  | "runtime"

export type TuiContributionTrustLevel =
  | "trusted"
  | "user_enabled"
  | "untrusted"
  | "blocked"

export type TuiContributionConflictPolicy =
  | "replace"
  | "append"
  | "merge"
  | "error"

export type TuiContributionDiagnosticSeverity = "info" | "warning" | "error"

export type TuiContributionDiagnosticCode =
  | "tui.invalid_id"
  | "tui.invalid_domain"
  | "tui.blocked_source"
  | "tui.privileged_untrusted"
  | "tui.duplicate_replaced"
  | "tui.duplicate_error"
  | "tui.appended"
  | "tui.merged"

export interface TuiContributionSource {
  readonly kind: TuiContributionSourceKind
  readonly scope: TuiContributionSourceScope
  readonly id: string
  readonly label?: string
  readonly path?: string
  readonly packageName?: string
  readonly version?: string
}

export interface TuiContributionProvenance {
  readonly source: TuiContributionSource
  readonly trust: TuiContributionTrustLevel
  readonly originId?: string
  readonly originLabel?: string
  readonly loadedAt?: number
}

export interface TuiContributionDiagnostic {
  readonly code: TuiContributionDiagnosticCode
  readonly severity: TuiContributionDiagnosticSeverity
  readonly message: string
  readonly contributionId?: string
  readonly domain?: TuiContributionDomain | string
  readonly sourceId?: string
  readonly replacedBy?: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface TuiContributionBase<
  Domain extends TuiContributionDomain,
  Value
> {
  readonly id: string
  readonly domain: Domain
  readonly value: Value
  readonly provenance: TuiContributionProvenance
  readonly priority?: number
  readonly order?: number
  readonly conflictPolicy?: TuiContributionConflictPolicy
  readonly privileged?: boolean
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly diagnostics?: readonly TuiContributionDiagnostic[]
}

export interface TuiCommandPaletteContributionValue {
  readonly commandId: string
  readonly title: string
  readonly description?: string
  readonly category?: string
  readonly aliases?: readonly string[]
  readonly when?: string
  readonly handlerRef?: string
}

export interface TuiKeybindingContributionValue {
  readonly key: string
  readonly commandId: string
  readonly when?: string
  readonly platform?: "all" | "macos" | "windows" | "linux"
}

export interface TuiPanelContributionValue {
  readonly panelId: string
  readonly title: string
  readonly placement: "left" | "right" | "bottom" | "overlay"
  readonly componentRef: string
  readonly when?: string
}

export interface TuiStatusItemContributionValue {
  readonly itemId: string
  readonly label: string
  readonly alignment: "left" | "right"
  readonly priority?: number
  readonly commandId?: string
  readonly when?: string
}

export interface TuiPromptDecorationContributionValue {
  readonly decorationId: string
  readonly placement: "prefix" | "suffix" | "placeholder" | "toolbar"
  readonly text?: string
  readonly icon?: string
  readonly commandId?: string
  readonly when?: string
}

export interface TuiThemeContributionValue {
  readonly themeId: string
  readonly displayName: string
  readonly colors: Readonly<Record<string, string>>
}

export interface TuiNotificationContributionValue {
  readonly notificationId: string
  readonly level: "info" | "warning" | "error"
  readonly title: string
  readonly message?: string
  readonly commandId?: string
  readonly when?: string
}

export type TuiCommandPaletteContribution = TuiContributionBase<
  "command_palette",
  TuiCommandPaletteContributionValue
>

export type TuiKeybindingContribution = TuiContributionBase<
  "keybinding",
  TuiKeybindingContributionValue
>

export type TuiPanelContribution = TuiContributionBase<
  "panel",
  TuiPanelContributionValue
>

export type TuiStatusItemContribution = TuiContributionBase<
  "status_item",
  TuiStatusItemContributionValue
>

export type TuiPromptDecorationContribution = TuiContributionBase<
  "prompt_decoration",
  TuiPromptDecorationContributionValue
>

export type TuiThemeContribution = TuiContributionBase<
  "theme",
  TuiThemeContributionValue
>

export type TuiNotificationContribution = TuiContributionBase<
  "notification",
  TuiNotificationContributionValue
>

export type TuiContribution =
  | TuiCommandPaletteContribution
  | TuiKeybindingContribution
  | TuiPanelContribution
  | TuiStatusItemContribution
  | TuiPromptDecorationContribution
  | TuiThemeContribution
  | TuiNotificationContribution

export interface TuiContributionResolutionOptions {
  readonly sourceOrder?: readonly TuiContributionSourceKind[]
  readonly allowUntrustedPrivileged?: boolean
}

export interface TuiResolvedDomain<
  Contribution extends TuiContribution = TuiContribution
> {
  readonly all: readonly Contribution[]
  readonly byId: ReadonlyMap<string, Contribution>
}

export interface TuiResolvedSnapshot {
  readonly contributions: readonly TuiContribution[]
  readonly byDomain: Readonly<{
    command_palette: TuiResolvedDomain<TuiCommandPaletteContribution>
    keybinding: TuiResolvedDomain<TuiKeybindingContribution>
    panel: TuiResolvedDomain<TuiPanelContribution>
    status_item: TuiResolvedDomain<TuiStatusItemContribution>
    prompt_decoration: TuiResolvedDomain<TuiPromptDecorationContribution>
    theme: TuiResolvedDomain<TuiThemeContribution>
    notification: TuiResolvedDomain<TuiNotificationContribution>
  }>
  readonly diagnostics: readonly TuiContributionDiagnostic[]
}
