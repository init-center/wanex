import type { TeamTurnRecord } from "@wanex/protocol"
import type { TeamConversationStorage } from "./storage.js"
import type {
  AppendTeamMessageRequest,
  ListTeamTurnsRequest
} from "./types.js"

export async function appendTurn(
  storage: TeamConversationStorage,
  request: AppendTeamMessageRequest
): Promise<TeamTurnRecord> {
  return await storage.appendTeamTurn({
    ...(request.id === undefined ? {} : { id: request.id }),
    conversationId: request.conversationId,
    speakerParticipantId: request.speakerParticipantId,
    ...(request.audienceParticipantIds === undefined
      ? {}
      : { audienceParticipantIds: request.audienceParticipantIds }),
    ...(request.kind === undefined ? {} : { kind: request.kind }),
    content: request.content,
    ...(request.metadata === undefined ? {} : { metadata: request.metadata })
  })
}

export async function listTurns(
  storage: TeamConversationStorage,
  conversationId: string,
  request: ListTeamTurnsRequest = {}
): Promise<TeamTurnRecord[]> {
  return await storage.listTeamTurns({
    conversationId,
    ...(request.afterCreatedAt === undefined
      ? {}
      : { afterCreatedAt: request.afterCreatedAt }),
    ...(request.afterTurnId === undefined
      ? {}
      : { afterTurnId: request.afterTurnId }),
    ...(request.limit === undefined ? {} : { limit: request.limit })
  })
}
