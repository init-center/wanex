import type {
  ProductAppBackendIntegrationContract
} from "./types-integration-contract.js"

export const PRODUCT_APP_BACKEND_INTEGRATION_CONTRACT = {
  kind: "product-app.integration-contract",
  recommendedPackage: "@wanex/product-app",
  recommendedEntryPoint: "@wanex/product-app",
  rendererEntryPoint: "@wanex/product-app/surface-client",
  backendDependencies: ["@wanex/app"],
  forbiddenDefaultDependencies: [
    "@wanex/storage",
    "@wanex/plugin",
    "@wanex/connector",
    "@wanex/runtime/host"
  ],
  lifecycleSteps: [
    "create_app",
    "adapt_command_port",
    "dispose_app"
  ],
  productOwnedState: [
    "selected_session",
    "panel_layout",
    "mode_routing",
    "renderer_state",
    "ui_preferences"
  ],
  rendererBoundary: {
    rendererMayOpenStorage: false,
    rendererMayReceiveStorePath: false,
    rendererMayReceiveServiceBinaryPath: false,
    rendererCalls: "app-owned-ipc-or-api"
  }
} as const satisfies ProductAppBackendIntegrationContract
