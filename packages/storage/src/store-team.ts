import {
  type AdmitTeamMessageRequest,
  type FailTeamDeliveryMaterializationReceipt,
  type FailTeamDeliveryMaterializationRequest,
  type GetTeamDelegationOperationByToolExecutionRequest,
  type GetTeamDelegationOperationRequest,
  type ListTeamConversationsRequest,
  type ListTeamDeliveriesRequest,
  type ListTeamDiscussionRoundsRequest,
  type ListTeamDelegationTasksRequest,
  type ListTeamMessagesRequest,
  type ListTeamParticipantsRequest,
  type ListTeamRoutingDecisionsRequest,
  type MaterializeTeamDeliveryReceipt,
  type MaterializeTeamDeliveryRequest,
  type ProjectTeamDeliveryOutcomeReceipt,
  type ProjectTeamDeliveryOutcomeRequest,
  type PutTeamConversationRequest,
  type PutTeamParticipantRequest,
  type ReadTeamConversationPageRequest,
  type RouteTeamMessageReceipt,
  type RouteTeamMessageRequest,
  type SetTeamConversationLeadRequest,
  type TeamConversationRecord,
  type TeamConversationPage,
  type TeamDeliveryRecord,
  type TeamDeliveryMaterializationContext,
  type TeamDelegationOperationRecord,
  type TeamDelegationTaskRecord,
  type TeamDiscussionRoundRecord,
  type TeamMessageRecord,
  type TeamParticipantRecord,
  type TeamRoutingDecisionRecord,
  type UpdateTeamConversationStateRequest,
  type UpdateTeamParticipantStateRequest
} from "@wanex/protocol"

import {
  fromRpcTeamConversationRecord,
  fromRpcTeamDeliveryRecord,
  fromRpcTeamDeliveryMaterializationContext,
  fromRpcFailTeamDeliveryMaterializationReceipt,
  fromRpcMaterializeTeamDeliveryReceipt,
  fromRpcProjectTeamDeliveryOutcomeReceipt,
  fromRpcTeamMessageRecord,
  fromRpcTeamParticipantRecord,
  fromRpcTeamRoutingDecisionRecord,
  fromRpcRouteTeamMessageReceipt,
  toRpcAdmitTeamMessageRequest,
  toRpcFailTeamDeliveryMaterializationRequest,
  toRpcListTeamConversationsRequest,
  toRpcListTeamDeliveriesRequest,
  toRpcListTeamMessagesRequest,
  toRpcListTeamParticipantsRequest,
  toRpcListTeamRoutingDecisionsRequest,
  toRpcMaterializeTeamDeliveryRequest,
  toRpcProjectTeamDeliveryOutcomeRequest,
  toRpcPutTeamConversationRequest,
  toRpcPutTeamParticipantRequest,
  toRpcRouteTeamMessageRequest,
  toRpcSetTeamConversationLeadRequest,
  toRpcUpdateTeamConversationStateRequest,
  toRpcUpdateTeamParticipantStateRequest
} from "./codec-team.js"
import {
  fromRpcTeamDiscussionRoundRecord,
  toRpcListTeamDiscussionRoundsRequest
} from "./codec-team-round.js"
import {
  fromRpcTeamConversationPage,
  toRpcReadTeamConversationPageRequest
} from "./codec-team-page.js"
import { assertArray } from "./codec-helpers.js"
import {
  fromRpcTeamDelegationOperationRecord,
  fromRpcTeamDelegationTaskRecord
} from "./codec-deferred-team.js"
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

  async setTeamConversationLead(
    request: SetTeamConversationLeadRequest
  ): Promise<TeamConversationRecord> {
    const value = await this.callTeam({
      command: "set-team-conversation-lead",
      request: toRpcSetTeamConversationLeadRequest(request)
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

  async admitTeamMessage(
    request: AdmitTeamMessageRequest
  ): Promise<TeamMessageRecord> {
    const value = await this.callTeam({
      command: "admit-team-message",
      request: toRpcAdmitTeamMessageRequest(request)
    })
    return fromRpcTeamMessageRecord(value)
  }

  async getTeamMessage(messageId: string): Promise<TeamMessageRecord | null> {
    const value = await this.callTeam({
      command: "get-team-message",
      message_id: messageId
    })
    return value === null ? null : fromRpcTeamMessageRecord(value)
  }

  async listTeamMessages(
    request: ListTeamMessagesRequest
  ): Promise<TeamMessageRecord[]> {
    const value = await this.callTeam({
      command: "list-team-messages",
      request: toRpcListTeamMessagesRequest(request)
    })
    assertArray(value, "team messages")
    return value.map(fromRpcTeamMessageRecord)
  }

  async routeTeamMessage(
    request: RouteTeamMessageRequest
  ): Promise<RouteTeamMessageReceipt> {
    const value = await this.callTeam({
      command: "route-team-message",
      request: toRpcRouteTeamMessageRequest(request)
    })
    return fromRpcRouteTeamMessageReceipt(value)
  }

  async getTeamRoutingDecisionByMessage(
    messageId: string
  ): Promise<TeamRoutingDecisionRecord | null> {
    const value = await this.callTeam({
      command: "get-team-routing-decision-by-message",
      message_id: messageId
    })
    return value === null ? null : fromRpcTeamRoutingDecisionRecord(value)
  }

  async listTeamRoutingDecisions(
    request: ListTeamRoutingDecisionsRequest
  ): Promise<TeamRoutingDecisionRecord[]> {
    const value = await this.callTeam({
      command: "list-team-routing-decisions",
      request: toRpcListTeamRoutingDecisionsRequest(request)
    })
    assertArray(value, "team routing decisions")
    return value.map(fromRpcTeamRoutingDecisionRecord)
  }

  async listTeamDeliveries(
    request: ListTeamDeliveriesRequest
  ): Promise<TeamDeliveryRecord[]> {
    const value = await this.callTeam({
      command: "list-team-deliveries",
      request: toRpcListTeamDeliveriesRequest(request)
    })
    assertArray(value, "team deliveries")
    return value.map(fromRpcTeamDeliveryRecord)
  }

  async getTeamDiscussionRound(
    roundId: string
  ): Promise<TeamDiscussionRoundRecord | null> {
    const value = await this.callTeam({
      command: "get-team-discussion-round",
      round_id: roundId
    })
    return value === null ? null : fromRpcTeamDiscussionRoundRecord(value)
  }

  async getTeamDelegationOperation(
    request: GetTeamDelegationOperationRequest
  ): Promise<TeamDelegationOperationRecord | null> {
    const value = await this.callTeam({
      command: "get-team-delegation-operation",
      operation_id: request.operationId
    })
    return value === null ? null : fromRpcTeamDelegationOperationRecord(value)
  }

  async getTeamDelegationOperationByToolExecution(
    request: GetTeamDelegationOperationByToolExecutionRequest
  ): Promise<TeamDelegationOperationRecord | null> {
    const value = await this.callTeam({
      command: "get-team-delegation-operation-by-tool-execution",
      tool_execution_id: request.toolExecutionId
    })
    return value === null ? null : fromRpcTeamDelegationOperationRecord(value)
  }

  async listTeamDelegationTasks(
    request: ListTeamDelegationTasksRequest
  ): Promise<TeamDelegationTaskRecord[]> {
    const value = await this.callTeam({
      command: "list-team-delegation-tasks",
      operation_id: request.operationId
    })
    assertArray(value, "team delegation tasks")
    return value.map(fromRpcTeamDelegationTaskRecord)
  }

  async listTeamDiscussionRounds(
    request: ListTeamDiscussionRoundsRequest
  ): Promise<TeamDiscussionRoundRecord[]> {
    const value = await this.callTeam({
      command: "list-team-discussion-rounds",
      request: toRpcListTeamDiscussionRoundsRequest(request)
    })
    assertArray(value, "team discussion rounds")
    return value.map(fromRpcTeamDiscussionRoundRecord)
  }

  async readTeamConversationPage(
    request: ReadTeamConversationPageRequest
  ): Promise<TeamConversationPage | null> {
    const value = await this.callTeam({
      command: "read-team-conversation-page",
      request: toRpcReadTeamConversationPageRequest(request)
    })
    return value === null ? null : fromRpcTeamConversationPage(value)
  }

  async getTeamDeliveryMaterializationContext(
    deliveryId: string
  ): Promise<TeamDeliveryMaterializationContext | null> {
    const value = await this.callTeam({
      command: "get-team-delivery-materialization-context",
      delivery_id: deliveryId
    })
    return value === null ? null : fromRpcTeamDeliveryMaterializationContext(value)
  }

  async materializeTeamDelivery(
    request: MaterializeTeamDeliveryRequest
  ): Promise<MaterializeTeamDeliveryReceipt> {
    const value = await this.callTeam({
      command: "materialize-team-delivery",
      request: toRpcMaterializeTeamDeliveryRequest(request)
    })
    return fromRpcMaterializeTeamDeliveryReceipt(value)
  }

  async failTeamDeliveryMaterialization(
    request: FailTeamDeliveryMaterializationRequest
  ): Promise<FailTeamDeliveryMaterializationReceipt> {
    const value = await this.callTeam({
      command: "fail-team-delivery-materialization",
      request: toRpcFailTeamDeliveryMaterializationRequest(request)
    })
    return fromRpcFailTeamDeliveryMaterializationReceipt(value)
  }

  async projectTeamDeliveryOutcome(
    request: ProjectTeamDeliveryOutcomeRequest
  ): Promise<ProjectTeamDeliveryOutcomeReceipt> {
    const value = await this.callTeam({
      command: "project-team-delivery-outcome",
      request: toRpcProjectTeamDeliveryOutcomeRequest(request)
    })
    return fromRpcProjectTeamDeliveryOutcomeReceipt(value)
  }

  private callTeam(request: TeamStorageRpcCommand) {
    return this.call(request)
  }
}
