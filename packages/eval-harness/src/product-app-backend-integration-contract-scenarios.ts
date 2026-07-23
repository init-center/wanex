import {
  PRODUCT_APP_BACKEND_INTEGRATION_CONTRACT
} from "@wanex/product-app/backend"
import { createEvalScenario } from "./runner.js"
import { assert } from "./scenario-utils.js"

export const productAppBackendIntegrationContractScenario = createEvalScenario({
  id: "product.skeleton-integration-contract",
  title: "Wanex App freezes the upper app integration boundary",
  tags: ["product-path", "upper-app", "contract"],
  run() {
    const contract = PRODUCT_APP_BACKEND_INTEGRATION_CONTRACT

    assert(
      contract.recommendedPackage === "@wanex/product-app" &&
        contract.recommendedEntryPoint === "@wanex/product-app" &&
        contract.rendererEntryPoint === "@wanex/product-app/surface-client",
      "Wanex Product surfaces should start from the Product App facade"
    )
    assert(
      contract.backendDependencies.length === 1 &&
        contract.backendDependencies[0] === "@wanex/app",
      "Product App backend should use the typed App backend contract"
    )
    for (const forbidden of [
      "@wanex/storage",
      "@wanex/plugin",
      "@wanex/connector",
      "@wanex/runtime/host"
    ] as const) {
      assert(
        contract.forbiddenDefaultDependencies.includes(forbidden),
        `normal upper apps should not default to ${forbidden}`
      )
    }
    assert(
      contract.lifecycleSteps.join(">") ===
        "create_app>adapt_command_port>dispose_app",
      "upper app lifecycle should be explicit and disposable"
    )
    assert(
      contract.productOwnedState.includes("selected_session") &&
        contract.productOwnedState.includes("panel_layout") &&
        contract.productOwnedState.includes("mode_routing"),
      "UI selection and mode state should stay Product-owned"
    )
    assert(
      !contract.rendererBoundary.rendererMayOpenStorage &&
        !contract.rendererBoundary.rendererMayReceiveStorePath &&
        !contract.rendererBoundary.rendererMayReceiveServiceBinaryPath &&
        contract.rendererBoundary.rendererCalls === "app-owned-ipc-or-api",
      "renderers should call app-owned wrappers and never receive storage internals"
    )

    return {
      recommendedPackage: contract.recommendedPackage,
      recommendedEntryPoint: contract.recommendedEntryPoint,
      rendererEntryPoint: contract.rendererEntryPoint,
      backendDependencyCount: contract.backendDependencies.length,
      forbiddenDefaultDependencyCount:
        contract.forbiddenDefaultDependencies.length,
      lifecycle: contract.lifecycleSteps.join(">"),
      productOwnedStateCount: contract.productOwnedState.length,
      rendererCalls: contract.rendererBoundary.rendererCalls
    }
  }
})
