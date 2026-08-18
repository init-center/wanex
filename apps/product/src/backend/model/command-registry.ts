import type {
  AppCommandInputSchema,
  AppExtensionDiagnosticCode,
  AppExtensionDiagnosticSeverity,
  AppExtensionSourceKind,
  AppExtensionSourceScope,
  AppExtensionTrustLevel
} from "@wanex/extension"

export interface BackendCommandRegistryCommands {
  readProductCommands(): BackendCommandRegistryReadModel
  explainProductCommandContribution(
    request: BackendExplainCommandContributionRequest
  ): BackendCommandContributionExplanation
  previewProductCommandInvocation(
    request: BackendPreviewCommandInvocationRequest
  ): BackendCommandInvocationPreview
  executeProductCommand(
    request: BackendExecuteCommandRequest
  ): Promise<BackendExecuteCommandResult>
}

export interface BackendCommandRegistryReadModel {
  readonly extensionRevision?: string
  readonly commands: readonly BackendCommandRow[]
  readonly diagnostics: readonly BackendCommandRegistryDiagnostic[]
}

export interface BackendCommandRow {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly handlerRef: string
  readonly sourceKind: AppExtensionSourceKind
  readonly sourceScope: AppExtensionSourceScope
  readonly sourceId: string
  readonly trust: AppExtensionTrustLevel
  readonly category?: string
  readonly paletteVisibility: "visible" | "hidden"
  readonly inputSchema?: AppCommandInputSchema
}

export interface BackendCommandInputValidationIssue {
  readonly path: string
  readonly keyword: string
  readonly message: string
}

export interface BackendCommandInputValidationDetails {
  readonly source: "schema" | "handler"
  readonly issues: readonly BackendCommandInputValidationIssue[]
}

export interface BackendCommandRegistryDiagnostic {
  readonly code: AppExtensionDiagnosticCode
  readonly severity: AppExtensionDiagnosticSeverity
  readonly message: string
  readonly contributionId?: string
  readonly domain?: string
  readonly sourceId?: string
}

export interface BackendExplainCommandContributionRequest {
  readonly commandId: string
}

export type BackendCommandContributionExplanation =
  | BackendCommandContributionFoundExplanation
  | BackendCommandContributionMissingExplanation

export interface BackendCommandContributionFoundExplanation {
  readonly kind: "found"
  readonly commandId: string
  readonly command: BackendCommandRow
  readonly source: BackendContributionSourceExplanation
  readonly contribution: BackendContributionExplanationMetadata
  readonly handler: BackendCommandHandlerExplanation
  readonly diagnostics: readonly BackendCommandRegistryDiagnostic[]
}

export interface BackendCommandContributionMissingExplanation {
  readonly kind: "missing"
  readonly commandId: string
  readonly message: string
  readonly diagnostics: readonly BackendCommandRegistryDiagnostic[]
}

export interface BackendContributionSourceExplanation {
  readonly kind: AppExtensionSourceKind
  readonly scope: AppExtensionSourceScope
  readonly id: string
  readonly label?: string
  readonly path?: string
  readonly packageName?: string
  readonly version?: string
  readonly trust: AppExtensionTrustLevel
}

export interface BackendContributionExplanationMetadata {
  readonly id: string
  readonly domain: "command"
  readonly priority: number
  readonly order: number
  readonly privileged: boolean
  readonly originId?: string
  readonly originLabel?: string
  readonly loadedAt?: number
  readonly aliases: readonly string[]
}

export interface BackendCommandHandlerExplanation {
  readonly handlerRef: string
  readonly supported: boolean
  readonly policy:
    | "allow_listed"
    | "extension_executor"
    | "unsupported_handler_ref"
  readonly message: string
}

export type BackendPreviewCommandInvocationRequest =
  BackendExecuteCommandRequest

export type BackendCommandInvocationPreview =
  | BackendCommandInvocationRunnablePreview
  | BackendCommandInvocationRejectedPreview

export interface BackendCommandInvocationRunnablePreview {
  readonly kind: "runnable"
  readonly commandId: string
  readonly handlerRef: string
  readonly command: BackendCommandRow
  readonly inputAccepted: true
}

export interface BackendCommandInvocationRejectedPreview {
  readonly kind: "rejected"
  readonly commandId: string
  readonly reason:
    | "command_not_found"
    | "unsupported_handler_ref"
    | "invalid_input"
  readonly message: string
  readonly handlerRef?: string
  readonly command?: BackendCommandRow
  readonly inputValidation?: BackendCommandInputValidationDetails
}

export interface BackendExecuteCommandRequest {
  readonly commandId: string
  readonly input?: unknown
}

export type BackendExecuteCommandResult =
  | BackendExecuteCommandCompletedResult
  | BackendExecuteCommandSubmittedResult
  | BackendExecuteCommandRejectedResult

export interface BackendExecuteCommandCompletedResult {
  readonly kind: "completed"
  readonly commandId: string
  readonly handlerRef: string
  readonly value: unknown
}

export interface BackendExecuteCommandSubmittedResult {
  readonly kind: "submitted"
  readonly commandId: string
  readonly handlerRef: string
  readonly value: unknown
}

export interface BackendExecuteCommandRejectedResult {
  readonly kind: "rejected"
  readonly commandId: string
  readonly reason:
    | "command_not_found"
    | "unsupported_handler_ref"
    | "invalid_input"
    | "execution_failed"
  readonly message: string
  readonly handlerRef?: string
  readonly inputValidation?: BackendCommandInputValidationDetails
}
