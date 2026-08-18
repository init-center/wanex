import type { ContextCompiler } from "../../context/memory/index.js"
import type { ProviderReplayMessage } from "../../provider/index.js"
import type { WanexSessionCore } from "../../sessions/index.js"
import type { SessionMessageRecord } from "@wanex/protocol"

export interface BuildSessionReplayMessagesRequest {
  readonly session: WanexSessionCore
  readonly sessionId: string
  readonly contextCompiler?: ContextCompiler
  readonly messages?: readonly SessionMessageRecord[]
}

export async function buildSessionReplayMessages(
  request: BuildSessionReplayMessagesRequest
): Promise<ProviderReplayMessage[]> {
  const messages =
    request.messages ??
    (await request.session.listMessages({
      sessionId: request.sessionId
    }))
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
