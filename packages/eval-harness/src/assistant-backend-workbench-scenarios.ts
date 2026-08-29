import {
  BACKEND_COMMAND_PORT_COMMANDS,
  createBackendShell,
  type BackendConversationOperationReceipt
} from "@wanex/assistant/backend"
import {
  createConversationSettlementFixture
} from "./assistant/conversation-helpers.js"
import { createEvalScenario } from "./runner.js"
import { assert, evalFakeModelEndpoint, isRecord } from "./scenario-utils.js"

const sessionId = "ses_eval_assistant_workbench"

export const backendWorkbenchScenario = createEvalScenario({
  id: "assistant.skeleton-workbench-contract",
  title: "App command runtime reads canonical selected-session transcripts",
  tags: ["assistant-path", "workbench", "session"],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-assistant-workbench-"
    })
    const shell = await createBackendShell({
      storage: storage.storage,
      modelEndpoint: evalFakeModelEndpoint(
        "eval-assistant-workbench",
        "eval-assistant-workbench-model"
      )
    })

    try {
      const receipt = await shell.commands.submitConversationOperation({
        content: [{ type: "text", text: "seed workbench" }],
        sessionId
      })
      await storage.settlements.waitForJob(receipt.jobId)
      const typed = await shell.commands.readAssistantWorkbench({ sessionId })
      const port = await shell.dispatch({
        command: BACKEND_COMMAND_PORT_COMMANDS.readAssistantWorkbench,
        input: { sessionId }
      })
      const submitted = await shell.dispatchJson(
        JSON.stringify({
          command: BACKEND_COMMAND_PORT_COMMANDS.submitConversationOperation,
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
      await storage.settlements.waitForJob(submitted.envelope.value.jobId)
      const refreshed = await shell.commands.readAssistantWorkbench({ sessionId })
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
      await storage.dispose()
    }
  }
})

function assertWorkbench(
  value: unknown,
  inputCount: number,
  latestUserText: string
): void {
  assert(isRecord(value), "workbench should be an object")
  assert(value.kind === "assistant.backend.workbench", "workbench kind should match")
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
    value.actions.submitCommandId === "assistant.agent.submit",
    "workbench should expose asynchronous submit action"
  )
}

function assertConversationReceipt(
  value: unknown
): asserts value is BackendConversationOperationReceipt {
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
