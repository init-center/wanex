import { WanexAgentRuntime } from "@wanex/runtime/host"
import { writeModelEndpoint } from "@wanex/runtime/provider"
import type { EvalStore } from "../eval-storage.js"
import { evalFakeModelEndpoint } from "../scenario-utils.js"
import { assistantTextFromMessages } from "./message-text.js"

export async function runSingleAgentSmoke(
  storage: EvalStore
): Promise<{
  readonly sessionId: string
  readonly assistantText: string
}> {
  await writeModelEndpoint(
    storage,
    evalFakeModelEndpoint("assistant-matrix-profile", "assistant-matrix-model")
  )
  const agent = new WanexAgentRuntime({
    storage,
    modelEndpointId: "assistant-matrix-profile"
  })
  try {
    const result = await agent.submitAndRunUserTurn({
      content: [{ type: "text", text: "assistant matrix single agent" }],
      sessionId: "ses_assistant_matrix_single_agent",
      principalId: "principal_assistant_matrix",
      inputId: "inp_assistant_matrix_single_agent",
      jobId: "job_assistant_matrix_single_agent"
    })
    return {
      sessionId: result.session.id,
      assistantText: assistantTextFromMessages(result.messages, result.turnId)
    }
  } finally {
    await agent.stop()
  }
}
