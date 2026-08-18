import type {
  TeamParticipantRecord,
  TeamParticipantState
} from "@wanex/protocol"
import type { TeamConversationStorage } from "./storage.js"
import type { AddTeamParticipantRequest } from "./types.js"

export async function addParticipant(
  storage: TeamConversationStorage,
  request: AddTeamParticipantRequest
): Promise<TeamParticipantRecord> {
  return await storage.putTeamParticipant({
    ...(request.id === undefined ? {} : { id: request.id }),
    conversationId: request.conversationId,
    principalId: request.principalId,
    kind: request.kind,
    ...(request.displayName === undefined
      ? {}
      : { displayName: request.displayName }),
    ...(request.role === undefined ? {} : { role: request.role }),
    ...(request.agentSessionId === undefined
      ? {}
      : { agentSessionId: request.agentSessionId }),
    ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
    ...(request.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: request.idempotencyKey })
  })
}

export async function listParticipants(
  storage: TeamConversationStorage,
  conversationId: string,
  state?: TeamParticipantState
): Promise<TeamParticipantRecord[]> {
  return await storage.listTeamParticipants({
    conversationId,
    ...(state === undefined ? {} : { state })
  })
}

export async function updateParticipantState(
  storage: TeamConversationStorage,
  participantId: string,
  state: TeamParticipantState
): Promise<TeamParticipantRecord> {
  return await storage.updateTeamParticipantState({
    participantId,
    state
  })
}
