import type { AppExtensionContributionDomain } from "./types-domain.js"

export type AppExtensionDiagnosticSeverity = "info" | "warning" | "error"

export type AppExtensionDiagnosticCode =
  | "extension.invalid_id"
  | "extension.invalid_domain"
  | "extension.blocked_source"
  | "extension.privileged_untrusted"
  | "extension.command_palette_visibility_invalid"
  | "extension.command_input_schema_invalid"
  | "extension.command_input_schema_unsupported"
  | "extension.command_input_schema_limit_exceeded"
  | "extension.duplicate_replaced"
  | "extension.duplicate_error"
  | "extension.appended"
  | "extension.merged"

export interface AppExtensionDiagnostic {
  readonly code: AppExtensionDiagnosticCode
  readonly severity: AppExtensionDiagnosticSeverity
  readonly message: string
  readonly contributionId?: string
  readonly domain?: AppExtensionContributionDomain | string
  readonly sourceId?: string
  readonly replacedBy?: string
  readonly metadata?: Readonly<Record<string, unknown>>
}
