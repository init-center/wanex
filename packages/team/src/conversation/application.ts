import type {
  ReadTeamConversationPageRequest,
  RouteTeamMessageReceipt,
  TeamConversationPage,
  TeamDeliveryRecord,
  TeamMessageRecord,
  TeamParticipantRecord,
  TeamRoutingDecisionRecord
} from "@wanex/protocol"
import type { TeamConversationStorage } from "./storage.js"
import type {
  SubmitOrchestratedTeamMessageRequest,
  SubmitRoutedTeamMessageRequest
} from "./types.js"

const MAX_COMMAND_IDEMPOTENCY_KEY_BYTES = 256

export async function submitRoutedMessage(
  storage: TeamConversationStorage,
  request: SubmitRoutedTeamMessageRequest
): Promise<RouteTeamMessageReceipt> {
  validateSubmitRequest(request)
  const namespace = `team-submit:${request.idempotencyKey}`
  const message = await storage.admitTeamMessage({
    ...request.message,
    idempotencyKey: `${namespace}:message`
  })
  return await storage.routeTeamMessage({
    ...request.route,
    messageId: message.id,
    expectedRevision: 1,
    idempotencyKey: `${namespace}:route`
  })
}

export async function submitOrchestratedMessage(
  storage: TeamConversationStorage,
  request: SubmitOrchestratedTeamMessageRequest
): Promise<RouteTeamMessageReceipt> {
  validateSubmitRequest(request)
  const namespace = `team-submit:${request.idempotencyKey}`
  const message = await storage.admitTeamMessage({
    ...request.message,
    idempotencyKey: `${namespace}:message`
  })
  const existing = await storage.getTeamRoutingDecisionByMessage(message.id)
  if (existing !== null) {
    if (
      existing.mode !== "orchestrated" ||
      existing.outcome !== "deliver" ||
      existing.leadParticipantId === undefined ||
      existing.idempotencyKey !== `${namespace}:route`
    ) {
      throw new Error("Existing Team route does not match orchestrated submission")
    }
    const deliveries = await storage.listTeamDeliveries({
      routingDecisionId: existing.id
    })
    return await replayOrchestratedRoute(storage, message, existing, deliveries)
  }

  const conversation = await storage.getTeamConversation(message.conversationId)
  if (
    conversation === null ||
    conversation.mode !== "orchestrated" ||
    conversation.state !== "open"
  ) {
    throw new Error("Team conversation is not an open orchestrated conversation")
  }
  const leadParticipantId = conversation.leadParticipantId
  if (leadParticipantId === undefined) {
    throw new Error("Orchestrated Team conversation requires an active lead")
  }
  const participants = await storage.listTeamParticipants({
    conversationId: conversation.id
  })
  const author = participants.find(
    (participant) => participant.id === message.authorParticipantId
  )
  if (author === undefined) {
    throw new Error("Orchestrated Team message author is missing")
  }
  requireRoutableAgent(participants, leadParticipantId, "lead")
  const route = resolveOrchestratedTarget(message, participants, leadParticipantId)
  return await storage.routeTeamMessage({
    messageId: message.id,
    expectedRevision: 1,
    expectedLeadParticipantId: leadParticipantId,
    mode: "orchestrated",
    outcome: "deliver",
    actorPrincipalId: author.principalId,
    reason: route.reason,
    idempotencyKey: `${namespace}:route`,
    deliveries: [{
      targetParticipantId: route.targetParticipantId,
      role: "speaker",
      trigger: route.trigger
    }]
  })
}

export async function readConversationPage(
  storage: TeamConversationStorage,
  request: ReadTeamConversationPageRequest
): Promise<TeamConversationPage | null> {
  return await storage.readTeamConversationPage(request)
}

function validateSubmitRequest(
  request: Pick<SubmitRoutedTeamMessageRequest, "idempotencyKey" | "message">
): void {
  const bytes = new TextEncoder().encode(request.idempotencyKey).byteLength
  if (
    request.idempotencyKey.trim().length === 0 ||
    bytes > MAX_COMMAND_IDEMPOTENCY_KEY_BYTES
  ) {
    throw new Error(
      `Team submit idempotency key must contain 1 to ${MAX_COMMAND_IDEMPOTENCY_KEY_BYTES} bytes`
    )
  }
  if (request.message.conversationId.length === 0) {
    throw new Error("Team submit conversationId must not be empty")
  }
}

function resolveOrchestratedTarget(
  message: TeamMessageRecord,
  participants: readonly TeamParticipantRecord[],
  leadParticipantId: string
): {
  readonly targetParticipantId: string
  readonly trigger: "lead" | "direct"
  readonly reason: string
} {
  if (message.targets.length === 0) {
    return {
      targetParticipantId: leadParticipantId,
      trigger: "lead",
      reason: "Orchestrated lead route"
    }
  }
  if (message.targets.length !== 1) {
    throw new Error("Orchestrated Team message accepts exactly one typed target")
  }
  const target = message.targets[0]
  if (target?.kind === "lead") {
    return {
      targetParticipantId: leadParticipantId,
      trigger: "lead",
      reason: "Orchestrated lead route"
    }
  }
  if (target?.kind !== "participant" || target.participantId === undefined) {
    throw new Error("Orchestrated Team message target must be lead or participant")
  }
  requireRoutableAgent(participants, target.participantId, "target")
  return {
    targetParticipantId: target.participantId,
    trigger: "direct",
    reason: "Explicit participant target"
  }
}

function requireRoutableAgent(
  participants: readonly TeamParticipantRecord[],
  participantId: string,
  label: "lead" | "target"
): TeamParticipantRecord {
  const participant = participants.find((candidate) => candidate.id === participantId)
  if (
    participant === undefined ||
    participant.kind !== "agent" ||
    participant.state !== "active" ||
    participant.agentSessionId === undefined
  ) {
    throw new Error(`Orchestrated Team ${label} must be an active agent`)
  }
  return participant
}

async function replayOrchestratedRoute(
  storage: TeamConversationStorage,
  message: TeamMessageRecord,
  decision: TeamRoutingDecisionRecord,
  deliveries: readonly TeamDeliveryRecord[]
): Promise<RouteTeamMessageReceipt> {
  const [delivery] = deliveries
  const leadParticipantId = decision.leadParticipantId
  if (
    delivery === undefined ||
    deliveries.length !== 1 ||
    leadParticipantId === undefined
  ) {
    throw new Error("Existing orchestrated Team route must have one delivery")
  }
  return await storage.routeTeamMessage({
    id: decision.id,
    messageId: message.id,
    expectedRevision: 1,
    expectedLeadParticipantId: leadParticipantId,
    mode: decision.mode,
    outcome: decision.outcome,
    actorPrincipalId: decision.actorPrincipalId,
    reason: decision.reason,
    ...(decision.metadata === undefined ? {} : { metadata: decision.metadata }),
    idempotencyKey: decision.idempotencyKey,
    deliveries: [{
      id: delivery.id,
      targetParticipantId: delivery.targetParticipantId,
      role: delivery.role,
      trigger: delivery.trigger,
      ...(delivery.budgetGrantId === undefined
        ? {}
        : { budgetGrantId: delivery.budgetGrantId })
    }]
  })
}
