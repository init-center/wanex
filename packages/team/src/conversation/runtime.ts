import type {
  AdmitTeamMessageRequest,
  FailTeamDeliveryMaterializationReceipt,
  FailTeamDeliveryMaterializationRequest,
  ListTeamDeliveriesRequest,
  ListTeamDiscussionRoundsRequest,
  ListTeamMessagesRequest,
  ListTeamRoutingDecisionsRequest,
  MaterializeTeamDeliveryReceipt,
  MaterializeTeamDeliveryRequest,
  ProjectTeamDeliveryOutcomeReceipt,
  ProjectTeamDeliveryOutcomeRequest,
  ReadTeamConversationPageRequest,
  PrincipalId,
  RouteTeamMessageReceipt,
  RouteTeamMessageRequest,
  SetTeamConversationLeadRequest,
  TeamConversationRecord,
  TeamConversationPage,
  TeamConversationState,
  TeamDeliveryRecord,
  TeamDeliveryMaterializationContext,
  TeamDiscussionRoundRecord,
  TeamMessageRecord,
  TeamParticipantRecord,
  TeamParticipantState,
  TeamRoutingDecisionRecord
} from "@wanex/protocol"
import {
  createConversation,
  getConversation,
  listConversations,
  setConversationLead,
  updateConversationState
} from "./conversation.js"
import {
  readConversationPage,
  submitOrchestratedMessage,
  submitRoutedMessage
} from "./application.js"
import {
  addParticipant,
  listParticipants,
  updateParticipantState
} from "./participant.js"
import { getDiscussionRound, listDiscussionRounds } from "./round.js"
import {
  admitMessage,
  failDeliveryMaterialization,
  getDeliveryMaterializationContext,
  getMessage,
  getRoutingDecisionByMessage,
  listDeliveries,
  listMessages,
  listRoutingDecisions,
  materializeDelivery,
  projectDeliveryOutcome,
  routeMessage
} from "./message.js"
import type { TeamConversationRuntimeStorage } from "./storage.js"
import type {
  AddTeamParticipantRequest,
  CreateTeamConversationRequest,
  ListTeamConversationsRequest,
  SubmitOrchestratedTeamMessageRequest,
  SubmitRoutedTeamMessageRequest,
  TeamConversationRuntimeOptions
} from "./types.js"

export const WANEX_TEAM_CONVERSATION =
  "wanex-team-conversation" as const

const DEFAULT_PRINCIPAL_ID = "team-conversation"

export class TeamConversationRuntime {
  private readonly storage: TeamConversationRuntimeStorage
  private readonly principalId: PrincipalId
  private readonly notifyWorkAvailable: (() => void) | undefined

  constructor(options: TeamConversationRuntimeOptions) {
    this.storage = options.storage
    this.principalId = options.principalId ?? DEFAULT_PRINCIPAL_ID
    this.notifyWorkAvailable = options.notifyWorkAvailable
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

  async submitRoutedMessage(
    request: SubmitRoutedTeamMessageRequest
  ): Promise<RouteTeamMessageReceipt> {
    const receipt = await submitRoutedMessage(this.storage, request)
    this.notifyAfterDurableRoute(receipt)
    return receipt
  }

  async submitOrchestratedMessage(
    request: SubmitOrchestratedTeamMessageRequest
  ): Promise<RouteTeamMessageReceipt> {
    const receipt = await submitOrchestratedMessage(this.storage, request)
    this.notifyAfterDurableRoute(receipt)
    return receipt
  }

  async readConversationPage(
    request: ReadTeamConversationPageRequest
  ): Promise<TeamConversationPage | null> {
    return await readConversationPage(this.storage, request)
  }

  async updateConversationState(
    conversationId: string,
    state: TeamConversationState
  ): Promise<TeamConversationRecord> {
    return await updateConversationState(this.storage, conversationId, state)
  }

  async setConversationLead(
    request: SetTeamConversationLeadRequest
  ): Promise<TeamConversationRecord> {
    return await setConversationLead(this.storage, request)
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

  async admitMessage(request: AdmitTeamMessageRequest): Promise<TeamMessageRecord> {
    return await admitMessage(this.storage, request)
  }

  async getMessage(messageId: string): Promise<TeamMessageRecord | null> {
    return await getMessage(this.storage, messageId)
  }

  async listMessages(request: ListTeamMessagesRequest): Promise<TeamMessageRecord[]> {
    return await listMessages(this.storage, request)
  }

  async routeMessage(
    request: RouteTeamMessageRequest
  ): Promise<RouteTeamMessageReceipt> {
    const receipt = await routeMessage(this.storage, request)
    this.notifyAfterDurableRoute(receipt)
    return receipt
  }

  async getRoutingDecisionByMessage(
    messageId: string
  ): Promise<TeamRoutingDecisionRecord | null> {
    return await getRoutingDecisionByMessage(this.storage, messageId)
  }

  async listRoutingDecisions(
    request: ListTeamRoutingDecisionsRequest
  ): Promise<TeamRoutingDecisionRecord[]> {
    return await listRoutingDecisions(this.storage, request)
  }

  async listDeliveries(
    request: ListTeamDeliveriesRequest
  ): Promise<TeamDeliveryRecord[]> {
    return await listDeliveries(this.storage, request)
  }

  async getDiscussionRound(
    roundId: string
  ): Promise<TeamDiscussionRoundRecord | null> {
    return await getDiscussionRound(this.storage, roundId)
  }

  async listDiscussionRounds(
    request: ListTeamDiscussionRoundsRequest
  ): Promise<TeamDiscussionRoundRecord[]> {
    return await listDiscussionRounds(this.storage, request)
  }

  async getDeliveryMaterializationContext(
    deliveryId: string
  ): Promise<TeamDeliveryMaterializationContext | null> {
    return await getDeliveryMaterializationContext(this.storage, deliveryId)
  }

  async materializeDelivery(
    request: MaterializeTeamDeliveryRequest
  ): Promise<MaterializeTeamDeliveryReceipt> {
    return await materializeDelivery(this.storage, request)
  }

  async failDeliveryMaterialization(
    request: FailTeamDeliveryMaterializationRequest
  ): Promise<FailTeamDeliveryMaterializationReceipt> {
    return await failDeliveryMaterialization(this.storage, request)
  }

  async projectDeliveryOutcome(
    request: ProjectTeamDeliveryOutcomeRequest
  ): Promise<ProjectTeamDeliveryOutcomeReceipt> {
    return await projectDeliveryOutcome(this.storage, request)
  }

  private notifyAfterDurableRoute(receipt: RouteTeamMessageReceipt): void {
    if (receipt.dispatchJobs.length === 0) return
    try {
      this.notifyWorkAvailable?.()
    } catch {
      // Notification is an optimization; durable scheduler recovery is authoritative.
    }
  }
}
