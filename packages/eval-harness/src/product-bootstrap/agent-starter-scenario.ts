import { rm } from "node:fs/promises"
import { WanexAgentRuntime } from "@wanex/runtime/host"
import { buildAppDiagnosticsSnapshot } from "@wanex/app/diagnostics"
import { bootstrapWanexStorage } from "@wanex/runtime/bootstrap"
import { writeProviderProfile } from "@wanex/runtime/provider"
import { createPluginStore } from "@wanex/storage/plugin"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import { assistantText, mktemp } from "./helpers.js"

export const agentStarterContractScenario = createEvalScenario({
  id: "agent.starter-contract",
  title: "Minimal agent starter contract runs a turn and reads diagnostics",
  tags: ["bootstrap", "agent", "product-path"],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-agent-starter-")
    const runtime = await bootstrapWanexStorage({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: context.serviceBin
      }
    })
    try {
      const plugin = createPluginStore(runtime.transport)
      await writeProviderProfile(runtime.storage, {
        id: "eval-agent-starter",
        kind: "fake",
        providerId: "fake",
        modelId: "eval-starter-model"
      })
      const agent = new WanexAgentRuntime({
        storage: runtime.storage,
        providerProfileId: "eval-agent-starter"
      })
      const result = await agent.submitAndRunUserText({
        text: "eval starter",
        sessionId: "ses_eval_agent_starter",
        principalId: "eval-agent-starter-user"
      })
      await agent.stop()
      const [jobs, manifests, installs] = await Promise.all([
        runtime.storage.listJobs({ limit: 50 }),
        plugin.listPluginManifests({ limit: 50 }),
        plugin.listPluginInstalls({ limit: 50 })
      ])
      const diagnostics = buildAppDiagnosticsSnapshot({
        jobs,
        plugin: {
          manifests,
          installs
        }
      })
      const text = assistantText(result.messages)
      assert(
        text === "Fake response from eval-starter-model",
        "starter should return fake provider response"
      )
      return {
        sessionId: result.session.id,
        assistantText: text,
        diagnosticCodes: diagnostics.diagnostics.map((item) => item.code)
      }
    } finally {
      await runtime.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})
