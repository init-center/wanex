import type {
  PrincipalId,
  TeamConversationRecord,
  TeamConversationState
} from "@wanex/protocol"
import type { TeamConversationStorage } from "./storage.js"
import type {
  CreateTeamConversationRequest,
  ListTeamConversationsRequest
} from "./types.js"

export async function createConversation(input: {
  readonly storage: TeamConversationStorage
  readonly request: CreateTeamConversationRequest
  readonly defaultPrincipalId: PrincipalId
}): Promise<TeamConversationRecord> {
  return await input.storage.putTeamConversation({
    ...(input.request.id === undefined ? {} : { id: input.request.id }),
    principalId: input.request.principalId ?? input.defaultPrincipalId,
    ...(input.request.title === undefined ? {} : { title: input.request.title }),
    ...(input.request.mode === undefined ? {} : { mode: input.request.mode }),
    ...(input.request.metadata === undefined
      ? {}
      : { metadata: input.request.metadata }),
    ...(input.request.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: input.request.idempotencyKey })
  })
}

export async function getConversation(
  storage: TeamConversationStorage,
  conversationId: string
): Promise<TeamConversationRecord | null> {
  return await storage.getTeamConversation(conversationId)
}

export async function listConversations(
  storage: TeamConversationStorage,
  request: ListTeamConversationsRequest = {}
): Promise<TeamConversationRecord[]> {
  return await storage.listTeamConversations({
    ...(request.principalId === undefined
      ? {}
      : { principalId: request.principalId }),
    ...(request.state === undefined ? {} : { state: request.state }),
    ...(request.mode === undefined ? {} : { mode: request.mode }),
    ...(request.limit === undefined ? {} : { limit: request.limit })
  })
}

export async function updateConversationState(
  storage: TeamConversationStorage,
  conversationId: string,
  state: TeamConversationState
): Promise<TeamConversationRecord> {
  return await storage.updateTeamConversationState({
    conversationId,
    state
  })
}

export async function requireConversation(
  storage: TeamConversationStorage,
  conversationId: string
): Promise<TeamConversationRecord> {
  const conversation = await getConversation(storage, conversationId)
  if (conversation === null) {
    throw new Error(`team conversation not found: ${conversationId}`)
  }
  return conversation
}
