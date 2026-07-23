import type { ContextCompiler } from "../../context/memory/index.js"
import type { ProviderReplayMessage } from "../../provider/index.js"
import type { WanexSessionCore } from "../../sessions/index.js"

export interface BuildSessionReplayMessagesRequest {
  readonly session: WanexSessionCore
  readonly sessionId: string
  readonly contextCompiler?: ContextCompiler
}

export async function buildSessionReplayMessages(
  request: BuildSessionReplayMessagesRequest
): Promise<ProviderReplayMessage[]> {
  const messages = await request.session.listMessages({
    sessionId: request.sessionId
  })
  if (request.contextCompiler !== undefined) {
    const compiled = await request.contextCompiler.compile({
      sessionId: request.sessionId,
      inputs: [],
      messages
    })
    return [...compiled.messages]
  }
  return messages.map((message) => ({
    role: message.role,
    content: message.content
  }))
}
