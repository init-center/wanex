import type {
  AppCommandContribution,
  AppExtensionDiagnostic,
  AppExtensionResolvedSnapshot
} from "@wanex/extension"
import type {
  TuiCommandPaletteContribution,
  TuiContributionDiagnostic,
  TuiKeybindingContribution,
  TuiNotificationContribution,
  TuiPanelContribution,
  TuiPromptDecorationContribution,
  TuiResolvedSnapshot,
  TuiStatusItemContribution,
  TuiThemeContribution
} from "../surface/index.js"

export type TuiShellDiagnosticSeverity = "info" | "warning" | "error"

export type TuiShellDiagnosticCode =
  | "tui-shell.dangling_command"
  | "tui-shell.app_diagnostic"
  | "tui-shell.tui_diagnostic"

export interface TuiShellDiagnostic {
  readonly code: TuiShellDiagnosticCode
  readonly severity: TuiShellDiagnosticSeverity
  readonly message: string
  readonly contributionId?: string
  readonly commandId?: string
  readonly sourceId?: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface TuiShellCommandRef {
  readonly commandId: string
  readonly title?: string
  readonly description?: string
  readonly category?: string
  readonly handlerRef?: string
  readonly contribution?: AppCommandContribution
}

export interface TuiShellPaletteEntry {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly category?: string
  readonly aliases: readonly string[]
  readonly when?: string
  readonly command: TuiShellCommandRef
  readonly contribution: TuiCommandPaletteContribution
}

export interface TuiShellKeybinding {
  readonly id: string
  readonly key: string
  readonly when?: string
  readonly platform?: "all" | "macos" | "windows" | "linux"
  readonly command: TuiShellCommandRef
  readonly contribution: TuiKeybindingContribution
}

export interface TuiShellPanel {
  readonly id: string
  readonly panelId: string
  readonly title: string
  readonly placement: "left" | "right" | "bottom" | "overlay"
  readonly componentRef: string
  readonly when?: string
  readonly contribution: TuiPanelContribution
}

export interface TuiShellStatusItem {
  readonly id: string
  readonly itemId: string
  readonly label: string
  readonly alignment: "left" | "right"
  readonly priority: number
  readonly when?: string
  readonly command?: TuiShellCommandRef
  readonly contribution: TuiStatusItemContribution
}

export interface TuiShellPromptDecoration {
  readonly id: string
  readonly decorationId: string
  readonly placement: "prefix" | "suffix" | "placeholder" | "toolbar"
  readonly text?: string
  readonly icon?: string
  readonly when?: string
  readonly command?: TuiShellCommandRef
  readonly contribution: TuiPromptDecorationContribution
}

export interface TuiShellTheme {
  readonly id: string
  readonly themeId: string
  readonly displayName: string
  readonly colors: Readonly<Record<string, string>>
  readonly contribution: TuiThemeContribution
}

export interface TuiShellNotification {
  readonly id: string
  readonly notificationId: string
  readonly level: "info" | "warning" | "error"
  readonly title: string
  readonly message?: string
  readonly when?: string
  readonly command?: TuiShellCommandRef
  readonly contribution: TuiNotificationContribution
}

export interface TuiShellReadModel {
  readonly palette: readonly TuiShellPaletteEntry[]
  readonly keybindings: readonly TuiShellKeybinding[]
  readonly panels: readonly TuiShellPanel[]
  readonly statusItems: readonly TuiShellStatusItem[]
  readonly promptDecorations: readonly TuiShellPromptDecoration[]
  readonly themes: readonly TuiShellTheme[]
  readonly notifications: readonly TuiShellNotification[]
  readonly diagnostics: readonly TuiShellDiagnostic[]
}

export interface BuildTuiShellReadModelRequest {
  readonly app: AppExtensionResolvedSnapshot
  readonly tui: TuiResolvedSnapshot
  readonly includeSourceDiagnostics?: boolean
}

export type SourceDiagnostic =
  | AppExtensionDiagnostic
  | TuiContributionDiagnostic
