import type {
  ConversationSelection,
  StateSnapshot
} from "@wanex/assistant"

export function sessionIdFromSelection(
  selection: ConversationSelection | undefined
): string | undefined {
  return selection?.kind === "session" ? selection.sessionId : undefined
}

export function teamConversationIdFromSelection(
  selection: ConversationSelection | undefined
): string | undefined {
  return selection?.kind === "team" ? selection.conversationId : undefined
}

export function selectedSessionId(
  state: StateSnapshot | undefined
): string | undefined {
  return sessionIdFromSelection(state?.selection)
}
