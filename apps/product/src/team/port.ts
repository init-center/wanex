import type {
  TeamAvailability,
  TeamConversationListReadModel,
  TeamConversationPageReadModel,
  TeamConversationSummary,
  TeamParticipantReadModel,
  TeamParticipantState,
  TeamRoundReceipt,
  TeamPortInvalidation
} from "./model.js"

export interface TeamConversationPort {
  readAvailability(): TeamAvailability
  listConversations(
    request: ListTeamConversationsRequest
  ): Promise<TeamConversationListReadModel>
  readConversationPage(
    request: ReadTeamConversationPageRequest
  ): Promise<TeamConversationPageReadModel | null>
  createConversation(
    request: CreateTeamConversationRequest
  ): Promise<TeamConversationSummary>
  closeConversation(
    request: CloseTeamConversationRequest
  ): Promise<TeamConversationSummary>
  addParticipant(
    request: AddTeamParticipantRequest
  ): Promise<TeamParticipantReadModel>
  updateParticipant(
    request: UpdateTeamParticipantRequest
  ): Promise<TeamParticipantReadModel>
  setCoordinator(
    request: SetTeamCoordinatorRequest
  ): Promise<TeamConversationSummary>
  submitRound(
    request: SubmitTeamRoundRequest
  ): Promise<TeamRoundReceipt>
  subscribeInvalidations(
    listener: (event: TeamPortInvalidation) => void
  ): () => void
}

export interface TeamConversationCommands {
  readAvailability(): TeamAvailability
  listConversations(
    request?: ListTeamConversationsRequest
  ): Promise<TeamConversationListReadModel>
  readConversation(request?: {
    readonly conversationId?: string
    readonly cursor?: string
    readonly limit?: number
  }): Promise<import("./model.js").ReadTeamConversationResult>
  selectConversation(request: {
    readonly conversationId: string
  }): Promise<TeamConversationSummary>
  createConversation(
    request: CreateTeamConversationRequest
  ): Promise<TeamConversationSummary>
  closeConversation(
    request: CloseTeamConversationRequest
  ): Promise<TeamConversationSummary>
  addParticipant(
    request: AddTeamParticipantRequest
  ): Promise<TeamParticipantReadModel>
  updateParticipant(
    request: UpdateTeamParticipantRequest
  ): Promise<TeamParticipantReadModel>
  setCoordinator(
    request: SetTeamCoordinatorRequest
  ): Promise<TeamConversationSummary>
  submitRound(
    request: SubmitTeamRoundRequest
  ): Promise<TeamRoundReceipt>
}

export interface ListTeamConversationsRequest {
  readonly state?: "open" | "closed"
  readonly limit?: number
}

export interface ReadTeamConversationPageRequest {
  readonly conversationId: string
  readonly cursor?: string
  readonly limit: number
}

export interface CreateTeamConversationRequest {
  readonly mode: "discussion" | "coordinated"
  readonly title?: string
  readonly idempotencyKey: string
}

export interface CloseTeamConversationRequest {
  readonly conversationId: string
}

export interface AddTeamParticipantRequest {
  readonly conversationId: string
  readonly agentSessionId: string
  readonly displayName?: string
  readonly role?: string
  readonly idempotencyKey: string
}

export interface UpdateTeamParticipantRequest {
  readonly conversationId: string
  readonly participantId: string
  readonly state: TeamParticipantState
}

export interface SetTeamCoordinatorRequest {
  readonly conversationId: string
  readonly expectedCoordinatorParticipantId: string | null
  readonly coordinatorParticipantId: string | null
}

export interface SubmitTeamRoundRequest {
  readonly conversationId: string
  readonly text: string
  readonly idempotencyKey: string
}
