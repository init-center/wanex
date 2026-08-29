import { rm } from "node:fs/promises"
import { createWanexApp } from "@wanex/app"
import { createEvalScenario } from "../runner.js"
import { assert, evalFakeModelEndpoint } from "../scenario-utils.js"
import { mktemp } from "./helpers.js"

export const appDefaultEntryContractScenario = createEvalScenario({
  id: "app.default-entry-contract",
  title: "Wanex App default entry runs without optional composition",
  tags: ["app", "bootstrap", "assistant-path"],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-app-entry-")
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: { explicitPath: context.serviceBin },
      modelEndpoint: evalFakeModelEndpoint(
        "eval-app-default",
        "eval-app-model"
      )
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
        status.activeModelEndpointId === "eval-app-default",
        "Wanex App should project the active model endpoint"
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
        activeModelEndpointId: status.activeModelEndpointId,
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
