export interface AppExtensionCommandExecutor {
  supports(handlerRef: string): boolean
  preview(
    request: AppExtensionCommandExecutionRequest
  ): AppExtensionCommandPreviewResult
  execute(request: AppExtensionCommandExecutionRequest): Promise<unknown>
}

export interface AppExtensionCommandExecutionRequest {
  readonly commandId: string
  readonly handlerRef: string
  readonly input?: unknown
}

export type AppExtensionCommandPreviewResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string }
