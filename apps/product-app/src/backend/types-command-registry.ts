import type {
  AppCommandInputSchema,
  AppExtensionDiagnosticCode,
  AppExtensionDiagnosticSeverity,
  AppExtensionSourceKind,
  AppExtensionSourceScope,
  AppExtensionTrustLevel
} from "@wanex/extension"

export interface ProductAppBackendCommandRegistryCommands {
  readProductCommands(): ProductAppBackendCommandRegistryReadModel
  explainProductCommandContribution(
    request: ProductAppBackendExplainCommandContributionRequest
  ): ProductAppBackendCommandContributionExplanation
  previewProductCommandInvocation(
    request: ProductAppBackendPreviewCommandInvocationRequest
  ): ProductAppBackendCommandInvocationPreview
  executeProductCommand(
    request: ProductAppBackendExecuteCommandRequest
  ): Promise<ProductAppBackendExecuteCommandResult>
}

export interface ProductAppBackendCommandRegistryReadModel {
  readonly commands: readonly ProductAppBackendCommandRow[]
  readonly diagnostics: readonly ProductAppBackendCommandRegistryDiagnostic[]
}

export interface ProductAppBackendCommandRow {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly handlerRef: string
  readonly sourceKind: AppExtensionSourceKind
  readonly sourceScope: AppExtensionSourceScope
  readonly sourceId: string
  readonly trust: AppExtensionTrustLevel
  readonly category?: string
  readonly inputSchema?: AppCommandInputSchema
}

export interface ProductAppBackendCommandInputValidationIssue {
  readonly path: string
  readonly keyword: string
  readonly message: string
}

export interface ProductAppBackendCommandInputValidationDetails {
  readonly source: "schema" | "handler"
  readonly issues: readonly ProductAppBackendCommandInputValidationIssue[]
}

export interface ProductAppBackendCommandRegistryDiagnostic {
  readonly code: AppExtensionDiagnosticCode
  readonly severity: AppExtensionDiagnosticSeverity
  readonly message: string
  readonly contributionId?: string
  readonly domain?: string
  readonly sourceId?: string
}

export interface ProductAppBackendExplainCommandContributionRequest {
  readonly commandId: string
}

export type ProductAppBackendCommandContributionExplanation =
  | ProductAppBackendCommandContributionFoundExplanation
  | ProductAppBackendCommandContributionMissingExplanation

export interface ProductAppBackendCommandContributionFoundExplanation {
  readonly kind: "found"
  readonly commandId: string
  readonly command: ProductAppBackendCommandRow
  readonly source: ProductAppBackendContributionSourceExplanation
  readonly contribution: ProductAppBackendContributionExplanationMetadata
  readonly handler: ProductAppBackendCommandHandlerExplanation
  readonly diagnostics: readonly ProductAppBackendCommandRegistryDiagnostic[]
}

export interface ProductAppBackendCommandContributionMissingExplanation {
  readonly kind: "missing"
  readonly commandId: string
  readonly message: string
  readonly diagnostics: readonly ProductAppBackendCommandRegistryDiagnostic[]
}

export interface ProductAppBackendContributionSourceExplanation {
  readonly kind: AppExtensionSourceKind
  readonly scope: AppExtensionSourceScope
  readonly id: string
  readonly label?: string
  readonly path?: string
  readonly packageName?: string
  readonly version?: string
  readonly trust: AppExtensionTrustLevel
}

export interface ProductAppBackendContributionExplanationMetadata {
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

export interface ProductAppBackendCommandHandlerExplanation {
  readonly handlerRef: string
  readonly supported: boolean
  readonly policy:
    | "allow_listed"
    | "extension_executor"
    | "unsupported_handler_ref"
  readonly message: string
}

export type ProductAppBackendPreviewCommandInvocationRequest =
  ProductAppBackendExecuteCommandRequest

export type ProductAppBackendCommandInvocationPreview =
  | ProductAppBackendCommandInvocationRunnablePreview
  | ProductAppBackendCommandInvocationRejectedPreview

export interface ProductAppBackendCommandInvocationRunnablePreview {
  readonly kind: "runnable"
  readonly commandId: string
  readonly handlerRef: string
  readonly command: ProductAppBackendCommandRow
  readonly inputAccepted: true
}

export interface ProductAppBackendCommandInvocationRejectedPreview {
  readonly kind: "rejected"
  readonly commandId: string
  readonly reason:
    | "command_not_found"
    | "unsupported_handler_ref"
    | "invalid_input"
  readonly message: string
  readonly handlerRef?: string
  readonly command?: ProductAppBackendCommandRow
  readonly inputValidation?: ProductAppBackendCommandInputValidationDetails
}

export interface ProductAppBackendExecuteCommandRequest {
  readonly commandId: string
  readonly input?: unknown
}

export type ProductAppBackendExecuteCommandResult =
  | ProductAppBackendExecuteCommandCompletedResult
  | ProductAppBackendExecuteCommandRejectedResult

export interface ProductAppBackendExecuteCommandCompletedResult {
  readonly kind: "completed"
  readonly commandId: string
  readonly handlerRef: string
  readonly value: unknown
}

export interface ProductAppBackendExecuteCommandRejectedResult {
  readonly kind: "rejected"
  readonly commandId: string
  readonly reason:
    | "command_not_found"
    | "unsupported_handler_ref"
    | "invalid_input"
    | "execution_failed"
  readonly message: string
  readonly handlerRef?: string
  readonly inputValidation?: ProductAppBackendCommandInputValidationDetails
}
