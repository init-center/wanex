import type { BackendShell } from "@wanex/assistant/backend"
import type { TeamConversationCommands } from "../team/port.js"
import {
  copyState,
  selectedSessionId,
  type StateCoordinator
} from "./assistant.js"

export async function reconcileConversationSelection(options: {
  readonly backend: BackendShell
  readonly state: StateCoordinator
  readonly teams: TeamConversationCommands
}): Promise<void> {
  if (options.state.state.selection?.kind === "team") {
    const selected = await options.teams.readConversation({
      conversationId: options.state.state.selection.conversationId,
      limit: 1
    })
    if (
      selected.kind === "assistant.team-conversation.found" &&
      selected.page.conversation.state === "open"
    ) {
      return
    }
    await clearSelection(options.state)
    return
  }

  const sessionId = selectedSessionId(options.state.state)
  if (sessionId === undefined) return
  const session = await options.backend.commands.readSession({ sessionId })
  if (
    session.kind === "wanex-app.session.found" &&
    session.session.status === "active"
  ) {
    return
  }
  await clearSelection(options.state)
}

async function clearSelection(state: StateCoordinator): Promise<void> {
  await state.mutate(async (current) => {
    const next = copyState(current)
    delete next.selection
    delete next.selectedPlanProposalId
    next.mode = "chat"
    return { value: undefined, next }
  })
}
