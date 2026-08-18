import { createHash } from "node:crypto"
import type {
  TeamConversationRecord,
  TeamDeliveryRecord,
  TeamDiscussionRoundRecord,
  TeamMessageRecord,
  TeamParticipantRecord,
  TeamTarget
} from "@wanex/protocol"
import type { TeamConversationRuntime } from "@wanex/team/conversation"
import {
  projectDelivery,
  projectMessage,
  projectParticipant,
  projectRound,
  projectTeamConversationPage,
  projectTeamConversationSummary,
  type AddTeamParticipantRequest,
  type CreateTeamConversationRequest,
  type SetTeamCoordinatorRequest,
  type SubmitTeamRoundRequest,
  type TeamConversationPort,
  type TeamRoundReceipt,
  type TeamPortInvalidation,
  type UpdateTeamParticipantRequest
} from "@wanex/product/team"
import {
  createLocalTeamInvalidationHub,
  type LocalTeamInvalidationHub
} from "./events.js"
import { decodeTeamPageCursor, encodeTeamPageCursor } from "./cursor.js"

const LOCAL_TEAM_PRINCIPAL = "local-host-team"
const LOCAL_USER_PRINCIPAL = "local-host-user"
const MAX_TEAM_PAGE_LIMIT = 50
const MAX_TEAM_LIST_LIMIT = 100

export interface LocalTeamConversationAdapter {
  readonly port: TeamConversationPort
  notify(event: TeamPortInvalidation): void
  dispose(): void
}

export function createLocalTeamConversationAdapter(options: {
  readonly runtime: TeamConversationRuntime
}): LocalTeamConversationAdapter {
  const events = createLocalTeamInvalidationHub()
  const port = createPort(options.runtime, events)
  return {
    port,
    notify: (event) => events.notify(event),
    dispose: () => events.dispose()
  }
}

function createPort(
  runtime: TeamConversationRuntime,
  events: LocalTeamInvalidationHub
): TeamConversationPort {
  return {
    readAvailability() {
      return {
        kind: "product.team-availability",
        state: "ready",
        reason: "configured",
        capabilities: {
          canList: true,
          canCreateDiscussion: true,
          canCreateCoordinated: true,
          canManageParticipants: true,
          canAssignCoordinator: true,
          canSubmitRound: true
        }
      }
    },
    async listConversations(request) {
      const conversations = await listProductConversations(runtime, request)
      return {
        kind: "product.team-conversation-list",
        availability: this.readAvailability(),
        conversations: await Promise.all(
          conversations.map(async (conversation) =>
            await projectSummary(runtime, conversation)
          )
        )
      }
    },
    async readConversationPage(request) {
      const conversation = await getProductConversation(
        runtime,
        request.conversationId
      )
      if (conversation === null) return null
      const cursor = decodeTeamPageCursor(request.cursor)
      const [page, participants] = await Promise.all([
        runtime.readConversationPage({
          conversationId: request.conversationId,
          ...(cursor === undefined
            ? {}
            : {
                beforeCreatedAt: cursor.createdAt,
                beforeMessageId: cursor.messageId
              }),
          limit: Math.min(request.limit, MAX_TEAM_PAGE_LIMIT)
        }),
        runtime.listParticipants(request.conversationId)
      ])
      if (page === null) return null
      return projectTeamConversationPage(
        { ...page, participants },
        page.nextCursor === undefined
          ? undefined
          : encodeTeamPageCursor(page.nextCursor)
      )
    },
    async createConversation(request) {
      const digest = stableDigest(request.idempotencyKey)
      const conversation = await runtime.createConversation({
        id: `team_product_${digest.slice(0, 32)}`,
        principalId: LOCAL_TEAM_PRINCIPAL,
        mode: request.mode === "discussion" ? "peer" : "orchestrated",
        ...(request.title === undefined ? {} : { title: request.title }),
        idempotencyKey: `product-team-create:${digest}`
      })
      events.notify({
        conversationId: conversation.id,
        cause: "conversation_changed",
        at: conversation.updatedAt
      })
      const user = await runtime.addParticipant({
        id: localUserParticipantId(conversation.id),
        conversationId: conversation.id,
        principalId: LOCAL_USER_PRINCIPAL,
        kind: "user",
        displayName: "You",
        role: "requester",
        idempotencyKey: `product-team-user:${stableDigest(conversation.id)}`
      })
      events.notify({
        conversationId: conversation.id,
        cause: "participants_changed",
        at: user.updatedAt
      })
      return await projectSummary(runtime, conversation)
    },
    async closeConversation(request) {
      await requireOpenProductConversation(runtime, request.conversationId)
      const openRounds = await runtime.listDiscussionRounds({
        conversationId: request.conversationId,
        state: "open",
        limit: 1
      })
      if (openRounds.length > 0) {
        throw new Error("Team conversation has an active round")
      }
      const conversation = await runtime.updateConversationState(
        request.conversationId,
        "closed"
      )
      events.notify({
        conversationId: conversation.id,
        cause: "conversation_changed",
        at: conversation.updatedAt
      })
      return await projectSummary(runtime, conversation)
    },
    async addParticipant(request) {
      const conversation = await requireOpenProductConversation(
        runtime,
        request.conversationId
      )
      const participants = await runtime.listParticipants(conversation.id)
      const existing = participants.find(
        (participant) => participant.agentSessionId === request.agentSessionId
      )
      const participant = existing === undefined
        ? await addAgentParticipant(runtime, request)
        : await reactivateAgentParticipant(runtime, existing, request)
      events.notify({
        conversationId: conversation.id,
        cause: "participants_changed",
        at: participant.updatedAt
      })
      return projectParticipant(participant)
    },
    async updateParticipant(request) {
      const participant = await requireAgentParticipant(runtime, request)
      const updated = await runtime.updateParticipantState(
        participant.id,
        request.state
      )
      events.notify({
        conversationId: request.conversationId,
        cause: "participants_changed",
        at: updated.updatedAt
      })
      return projectParticipant(updated)
    },
    async setCoordinator(request) {
      const conversation = await setCoordinator(runtime, request)
      events.notify({
        conversationId: request.conversationId,
        cause: "conversation_changed",
        at: conversation.updatedAt
      })
      return await projectSummary(runtime, conversation)
    },
    async submitRound(request) {
      const receipt = await submitRound(runtime, request)
      events.notify({
        conversationId: request.conversationId,
        cause: "message_changed",
        at: receipt.message.updatedAt
      })
      events.notify({
        conversationId: request.conversationId,
        cause: "round_changed",
        at: receipt.round.updatedAt
      })
      return receipt
    },
    subscribeInvalidations(listener) {
      return events.subscribe(listener)
    }
  }
}

async function listProductConversations(
  runtime: TeamConversationRuntime,
  request: Parameters<TeamConversationPort["listConversations"]>[0]
): Promise<readonly TeamConversationRecord[]> {
  const limit = request.limit ?? MAX_TEAM_LIST_LIMIT
  const query = {
    principalId: LOCAL_TEAM_PRINCIPAL,
    state: request.state ?? "open",
    limit
  } as const
  const [discussion, coordinated] = await Promise.all([
    runtime.listConversations({ ...query, mode: "peer" }),
    runtime.listConversations({ ...query, mode: "orchestrated" })
  ])
  return [...discussion, ...coordinated]
    .sort((left, right) =>
      right.updatedAt - left.updatedAt || left.id.localeCompare(right.id)
    )
    .slice(0, limit)
}

async function projectSummary(
  runtime: TeamConversationRuntime,
  conversation: TeamConversationRecord
) {
  const [participants, rounds] = await Promise.all([
    runtime.listParticipants(conversation.id),
    runtime.listDiscussionRounds({
      conversationId: conversation.id,
      state: "open",
      limit: 1
    })
  ])
  return projectTeamConversationSummary({ conversation, participants, rounds })
}

async function addAgentParticipant(
  runtime: TeamConversationRuntime,
  request: AddTeamParticipantRequest
): Promise<TeamParticipantRecord> {
  const bindingDigest = stableDigest(
    `${request.conversationId}\u0000${request.agentSessionId}`
  )
  return await runtime.addParticipant({
    id: `tpart_product_agent_${bindingDigest.slice(0, 32)}`,
    conversationId: request.conversationId,
    principalId: `local-host-agent-${stableDigest(request.agentSessionId).slice(0, 24)}`,
    kind: "agent",
    agentSessionId: request.agentSessionId,
    ...(request.displayName === undefined
      ? {}
      : { displayName: request.displayName }),
    ...(request.role === undefined ? {} : { role: request.role }),
    idempotencyKey: `product-team-agent:${bindingDigest}`
  })
}

async function reactivateAgentParticipant(
  runtime: TeamConversationRuntime,
  existing: TeamParticipantRecord,
  request: AddTeamParticipantRequest
): Promise<TeamParticipantRecord> {
  if (existing.kind !== "agent") {
    throw new Error("Team agent session is bound to a non-agent participant")
  }
  if (
    request.displayName !== undefined &&
    request.displayName !== existing.displayName
  ) {
    throw new Error("Team agent participant already exists with a different name")
  }
  if (request.role !== undefined && request.role !== existing.role) {
    throw new Error("Team agent participant already exists with a different role")
  }
  return existing.state === "active"
    ? existing
    : await runtime.updateParticipantState(existing.id, "active")
}

async function requireAgentParticipant(
  runtime: TeamConversationRuntime,
  request: UpdateTeamParticipantRequest
): Promise<TeamParticipantRecord> {
  await requireOpenProductConversation(runtime, request.conversationId)
  const participants = await runtime.listParticipants(request.conversationId)
  const participant = participants.find(
    (candidate) => candidate.id === request.participantId
  )
  if (participant === undefined) {
    throw new Error("Team participant does not belong to the conversation")
  }
  if (participant.kind !== "agent") {
    throw new Error("Only Team agent participants can be managed")
  }
  return participant
}

async function setCoordinator(
  runtime: TeamConversationRuntime,
  request: SetTeamCoordinatorRequest
): Promise<TeamConversationRecord> {
  const conversation = await requireOpenProductConversation(
    runtime,
    request.conversationId
  )
  if (conversation.mode !== "orchestrated") {
    throw new Error("Only coordinated Team conversations have a coordinator")
  }
  return await runtime.setConversationLead({
    conversationId: conversation.id,
    ...(request.expectedCoordinatorParticipantId === null
      ? {}
      : { expectedLeadParticipantId: request.expectedCoordinatorParticipantId }),
    ...(request.coordinatorParticipantId === null
      ? {}
      : { leadParticipantId: request.coordinatorParticipantId })
  })
}

async function submitRound(
  runtime: TeamConversationRuntime,
  request: SubmitTeamRoundRequest
): Promise<TeamRoundReceipt> {
  const conversation = await requireOpenProductConversation(
    runtime,
    request.conversationId
  )
  const digest = stableDigest(request.idempotencyKey)
  const messageId = `tmsg_product_${digest.slice(0, 32)}`
  const existingMessage = await runtime.getMessage(messageId)
  const participants = await runtime.listParticipants(conversation.id)
  const localUsers = participants.filter(
    (participant) =>
      participant.id === localUserParticipantId(conversation.id) &&
      participant.principalId === LOCAL_USER_PRINCIPAL &&
      participant.kind === "user" &&
      participant.state === "active"
  )
  if (localUsers.length !== 1) {
    throw new Error("Team conversation has no active local user participant")
  }
  const user = localUsers[0]
  if (user === undefined) {
    throw new Error("Team conversation has no active local user participant")
  }

  if (existingMessage === null) {
    const openRounds = await runtime.listDiscussionRounds({
      conversationId: conversation.id,
      state: "open",
      limit: 1
    })
    if (openRounds.length > 0) {
      throw new Error("Team conversation already has an active round")
    }
  }
  const message = {
    id: messageId,
    conversationId: conversation.id,
    authorParticipantId: user.id,
    targets: [] as readonly TeamTarget[],
    content: [{
      type: "text" as const,
      id: `part_product_${digest.slice(0, 32)}`,
      text: request.text
    }]
  }
  const routed = conversation.mode === "peer"
    ? await submitDiscussionRound(runtime, {
        digest,
        message,
        existingMessage,
        participants,
        actorPrincipalId: user.principalId
      })
    : await runtime.submitOrchestratedMessage({
        idempotencyKey: `product-team-submit:${digest}`,
        message
      })
  if (routed.round === undefined) {
    throw new Error("Finite peer delivery did not create a discussion round")
  }
  return {
    kind: "product.team-round.submitted",
    conversation: projectTeamConversationSummary({
      conversation,
      participants,
      rounds: [routed.round]
    }),
    message: projectMessage(routed.message),
    round: projectRound(routed.round),
    deliveries: routed.deliveries.map(projectDelivery)
  }
}

async function submitDiscussionRound(
  runtime: TeamConversationRuntime,
  options: {
    readonly digest: string
    readonly message: {
      readonly id: string
      readonly conversationId: string
      readonly authorParticipantId: string
      readonly targets: readonly TeamTarget[]
      readonly content: readonly {
        readonly type: "text"
        readonly id: string
        readonly text: string
      }[]
    }
    readonly existingMessage: TeamMessageRecord | null
    readonly participants: readonly TeamParticipantRecord[]
    readonly actorPrincipalId: string
  }
) {
  const targetIds = targetParticipantIds({
    message: options.existingMessage,
    participants: options.participants
  })
  const targets: TeamTarget[] = targetIds.map((participantId) => ({
    kind: "participant",
    participantId
  }))
  return await runtime.submitRoutedMessage({
    idempotencyKey: `product-team-submit:${options.digest}`,
    message: { ...options.message, targets },
    route: {
      mode: "peer",
      outcome: "deliver",
      actorPrincipalId: options.actorPrincipalId,
      reason: "Finite discussion round",
      deliveries: targetIds.map((targetParticipantId) => ({
        id: `tdel_product_${stableDigest(`${options.message.id}\u0000${targetParticipantId}`).slice(0, 32)}`,
        targetParticipantId,
        role: "speaker",
        trigger: "round"
      }))
    }
  })
}

function targetParticipantIds(options: {
  readonly message: TeamMessageRecord | null
  readonly participants: readonly TeamParticipantRecord[]
}): readonly string[] {
  if (options.message !== null) {
    return requireUniqueTargetIds(options.message.targets.map((target) => {
      if (target.kind !== "participant") {
        throw new Error("Recoverable peer message has a non-participant target")
      }
      return target.participantId
    }))
  }
  return requireUniqueTargetIds(options.participants
    .filter((participant) =>
      participant.kind === "agent" &&
      participant.state === "active" &&
      participant.agentSessionId !== undefined
    )
    .map((participant) => participant.id))
}

function requireUniqueTargetIds(values: readonly string[]): readonly string[] {
  const unique = [...new Set(values)]
  if (unique.length === 0) {
    throw new Error("Team conversation requires at least one active agent")
  }
  if (unique.length !== values.length) {
    throw new Error("Team conversation has duplicate agent delivery targets")
  }
  return unique
}

async function requireOpenProductConversation(
  runtime: TeamConversationRuntime,
  conversationId: string
): Promise<TeamConversationRecord> {
  const conversation = await getProductConversation(runtime, conversationId)
  if (conversation === null) {
    throw new Error(`Team conversation is not available: ${conversationId}`)
  }
  if (conversation.state !== "open") {
    throw new Error("Team conversation is not open")
  }
  return conversation
}

async function getProductConversation(
  runtime: TeamConversationRuntime,
  conversationId: string
): Promise<TeamConversationRecord | null> {
  const conversation = await runtime.getConversation(conversationId)
  if (
    conversation === null ||
    conversation.principalId !== LOCAL_TEAM_PRINCIPAL ||
    (conversation.mode !== "peer" && conversation.mode !== "orchestrated")
  ) {
    return null
  }
  return conversation
}

function localUserParticipantId(conversationId: string): string {
  return `tpart_product_user_${stableDigest(conversationId).slice(0, 32)}`
}

function stableDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}
