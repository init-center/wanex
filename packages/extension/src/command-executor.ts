export interface AppExtensionCommandExecutor {
  supports(handlerRef: string): boolean
  preview(
    request: AppExtensionCommandExecutionRequest
  ): AppExtensionCommandPreviewResult
  execute(
    request: AppExtensionCommandExecutionRequest
  ): Promise<AppExtensionCommandExecutionResult>
}

export interface AppExtensionCommandExecutionRequest {
  readonly commandId: string
  readonly handlerRef: string
  readonly input?: unknown
}

export type AppExtensionCommandPreviewResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string }

export type AppExtensionCommandExecutionResult =
  | AppExtensionCommandCompletedResult
  | AppExtensionCommandSubmittedResult

export interface AppExtensionCommandCompletedResult {
  readonly kind: "completed"
  readonly value: unknown
}

export interface AppExtensionCommandSubmittedResult {
  readonly kind: "submitted"
  readonly value: unknown
}
