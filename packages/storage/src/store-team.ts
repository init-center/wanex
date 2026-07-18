import {
  type AppendTeamTurnRequest,
  type ListTeamConversationsRequest,
  type ListTeamParticipantsRequest,
  type ListTeamTurnsRequest,
  type PutTeamConversationRequest,
  type PutTeamParticipantRequest,
  type TeamConversationRecord,
  type TeamParticipantRecord,
  type TeamTurnRecord,
  type UpdateTeamConversationStateRequest,
  type UpdateTeamParticipantStateRequest
} from "@wanex/protocol"

import {
  fromRpcTeamConversationRecord,
  fromRpcTeamParticipantRecord,
  fromRpcTeamTurnRecord,
  toRpcAppendTeamTurnRequest,
  toRpcListTeamConversationsRequest,
  toRpcListTeamParticipantsRequest,
  toRpcListTeamTurnsRequest,
  toRpcPutTeamConversationRequest,
  toRpcPutTeamParticipantRequest,
  toRpcUpdateTeamConversationStateRequest,
  toRpcUpdateTeamParticipantStateRequest
} from "./codec-team.js"
import { assertArray } from "./codec-helpers.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"
import type { TeamStorageRpcCommand } from "./generated/storage-rpc.js"

export class TeamStoreMethods extends RpcStoreFacetBase {
  async putTeamConversation(
    request: PutTeamConversationRequest
  ): Promise<TeamConversationRecord> {
    const value = await this.callTeam({
      command: "put-team-conversation",
      request: toRpcPutTeamConversationRequest(request)
    })
    return fromRpcTeamConversationRecord(value)
  }

  async getTeamConversation(
    conversationId: string
  ): Promise<TeamConversationRecord | null> {
    const value = await this.callTeam({
      command: "get-team-conversation",
      conversation_id: conversationId
    })
    return value === null ? null : fromRpcTeamConversationRecord(value)
  }

  async listTeamConversations(
    request: ListTeamConversationsRequest
  ): Promise<TeamConversationRecord[]> {
    const value = await this.callTeam({
      command: "list-team-conversations",
      request: toRpcListTeamConversationsRequest(request)
    })
    assertArray(value, "team conversations")
    return value.map(fromRpcTeamConversationRecord)
  }

  async updateTeamConversationState(
    request: UpdateTeamConversationStateRequest
  ): Promise<TeamConversationRecord> {
    const value = await this.callTeam({
      command: "update-team-conversation-state",
      request: toRpcUpdateTeamConversationStateRequest(request)
    })
    return fromRpcTeamConversationRecord(value)
  }

  async putTeamParticipant(
    request: PutTeamParticipantRequest
  ): Promise<TeamParticipantRecord> {
    const value = await this.callTeam({
      command: "put-team-participant",
      request: toRpcPutTeamParticipantRequest(request)
    })
    return fromRpcTeamParticipantRecord(value)
  }

  async listTeamParticipants(
    request: ListTeamParticipantsRequest
  ): Promise<TeamParticipantRecord[]> {
    const value = await this.callTeam({
      command: "list-team-participants",
      request: toRpcListTeamParticipantsRequest(request)
    })
    assertArray(value, "team participants")
    return value.map(fromRpcTeamParticipantRecord)
  }

  async updateTeamParticipantState(
    request: UpdateTeamParticipantStateRequest
  ): Promise<TeamParticipantRecord> {
    const value = await this.callTeam({
      command: "update-team-participant-state",
      request: toRpcUpdateTeamParticipantStateRequest(request)
    })
    return fromRpcTeamParticipantRecord(value)
  }

  async appendTeamTurn(request: AppendTeamTurnRequest): Promise<TeamTurnRecord> {
    const value = await this.callTeam({
      command: "append-team-turn",
      request: toRpcAppendTeamTurnRequest(request)
    })
    return fromRpcTeamTurnRecord(value)
  }

  async listTeamTurns(
    request: ListTeamTurnsRequest
  ): Promise<TeamTurnRecord[]> {
    const value = await this.callTeam({
      command: "list-team-turns",
      request: toRpcListTeamTurnsRequest(request)
    })
    assertArray(value, "team turns")
    return value.map(fromRpcTeamTurnRecord)
  }

  private callTeam(request: TeamStorageRpcCommand) {
    return this.call(request)
  }
}
