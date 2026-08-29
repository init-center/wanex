import type {
  ReadTeamConversationResult,
  SurfaceClient,
  SurfaceClientCommandEnvelope,
  SurfaceClientEventsResult,
  TeamAvailability,
  TeamConversationListReadModel
} from "@wanex/assistant/surface"
import type { TeamViewModel } from "./model.js"

export type TeamListEnvelope =
  SurfaceClientCommandEnvelope<TeamConversationListReadModel>
export type TeamReadEnvelope =
  SurfaceClientCommandEnvelope<ReadTeamConversationResult>

export function projectTeamView(request: {
  readonly list: TeamListEnvelope
  readonly read: TeamReadEnvelope
  readonly selectedConversationId?: string
  readonly previous?: TeamViewModel
}): TeamViewModel {
  if (!request.list.ok) {
    return failedTeam(request.previous, request.list.error.message)
  }
  const conversations = request.list.value.conversations
  const availability = request.list.value.availability
  if (availability.state === "unavailable") {
    return {
      kind: "web.team",
      state: "unavailable",
      availability,
      conversations
    }
  }
  if (request.selectedConversationId === undefined) {
    return {
      kind: "web.team",
      state: "no-selection",
      availability,
      conversations
    }
  }
  if (!request.read.ok) {
    return failedTeam(
      request.previous,
      request.read.error.message,
      conversations,
      availability,
      request.selectedConversationId
    )
  }
  const result = request.read.value
  if (result.kind === "assistant.team-conversation.found") {
    if (
      result.page.conversation.conversationId !== request.selectedConversationId
    ) {
      return failedTeam(
        request.previous,
        "selected group response does not match the requested conversation",
        conversations,
        availability,
        request.selectedConversationId
      )
    }
    return {
      kind: "web.team",
      state: "ready",
      availability,
      conversations,
      conversationId: request.selectedConversationId,
      page: result.page
    }
  }
  if (result.kind === "assistant.team-conversation.missing") {
    return {
      kind: "web.team",
      state: "missing",
      availability,
      conversations,
      conversationId: request.selectedConversationId,
      message: "Group conversation is no longer available"
    }
  }
  if (result.kind === "assistant.team-conversation.unavailable") {
    return {
      kind: "web.team",
      state: "unavailable",
      availability: result.availability,
      conversations
    }
  }
  return {
    kind: "web.team",
    state: "no-selection",
    availability,
    conversations
  }
}

export async function reconcileTeamEvents(request: {
  readonly client: SurfaceClient
  readonly list: TeamListEnvelope
  readonly previous: TeamViewModel
  readonly selectedConversationId?: string
  readonly events: SurfaceClientEventsResult
}): Promise<{ readonly list: TeamListEnvelope; readonly team: TeamViewModel }> {
  const invalidations = request.events.ok
    ? request.events.events.filter(
        (event) => event.type === "assistant.surface.team.invalidated"
      )
    : []
  const refreshAll = !request.events.ok || request.events.gap
  const refreshList = refreshAll || invalidations.length > 0
  const refreshSelected =
    request.selectedConversationId !== undefined &&
    (refreshAll || invalidations.some((event) =>
      event.team?.conversationId === undefined ||
      event.team.conversationId === request.selectedConversationId
    ))
  if (!refreshList && !refreshSelected) {
    return { list: request.list, team: request.previous }
  }
  const [list, read] = await Promise.all([
    refreshList
      ? request.client.listTeamConversations({ state: "open", limit: 100 })
      : Promise.resolve(request.list),
    refreshSelected
      ? request.client.readTeamConversation({
          conversationId: request.selectedConversationId,
          limit: 50
        })
      : Promise.resolve(undefined)
  ])
  if (read === undefined) {
    if (!list.ok) {
      return { list, team: failedTeam(request.previous, list.error.message) }
    }
    return {
      list,
      team: {
        ...request.previous,
        conversations: list.value.conversations,
        availability: list.value.availability
      }
    }
  }
  return {
    list,
    team: projectTeamView({
      list,
      read,
      ...(request.selectedConversationId === undefined
        ? {}
        : { selectedConversationId: request.selectedConversationId }),
      previous: request.previous
    })
  }
}

export function mergeEarlierTeamPage(request: {
  readonly current: TeamViewModel
  readonly previous: TeamViewModel
  readonly result: unknown
  readonly requestedConversationId: string
}): TeamViewModel {
  if (
    request.current.state !== "ready" ||
    request.previous.state !== "ready" ||
    request.current.conversationId !== request.requestedConversationId ||
    request.previous.conversationId !== request.requestedConversationId ||
    !isFoundTeamResult(request.result) ||
    request.result.page.conversation.conversationId !==
      request.requestedConversationId
  ) {
    return request.current
  }
  const earlier = request.result.page
  const previous = request.previous.page
  const current = request.current.page
  if (previous === undefined || current === undefined) return request.current
  const { nextCursor: _currentCursor, ...currentWithoutCursor } = current
  return {
    ...request.current,
    page: {
      ...currentWithoutCursor,
      participants: mergeRows(
        [earlier.participants, previous.participants, current.participants],
        (row) => row.participantId
      ),
      messages: mergeRows(
        [earlier.messages, previous.messages, current.messages],
        (row) => row.messageId
      ),
      rounds: mergeRows(
        [earlier.rounds, previous.rounds, current.rounds],
        (row) => row.roundId
      ),
      deliveries: mergeRows(
        [earlier.deliveries, previous.deliveries, current.deliveries],
        (row) => row.deliveryId
      ),
      observedAt: Math.max(
        earlier.observedAt,
        previous.observedAt,
        current.observedAt
      ),
      ...(earlier.nextCursor === undefined
        ? {}
        : { nextCursor: earlier.nextCursor })
    }
  }
}

function mergeRows<T extends { readonly createdAt: number }>(
  groups: readonly (readonly T[])[],
  id: (row: T) => string
): readonly T[] {
  const rows = new Map<string, T>()
  for (const group of groups) {
    for (const row of group) rows.set(id(row), row)
  }
  return [...rows.values()].sort((left, right) =>
    left.createdAt - right.createdAt || id(left).localeCompare(id(right))
  )
}

function isFoundTeamResult(value: unknown): value is Extract<
  ReadTeamConversationResult,
  { readonly kind: "assistant.team-conversation.found" }
> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { readonly kind?: unknown }).kind ===
      "assistant.team-conversation.found" &&
    typeof (value as { readonly page?: unknown }).page === "object"
  )
}

function failedTeam(
  previous: TeamViewModel | undefined,
  message: string,
  conversations = previous?.conversations ?? [],
  availability?: TeamAvailability,
  conversationId = previous?.conversationId
): TeamViewModel {
  return {
    kind: "web.team",
    state: "failed",
    conversations,
    ...(availability === undefined ? {} : { availability }),
    ...(conversationId === undefined ? {} : { conversationId }),
    ...(previous?.page === undefined ? {} : { page: previous.page }),
    message
  }
}
