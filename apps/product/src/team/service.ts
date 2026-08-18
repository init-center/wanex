import type { StateCoordinator } from "../state/product.js"
import { copyState } from "../state/product.js"
import type {
  ReadTeamConversationResult,
  TeamAvailability,
  TeamConversationListReadModel,
  TeamEvents,
  TeamInvalidatedEvent
} from "./model.js"
import type {
  AddTeamParticipantRequest,
  CloseTeamConversationRequest,
  CreateTeamConversationRequest,
  ListTeamConversationsRequest,
  SetTeamCoordinatorRequest,
  SubmitTeamRoundRequest,
  TeamConversationCommands,
  TeamConversationPort,
  UpdateTeamParticipantRequest
} from "./port.js"

const DEFAULT_PAGE_LIMIT = 50
const MAX_PAGE_LIMIT = 100
const MAX_TEAM_TITLE_LENGTH = 200
const MAX_TEAM_MESSAGE_LENGTH = 32_000
const MAX_TEAM_IDEMPOTENCY_KEY_BYTES = 256

export interface TeamConversationService {
  readonly commands: TeamConversationCommands
  readonly events: TeamEvents
  dispose(): void
}

export function createTeamConversationService(options: {
  readonly port?: TeamConversationPort
  readonly state: StateCoordinator
}): TeamConversationService {
  const listeners = new Set<
    Parameters<TeamEvents["subscribeTeamEvents"]>[0]
  >()
  let sequence = 0
  let disposed = false
  const unsubscribe = options.port?.subscribeInvalidations((event) => {
    if (disposed) return
    sequence += 1
    const projected: TeamInvalidatedEvent = {
      kind: "product.team.invalidated",
      sequence,
      cause: event.cause,
      at: event.at,
      ...(event.conversationId === undefined
        ? {}
        : { conversationId: event.conversationId })
    }
    for (const listener of listeners) {
      try {
        listener(projected)
      } catch {
        // Presentation listeners cannot affect durable Team execution.
      }
    }
  })

  const commands: TeamConversationCommands = {
    readAvailability() {
      return options.port?.readAvailability() ?? unavailableTeam()
    },
    async listConversations(request = {}) {
      if (options.port === undefined) {
        return {
          kind: "product.team-conversation-list",
          availability: unavailableTeam(),
          conversations: []
        }
      }
      return await options.port.listConversations({
        ...request,
        ...(request.limit === undefined
          ? {}
          : { limit: boundedLimit(request.limit) })
      })
    },
    async readConversation(request = {}) {
      if (options.port === undefined) {
        return {
          kind: "product.team-conversation.unavailable",
          availability: unavailableTeam()
        }
      }
      const conversationId = request.conversationId ?? selectedTeamId(
        options.state.state.selection
      )
      if (conversationId === undefined) {
        return { kind: "product.team-conversation.no-selection" }
      }
      const page = await options.port.readConversationPage({
        conversationId,
        ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
        limit: boundedLimit(request.limit ?? DEFAULT_PAGE_LIMIT)
      })
      return page === null
        ? { kind: "product.team-conversation.missing", conversationId }
        : { kind: "product.team-conversation.found", page }
    },
    async selectConversation(request) {
      const conversationId = requiredId(
        request.conversationId,
        "conversationId"
      )
      if (options.port === undefined) {
        throw new Error("Team conversations are not configured")
      }
      const page = await options.port.readConversationPage({
        conversationId,
        limit: 1
      })
      if (page === null) {
        throw new Error(`Team conversation does not exist: ${conversationId}`)
      }
      await selectTeam(options.state, conversationId)
      return page.conversation
    },
    async createConversation(request) {
      const port = requiredPort(options.port)
      const normalized = normalizeCreateRequest(request)
      const conversation = await port.createConversation(normalized)
      await selectTeam(options.state, conversation.conversationId)
      return conversation
    },
    async closeConversation(request) {
      const port = requiredPort(options.port)
      const conversationId = requiredId(
        request.conversationId,
        "conversationId"
      )
      const conversation = await port.closeConversation({ conversationId })
      if (
        options.state.state.selection?.kind === "team" &&
        options.state.state.selection.conversationId === conversationId
      ) {
        await clearTeamSelection(options.state)
      }
      return conversation
    },
    async addParticipant(request) {
      const port = requiredPort(options.port)
      return await port.addParticipant(normalizeParticipantRequest(request))
    },
    async updateParticipant(request) {
      const port = requiredPort(options.port)
      return await port.updateParticipant(normalizeParticipantUpdate(request))
    },
    async setCoordinator(request) {
      const port = requiredPort(options.port)
      return await port.setCoordinator(normalizeCoordinatorRequest(request))
    },
    async submitRound(request) {
      const port = requiredPort(options.port)
      return await port.submitRound(normalizeRoundRequest(request))
    }
  }

  return {
    commands,
    events: {
      subscribeTeamEvents(listener) {
        if (disposed) return () => {}
        listeners.add(listener)
        let subscribed = true
        return () => {
          if (!subscribed) return
          subscribed = false
          listeners.delete(listener)
        }
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribe?.()
      listeners.clear()
    }
  }
}

export function unavailableTeam(): TeamAvailability {
  return {
    kind: "product.team-availability",
    state: "unavailable",
    reason: "not_configured",
    capabilities: {
      canList: false,
      canCreateDiscussion: false,
      canCreateCoordinated: false,
      canManageParticipants: false,
      canAssignCoordinator: false,
      canSubmitRound: false
    }
  }
}

function selectedTeamId(
  selection: import("../model.js").ConversationSelection | undefined
): string | undefined {
  return selection?.kind === "team" ? selection.conversationId : undefined
}

function boundedLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Team conversation limit must be a positive safe integer")
  }
  return Math.min(value, MAX_PAGE_LIMIT)
}

function requiredId(value: string, field: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
  return normalized
}

function requiredPort(
  port: TeamConversationPort | undefined
): TeamConversationPort {
  if (port === undefined) {
    throw new Error("Team conversations are not configured")
  }
  return port
}

async function selectTeam(
  state: StateCoordinator,
  conversationId: string
): Promise<void> {
  await state.mutate(async (current) => {
    const next = copyState(current)
    next.selection = { kind: "team", conversationId }
    delete next.selectedPlanProposalId
    next.mode = "chat"
    return { value: undefined, next }
  })
}

async function clearTeamSelection(state: StateCoordinator): Promise<void> {
  await state.mutate(async (current) => {
    const next = copyState(current)
    delete next.selection
    delete next.selectedPlanProposalId
    next.mode = "chat"
    return { value: undefined, next }
  })
}

function normalizeCreateRequest(
  request: CreateTeamConversationRequest
): CreateTeamConversationRequest {
  if (!(request.mode === "discussion" || request.mode === "coordinated")) {
    throw new Error(`unsupported Team conversation mode: ${String(request.mode)}`)
  }
  const idempotencyKey = boundedIdempotencyKey(request.idempotencyKey)
  const title = optionalBoundedText(
    request.title,
    "title",
    MAX_TEAM_TITLE_LENGTH
  )
  return {
    mode: request.mode,
    idempotencyKey,
    ...(title === undefined ? {} : { title })
  }
}

function normalizeParticipantRequest(
  request: AddTeamParticipantRequest
): AddTeamParticipantRequest {
  const displayName = optionalBoundedText(
    request.displayName,
    "displayName",
    MAX_TEAM_TITLE_LENGTH
  )
  const role = optionalBoundedText(
    request.role,
    "role",
    MAX_TEAM_TITLE_LENGTH
  )
  return {
    conversationId: requiredId(request.conversationId, "conversationId"),
    agentSessionId: requiredId(request.agentSessionId, "agentSessionId"),
    idempotencyKey: boundedIdempotencyKey(request.idempotencyKey),
    ...(displayName === undefined ? {} : { displayName }),
    ...(role === undefined ? {} : { role })
  }
}

function normalizeParticipantUpdate(
  request: UpdateTeamParticipantRequest
): UpdateTeamParticipantRequest {
  if (!(["active", "muted", "left"] as const).includes(request.state)) {
    throw new Error(`unsupported Team participant state: ${request.state}`)
  }
  return {
    conversationId: requiredId(request.conversationId, "conversationId"),
    participantId: requiredId(request.participantId, "participantId"),
    state: request.state
  }
}

function normalizeCoordinatorRequest(
  request: SetTeamCoordinatorRequest
): SetTeamCoordinatorRequest {
  return {
    conversationId: requiredId(request.conversationId, "conversationId"),
    expectedCoordinatorParticipantId: optionalNullableId(
      request.expectedCoordinatorParticipantId,
      "expectedCoordinatorParticipantId"
    ),
    coordinatorParticipantId: optionalNullableId(
      request.coordinatorParticipantId,
      "coordinatorParticipantId"
    )
  }
}

function normalizeRoundRequest(
  request: SubmitTeamRoundRequest
): SubmitTeamRoundRequest {
  const text = requiredId(request.text, "text")
  if (text.length > MAX_TEAM_MESSAGE_LENGTH) {
    throw new Error(
      `text must contain at most ${MAX_TEAM_MESSAGE_LENGTH} characters`
    )
  }
  return {
    conversationId: requiredId(request.conversationId, "conversationId"),
    text,
    idempotencyKey: boundedIdempotencyKey(request.idempotencyKey)
  }
}

function optionalNullableId(
  value: string | null,
  field: string
): string | null {
  return value === null ? null : requiredId(value, field)
}

function optionalBoundedText(
  value: string | undefined,
  field: string,
  maxLength: number
): string | undefined {
  if (value === undefined) return undefined
  const normalized = requiredId(value, field)
  if (normalized.length > maxLength) {
    throw new Error(`${field} must contain at most ${maxLength} characters`)
  }
  return normalized
}

function boundedIdempotencyKey(value: string): string {
  const normalized = requiredId(value, "idempotencyKey")
  if (
    new TextEncoder().encode(normalized).byteLength >
    MAX_TEAM_IDEMPOTENCY_KEY_BYTES
  ) {
    throw new Error(
      `idempotencyKey must contain at most ${MAX_TEAM_IDEMPOTENCY_KEY_BYTES} bytes`
    )
  }
  return normalized
}
