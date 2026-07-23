import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS,
  createProductAppBackendShell,
  type ProductAppBackendConversationOperationReceipt
} from "@wanex/product-app/backend"
import { waitForBackendConversation } from "./product-app/conversation-helpers.js"
import { createEvalScenario } from "./runner.js"
import { assert, isRecord } from "./scenario-utils.js"

const sessionId = "ses_eval_product_workbench"

export const productAppBackendWorkbenchScenario = createEvalScenario({
  id: "product.skeleton-workbench-contract",
  title: "App command runtime reads canonical selected-session transcripts",
  tags: ["product-path", "workbench", "session"],
  async run(context) {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-eval-product-workbench-"))
    const shell = await createProductAppBackendShell({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: context.serviceBin },
      providerProfile: {
        id: "eval-product-workbench",
        modelId: "eval-product-workbench-model"
      }
    })

    try {
      const receipt = await shell.commands.submitConversationOperation({
        content: [{ type: "text", text: "seed workbench" }],
        sessionId
      })
      await waitForBackendConversation(shell.commands, receipt)
      const typed = await shell.commands.readProductWorkbench({ sessionId })
      const port = await shell.dispatch({
        command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductWorkbench,
        input: { sessionId }
      })
      const submitted = await shell.dispatchJson(
        JSON.stringify({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.submitConversationOperation,
          input: {
            sessionId,
            text: "submit another turn"
          }
        })
      )

      assertWorkbench(typed, 1, "seed workbench")
      assert(port.ok, "workbench command-port dispatch should succeed")
      assertWorkbench(port.value, 1, "seed workbench")
      assert(
        submitted.status === "success" && submitted.envelope.ok,
        "conversation submit JSON dispatch should succeed"
      )
      assertConversationReceipt(submitted.envelope.value)
      await waitForBackendConversation(shell.commands, submitted.envelope.value)
      const refreshed = await shell.commands.readProductWorkbench({ sessionId })
      assertWorkbench(refreshed, 2, "submit another turn")

      return {
        sessionId,
        typedInputCount: typed.summary.inputCount,
        typedMessageCount: typed.summary.messageCount,
        refreshedInputCount: refreshed.summary.inputCount,
        refreshedMessageCount: refreshed.summary.messageCount,
        latestUserText: refreshed.summary.latestUserText ?? "",
        submitState: submitted.envelope.value.state
      }
    } finally {
      await shell.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})

function assertWorkbench(
  value: unknown,
  inputCount: number,
  latestUserText: string
): void {
  assert(isRecord(value), "workbench should be an object")
  assert(value.kind === "product-app.backend.workbench", "workbench kind should match")
  assert(value.sessionId === sessionId, "workbench sessionId should match")
  assert(isRecord(value.summary), "workbench should include summary")
  assert(value.summary.inputCount === inputCount, "workbench input count should match")
  assert(
    value.summary.messageCount === inputCount * 2,
    "workbench should retain promoted user and assistant messages for each turn"
  )
  assert(
    value.summary.latestUserText === latestUserText,
    "workbench latest user text should match"
  )
  assert(
    Array.isArray(value.summary.originKinds) &&
      value.summary.originKinds.includes("interactive"),
    "workbench should summarize provenance origins"
  )
  assert(isRecord(value.actions), "workbench should include actions")
  assert(
    value.actions.submitCommandId === "product.agent.submit",
    "workbench should expose asynchronous submit action"
  )
}

function assertConversationReceipt(
  value: unknown
): asserts value is ProductAppBackendConversationOperationReceipt {
  assert(isRecord(value), "conversation receipt should be an object")
  assert(
    typeof value.sessionId === "string" &&
      typeof value.inputId === "string" &&
      typeof value.turnId === "string" &&
      typeof value.jobId === "string" &&
      typeof value.state === "string",
    "conversation receipt should include exact operation references"
  )
}
