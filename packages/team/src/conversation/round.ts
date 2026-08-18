import type {
  ListTeamDiscussionRoundsRequest,
  TeamDiscussionRoundRecord
} from "@wanex/protocol"
import type { TeamConversationStorage } from "./storage.js"

export async function getDiscussionRound(
  storage: TeamConversationStorage,
  roundId: string
): Promise<TeamDiscussionRoundRecord | null> {
  return await storage.getTeamDiscussionRound(roundId)
}

export async function listDiscussionRounds(
  storage: TeamConversationStorage,
  request: ListTeamDiscussionRoundsRequest
): Promise<TeamDiscussionRoundRecord[]> {
  return await storage.listTeamDiscussionRounds(request)
}
