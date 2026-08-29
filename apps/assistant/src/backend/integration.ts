import type {
  BackendIntegrationContract
} from "./model/integration.js"

export const BACKEND_INTEGRATION_CONTRACT = {
  kind: "assistant.integration-contract",
  recommendedPackage: "@wanex/assistant",
  recommendedEntryPoint: "@wanex/assistant",
  rendererEntryPoint: "@wanex/assistant/surface",
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
  assistantOwnedState: [
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
} as const satisfies BackendIntegrationContract
