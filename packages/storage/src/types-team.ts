import type {
  AppendTeamTurnRequest,
  ListTeamConversationsRequest,
  ListTeamParticipantsRequest,
  ListTeamTurnsRequest,
  PutTeamConversationRequest,
  PutTeamParticipantRequest,
  TeamConversationRecord,
  TeamParticipantRecord,
  TeamTurnRecord,
  UpdateTeamConversationStateRequest,
  UpdateTeamParticipantStateRequest
} from "@wanex/protocol"

export interface TeamStore {
  putTeamConversation(
    request: PutTeamConversationRequest
  ): Promise<TeamConversationRecord>
  getTeamConversation(
    conversationId: string
  ): Promise<TeamConversationRecord | null>
  listTeamConversations(
    request: ListTeamConversationsRequest
  ): Promise<TeamConversationRecord[]>
  updateTeamConversationState(
    request: UpdateTeamConversationStateRequest
  ): Promise<TeamConversationRecord>
  putTeamParticipant(
    request: PutTeamParticipantRequest
  ): Promise<TeamParticipantRecord>
  listTeamParticipants(
    request: ListTeamParticipantsRequest
  ): Promise<TeamParticipantRecord[]>
  updateTeamParticipantState(
    request: UpdateTeamParticipantStateRequest
  ): Promise<TeamParticipantRecord>
  appendTeamTurn(request: AppendTeamTurnRequest): Promise<TeamTurnRecord>
  listTeamTurns(request: ListTeamTurnsRequest): Promise<TeamTurnRecord[]>
}
