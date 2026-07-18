import type { ContextCompiler } from "../../context/memory/index.js"
import type { ProviderReplayMessage } from "../../provider/index.js"
import type { SessionId } from "@wanex/protocol"
import type { WanexSessionCore } from "../../sessions/index.js"
import { inputToReplayMessage } from "./replay.js"

export interface BuildSessionReplayMessagesRequest {
  readonly session: WanexSessionCore
  readonly sessionId: SessionId
  readonly contextCompiler?: ContextCompiler
}

export async function buildSessionReplayMessages(
  request: BuildSessionReplayMessagesRequest
): Promise<ProviderReplayMessage[]> {
  const [inputs, messages] = await Promise.all([
    request.session.listInputs({ sessionId: request.sessionId }),
    request.session.listMessages({ sessionId: request.sessionId })
  ])
  const replayInputs = inputs.filter(
    (input) => input.status !== "control_pending"
  )

  if (request.contextCompiler !== undefined) {
    const compiled = await request.contextCompiler.compile({
      sessionId: request.sessionId,
      inputs: replayInputs,
      messages
    })
    return [...compiled.messages]
  }

  const replay: ProviderReplayMessage[] = []
  for (const input of replayInputs) {
    replay.push(inputToReplayMessage(input))
  }
  for (const message of messages) {
    replay.push({
      role: message.role,
      content: message.content
    })
  }
  return replay
}
