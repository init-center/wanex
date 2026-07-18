export interface ProductAppBackendIntegrationContract {
  readonly kind: "product-app.integration-contract"
  readonly recommendedPackage: "@wanex/product-app"
  readonly recommendedEntryPoint: "@wanex/product-app"
  readonly rendererEntryPoint: "@wanex/product-app/surface-client"
  readonly backendDependencies: readonly string[]
  readonly forbiddenDefaultDependencies: readonly string[]
  readonly lifecycleSteps: readonly ProductAppBackendIntegrationLifecycleStep[]
  readonly productOwnedState: readonly ProductAppBackendIntegrationProductOwnedState[]
  readonly rendererBoundary: ProductAppBackendIntegrationRendererBoundary
}

export type ProductAppBackendIntegrationLifecycleStep =
  | "create_app"
  | "adapt_command_port"
  | "dispose_app"

export type ProductAppBackendIntegrationProductOwnedState =
  | "selected_session"
  | "panel_layout"
  | "mode_routing"
  | "renderer_state"
  | "ui_preferences"

export interface ProductAppBackendIntegrationRendererBoundary {
  readonly rendererMayOpenStorage: false
  readonly rendererMayReceiveStorePath: false
  readonly rendererMayReceiveServiceBinaryPath: false
  readonly rendererCalls: "app-owned-ipc-or-api"
}
