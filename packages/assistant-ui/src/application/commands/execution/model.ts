import type { ExecuteCommandResult } from "@wanex/assistant/surface"

export interface CommandPreviewProviderViewModel {
  readonly status: string
  readonly reason: string
  readonly activeEndpointId?: string
  readonly canRun: boolean
  readonly attentionRequired: boolean
}

export type CommandExecutionState =
  | "empty"
  | ExecuteCommandResult["kind"]

export interface CommandExecutionViewModel {
  readonly kind: "web.command-execution"
  readonly state: CommandExecutionState
  readonly message: string
  readonly commandId?: string
  readonly handlerRef?: string
  readonly reason?: string
  readonly valueKind?: string
  readonly references: readonly CommandExecutionReference[]
  readonly provider?: CommandPreviewProviderViewModel
  readonly inputValidation?: CommandInputValidationViewModel
  readonly updatedAt?: number
}

export interface CommandInputValidationViewModel {
  readonly source: "schema" | "handler"
  readonly issues: readonly CommandInputValidationIssueViewModel[]
}

export interface CommandInputValidationIssueViewModel {
  readonly path: string
  readonly keyword: string
  readonly message: string
}

export interface CommandExecutionReference {
  readonly kind: string
  readonly id: string
}
