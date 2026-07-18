import type {
  PrincipalId,
  TeamConversationRecord,
  TeamConversationState,
  TeamParticipantRecord,
  TeamParticipantState,
  TeamTurnRecord
} from "@wanex/protocol"
import {
  createConversation,
  getConversation,
  listConversations,
  updateConversationState
} from "./conversation.js"
import {
  addParticipant,
  listParticipants,
  updateParticipantState
} from "./participant.js"
import { orchestrateRound } from "./orchestrator.js"
import type { TeamConversationRuntimeStorage } from "./storage.js"
import { appendTurn, listTurns } from "./turn.js"
import type {
  AddTeamParticipantRequest,
  AppendTeamMessageRequest,
  CreateTeamConversationRequest,
  ListTeamConversationsRequest,
  ListTeamTurnsRequest,
  OrchestrateTeamRoundRequest,
  TeamRoundResult,
  TeamConversationRuntimeOptions
} from "./types.js"

export const WANEX_TEAM_CONVERSATION =
  "wanex-team-conversation" as const

const DEFAULT_PRINCIPAL_ID = "team-conversation"

export class TeamConversationRuntime {
  private readonly storage: TeamConversationRuntimeStorage
  private readonly principalId: PrincipalId

  constructor(options: TeamConversationRuntimeOptions) {
    this.storage = options.storage
    this.principalId = options.principalId ?? DEFAULT_PRINCIPAL_ID
  }

  async createConversation(
    request: CreateTeamConversationRequest = {}
  ): Promise<TeamConversationRecord> {
    return await createConversation({
      storage: this.storage,
      request,
      defaultPrincipalId: this.principalId
    })
  }

  async getConversation(
    conversationId: string
  ): Promise<TeamConversationRecord | null> {
    return await getConversation(this.storage, conversationId)
  }

  async listConversations(
    request: ListTeamConversationsRequest = {}
  ): Promise<TeamConversationRecord[]> {
    return await listConversations(this.storage, request)
  }

  async updateConversationState(
    conversationId: string,
    state: TeamConversationState
  ): Promise<TeamConversationRecord> {
    return await updateConversationState(this.storage, conversationId, state)
  }

  async addParticipant(
    request: AddTeamParticipantRequest
  ): Promise<TeamParticipantRecord> {
    return await addParticipant(this.storage, request)
  }

  async listParticipants(
    conversationId: string,
    state?: TeamParticipantState
  ): Promise<TeamParticipantRecord[]> {
    return await listParticipants(this.storage, conversationId, state)
  }

  async updateParticipantState(
    participantId: string,
    state: TeamParticipantState
  ): Promise<TeamParticipantRecord> {
    return await updateParticipantState(this.storage, participantId, state)
  }

  async appendTurn(request: AppendTeamMessageRequest): Promise<TeamTurnRecord> {
    return await appendTurn(this.storage, request)
  }

  async listTurns(
    conversationId: string,
    request: ListTeamTurnsRequest = {}
  ): Promise<TeamTurnRecord[]> {
    return await listTurns(this.storage, conversationId, request)
  }

  async orchestrateRound(
    request: OrchestrateTeamRoundRequest
  ): Promise<TeamRoundResult> {
    return await orchestrateRound(this.storage, request)
  }
}
