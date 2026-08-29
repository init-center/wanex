import {
  BACKEND_INTEGRATION_CONTRACT
} from "@wanex/assistant/backend"
import { createEvalScenario } from "./runner.js"
import { assert } from "./scenario-utils.js"

export const backendIntegrationContractScenario = createEvalScenario({
  id: "assistant.skeleton-integration-contract",
  title: "Wanex App freezes the upper app integration boundary",
  tags: ["assistant-path", "upper-app", "contract"],
  run() {
    const contract = BACKEND_INTEGRATION_CONTRACT

    assert(
      contract.recommendedPackage === "@wanex/assistant" &&
        contract.recommendedEntryPoint === "@wanex/assistant" &&
        contract.rendererEntryPoint === "@wanex/assistant/surface",
      "Wanex Assistant surfaces should start from the assistant facade"
    )
    assert(
      contract.backendDependencies.length === 1 &&
        contract.backendDependencies[0] === "@wanex/app",
      "assistant backend should use the typed App backend contract"
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
      contract.assistantOwnedState.includes("selected_session") &&
        contract.assistantOwnedState.includes("panel_layout") &&
        contract.assistantOwnedState.includes("mode_routing"),
      "UI selection and mode state should stay Assistant-owned"
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
      assistantOwnedStateCount: contract.assistantOwnedState.length,
      rendererCalls: contract.rendererBoundary.rendererCalls
    }
  }
})
