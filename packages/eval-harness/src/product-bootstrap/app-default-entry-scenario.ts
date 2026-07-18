import { rm } from "node:fs/promises"
import { createWanexApp } from "@wanex/app"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import { mktemp } from "./helpers.js"

export const appDefaultEntryContractScenario = createEvalScenario({
  id: "app.default-entry-contract",
  title: "Wanex App default entry runs without optional composition",
  tags: ["app", "bootstrap", "product-path"],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-app-entry-")
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir,
        serviceBin: context.serviceBin
      },
      provider: {
        id: "eval-app-default",
        modelId: "eval-app-model"
      }
    })

    try {
      const run = await app.run({ text: "eval app default entry" })
      const status = app.status()

      assert(
        run.assistantText === "Fake response from eval-app-model",
        "Wanex App should run an agent turn through the default entry"
      )
      assert(
        status.providerProfileId === "eval-app-default" &&
          status.activeProviderProfileId === "eval-app-default",
        "Wanex App should project the active provider profile"
      )
      assert(
        !("storeDir" in status) &&
          !("serviceBin" in status) &&
          !("apiKey" in status),
        "Wanex App status must not expose paths or provider secrets"
      )

      return {
        entry: "@wanex/app",
        sessionId: run.sessionId,
        assistantText: run.assistantText,
        providerProfileId: status.providerProfileId,
        activeProviderProfileId: status.activeProviderProfileId,
        messageCount: run.messageCount,
        privateFieldCount: 0
      }
    } finally {
      await app.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})
