import type {
  AdmitTeamMessageRequest,
  FailTeamDeliveryMaterializationReceipt,
  FailTeamDeliveryMaterializationRequest,
  GetTeamDelegationOperationByToolExecutionRequest,
  GetTeamDelegationOperationRequest,
  ListTeamConversationsRequest,
  ListTeamDeliveriesRequest,
  ListTeamDiscussionRoundsRequest,
  ListTeamDelegationTasksRequest,
  ListTeamMessagesRequest,
  ListTeamParticipantsRequest,
  ListTeamRoutingDecisionsRequest,
  MaterializeTeamDeliveryReceipt,
  MaterializeTeamDeliveryRequest,
  ProjectTeamDeliveryOutcomeReceipt,
  ProjectTeamDeliveryOutcomeRequest,
  PutTeamConversationRequest,
  PutTeamParticipantRequest,
  ReadTeamConversationPageRequest,
  RouteTeamMessageReceipt,
  RouteTeamMessageRequest,
  SetTeamConversationLeadRequest,
  TeamConversationRecord,
  TeamConversationPage,
  TeamDeliveryRecord,
  TeamDeliveryMaterializationContext,
  TeamDelegationOperationRecord,
  TeamDelegationTaskRecord,
  TeamDiscussionRoundRecord,
  TeamMessageRecord,
  TeamParticipantRecord,
  TeamRoutingDecisionRecord,
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
  setTeamConversationLead(
    request: SetTeamConversationLeadRequest
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
  admitTeamMessage(request: AdmitTeamMessageRequest): Promise<TeamMessageRecord>
  getTeamMessage(messageId: string): Promise<TeamMessageRecord | null>
  listTeamMessages(request: ListTeamMessagesRequest): Promise<TeamMessageRecord[]>
  routeTeamMessage(request: RouteTeamMessageRequest): Promise<RouteTeamMessageReceipt>
  getTeamRoutingDecisionByMessage(
    messageId: string
  ): Promise<TeamRoutingDecisionRecord | null>
  listTeamRoutingDecisions(
    request: ListTeamRoutingDecisionsRequest
  ): Promise<TeamRoutingDecisionRecord[]>
  listTeamDeliveries(
    request: ListTeamDeliveriesRequest
  ): Promise<TeamDeliveryRecord[]>
  getTeamDiscussionRound(roundId: string): Promise<TeamDiscussionRoundRecord | null>
  getTeamDelegationOperation(
    request: GetTeamDelegationOperationRequest
  ): Promise<TeamDelegationOperationRecord | null>
  getTeamDelegationOperationByToolExecution(
    request: GetTeamDelegationOperationByToolExecutionRequest
  ): Promise<TeamDelegationOperationRecord | null>
  listTeamDelegationTasks(
    request: ListTeamDelegationTasksRequest
  ): Promise<TeamDelegationTaskRecord[]>
  listTeamDiscussionRounds(
    request: ListTeamDiscussionRoundsRequest
  ): Promise<TeamDiscussionRoundRecord[]>
  readTeamConversationPage(
    request: ReadTeamConversationPageRequest
  ): Promise<TeamConversationPage | null>
  getTeamDeliveryMaterializationContext(
    deliveryId: string
  ): Promise<TeamDeliveryMaterializationContext | null>
  materializeTeamDelivery(
    request: MaterializeTeamDeliveryRequest
  ): Promise<MaterializeTeamDeliveryReceipt>
  failTeamDeliveryMaterialization(
    request: FailTeamDeliveryMaterializationRequest
  ): Promise<FailTeamDeliveryMaterializationReceipt>
  projectTeamDeliveryOutcome(
    request: ProjectTeamDeliveryOutcomeRequest
  ): Promise<ProjectTeamDeliveryOutcomeReceipt>
}
