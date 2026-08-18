export interface BackendIntegrationContract {
  readonly kind: "product.integration-contract"
  readonly recommendedPackage: "@wanex/product"
  readonly recommendedEntryPoint: "@wanex/product"
  readonly rendererEntryPoint: "@wanex/product/surface"
  readonly backendDependencies: readonly string[]
  readonly forbiddenDefaultDependencies: readonly string[]
  readonly lifecycleSteps: readonly BackendIntegrationLifecycleStep[]
  readonly productOwnedState: readonly BackendIntegrationProductOwnedState[]
  readonly rendererBoundary: BackendIntegrationRendererBoundary
}

export type BackendIntegrationLifecycleStep =
  | "create_app"
  | "adapt_command_port"
  | "dispose_app"

export type BackendIntegrationProductOwnedState =
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
