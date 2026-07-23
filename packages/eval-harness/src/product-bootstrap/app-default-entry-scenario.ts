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
        storeDir
      },
      artifacts: { explicitPath: context.serviceBin },
      providerProfile: {
        id: "eval-app-default",
        modelId: "eval-app-model"
      }
    })

    try {
      const receipt = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "eval app default entry" }]
      })
      const operation = await waitForTerminal(app, receipt)
      const status = app.status()

      assert(
        operation.result?.assistantText === "Fake response from eval-app-model",
        "Wanex App should complete a durable operation through the default entry"
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
        sessionId: receipt.sessionId,
        inputId: receipt.inputId,
        turnId: receipt.turnId,
        jobId: receipt.jobId,
        operationState: operation.state,
        assistantText: operation.result?.assistantText,
        providerProfileId: status.providerProfileId,
        activeProviderProfileId: status.activeProviderProfileId,
        messageCount: operation.result?.messageCount,
        privateFieldCount: 0
      }
    } finally {
      await app.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})

async function waitForTerminal(
  app: Awaited<ReturnType<typeof createWanexApp>>,
  reference: {
    readonly sessionId: string
    readonly inputId: string
    readonly turnId: string
    readonly jobId: string
  }
) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await app.commands.readConversationOperation(reference)
    if (result.kind === "found" &&
      ["succeeded", "failed", "cancelled", "interrupted", "recovery_required"]
        .includes(result.operation.state)) {
      return result.operation
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Eval App operation did not reach terminal state")
}
