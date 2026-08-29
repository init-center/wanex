export interface BackendIntegrationContract {
  readonly kind: "assistant.integration-contract"
  readonly recommendedPackage: "@wanex/assistant"
  readonly recommendedEntryPoint: "@wanex/assistant"
  readonly rendererEntryPoint: "@wanex/assistant/surface"
  readonly backendDependencies: readonly string[]
  readonly forbiddenDefaultDependencies: readonly string[]
  readonly lifecycleSteps: readonly BackendIntegrationLifecycleStep[]
  readonly assistantOwnedState: readonly BackendIntegrationAssistantOwnedState[]
  readonly rendererBoundary: BackendIntegrationRendererBoundary
}

export type BackendIntegrationLifecycleStep =
  | "create_app"
  | "adapt_command_port"
  | "dispose_app"

export type BackendIntegrationAssistantOwnedState =
  | "selected_session"
  | "panel_layout"
  | "mode_routing"
  | "renderer_state"
  | "ui_preferences"

export interface BackendIntegrationRendererBoundary {
  readonly rendererMayOpenStorage: false
  readonly rendererMayReceiveStorePath: false
  readonly rendererMayReceiveServiceBinaryPath: false
  readonly rendererCalls: "app-owned-ipc-or-api"
}
