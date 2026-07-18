import { WanexAgentRuntime } from "@wanex/runtime/host"
import { writeProviderProfile } from "@wanex/runtime/provider"
import type { EvalStore } from "../eval-storage.js"
import { textFromMessages } from "./message-text.js"

export async function runSingleAgentSmoke(
  storage: EvalStore
): Promise<{
  readonly sessionId: string
  readonly assistantText: string
}> {
  await writeProviderProfile(storage, {
    id: "product-matrix-profile",
    kind: "fake",
    providerId: "fake",
    modelId: "product-matrix-model"
  })
  const agent = new WanexAgentRuntime({
    storage,
    providerProfileId: "product-matrix-profile"
  })
  try {
    const result = await agent.submitAndRunUserText({
      text: "product matrix single agent",
      sessionId: "ses_product_matrix_single_agent",
      principalId: "principal_product_matrix",
      inputId: "inp_product_matrix_single_agent",
      jobId: "job_product_matrix_single_agent"
    })
    return {
      sessionId: result.session.id,
      assistantText: textFromMessages(result.messages)
    }
  } finally {
    await agent.stop()
  }
}
