import { createEvalScenario } from "./runner.js"
import { assert } from "./scenario-utils.js"
import { runAgentContextProfileSmoke } from "./assistant-smoke-matrix/agent-context-smoke.js"
import { runColdBootstrapSmoke } from "./assistant-smoke-matrix/cold-bootstrap-smoke.js"
import { runSingleAgentSmoke } from "./assistant-smoke-matrix/single-agent-smoke.js"

export const assistantSmokeMatrixScenario = createEvalScenario({
  id: "assistant.smoke-matrix",
  title: "Assistant entry matrix runs through the documented public entries",
  tags: ["assistant-matrix", "assistant-path", "app-runtime"],
  async run(context) {
    const cold = await runColdBootstrapSmoke(context.serviceBin)
    const singleAgent = await runSingleAgentSmoke(context.storage)
    const agentContext = await runAgentContextProfileSmoke(context.storage)

    assert(cold.doctorOk, "cold bootstrap should open storage and doctor")
    assert(cold.supportBundleOk, "cold support bundle should be readable")
    assert(
      singleAgent.assistantText === "Fake response from assistant-matrix-model",
      "single-agent entry should run through a model endpoint"
    )
    assert(
      agentContext.instructionSources === 1 &&
        agentContext.skillNames.includes("write-tests") &&
        !agentContext.leakedSkillBody,
      "agent context profile should project safely through public runtime packages"
    )
    return {
      cold,
      singleAgent,
      agentContext,
      entries: [
        "@wanex/runtime",
        "@wanex/app/diagnostics",
        "@wanex/runtime/context",
        "@wanex/runtime/host"
      ]
    }
  }
})
