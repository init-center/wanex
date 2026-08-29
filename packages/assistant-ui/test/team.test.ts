import { describe, expect, it } from "vitest"
import type {
  ReadTeamConversationResult,
  SurfaceClient,
  SurfaceClientCommandEnvelope,
  SurfaceClientEventsResult,
  SurfaceEvent,
  TeamConversationListReadModel,
  TeamConversationPageReadModel
} from "@wanex/assistant/surface"
import {
  mergeEarlierTeamPage,
  projectTeamView,
  reconcileTeamEvents
} from "../src/application/team/projection.js"
import { dispatchAction } from "../src/application/actions/dispatch.js"
import { parseRequest } from "../src/application/request.js"

describe("Web Team application contract", () => {
  it("projects unavailable and selected group states truthfully", () => {
    const unavailable = projectTeamView({
      list: envelope({
        kind: "assistant.team-conversation-list",
        availability: availability("unavailable"),
        conversations: []
      }),
      read: envelope({
        kind: "assistant.team-conversation.unavailable",
        availability: availability("unavailable")
      })
    })
    expect(unavailable).toEqual({
      kind: "web.team",
      state: "unavailable",
      availability: availability("unavailable"),
      conversations: []
    })

    const page = teamPage("team_selected", [message("message_new", 20)])
    expect(projectTeamView({
      list: listEnvelope(page),
      read: readEnvelope(page),
      selectedConversationId: "team_selected"
    })).toMatchObject({
      state: "ready",
      conversationId: "team_selected",
      page: { messages: [{ messageId: "message_new" }] }
    })
  })

  it("prepends stable earlier pages without duplicates or stale selection writes", () => {
    const previousPage = teamPage("team_merge", [
      message("message_middle", 20),
      message("message_new", 30)
    ], "cursor_older")
    const currentPage = teamPage("team_merge", [
      message("message_middle", 20),
      message("message_new", 30),
      message("message_latest", 40)
    ], "cursor_older")
    const earlierPage = teamPage("team_merge", [
      message("message_old", 10),
      message("message_middle", 20)
    ])
    const previous = readyTeam(previousPage)
    const current = readyTeam(currentPage)
    const merged = mergeEarlierTeamPage({
      current,
      previous,
      result: {
        kind: "assistant.team-conversation.found",
        page: earlierPage
      },
      requestedConversationId: "team_merge"
    })
    expect(merged.page?.messages.map((item) => item.messageId)).toEqual([
      "message_old",
      "message_middle",
      "message_new",
      "message_latest"
    ])
    expect(merged.page).not.toHaveProperty("nextCursor")

    expect(mergeEarlierTeamPage({
      current: readyTeam(teamPage("team_other", [])),
      previous,
      result: {
        kind: "assistant.team-conversation.found",
        page: earlierPage
      },
      requestedConversationId: "team_merge"
    }).conversationId).toBe("team_other")
  })

  it("refreshes only from Team invalidation or event gaps", async () => {
    const page = teamPage("team_events", [message("message_event", 10)])
    const list = listEnvelope(page)
    const previous = readyTeam(page)
    let listCalls = 0
    let readCalls = 0
    const client = {
      async listTeamConversations() {
        listCalls += 1
        return list
      },
      async readTeamConversation() {
        readCalls += 1
        return readEnvelope(page)
      }
    } as unknown as SurfaceClient

    const unchanged = await reconcileTeamEvents({
      client,
      list,
      previous,
      selectedConversationId: "team_events",
      events: eventPage([])
    })
    expect(unchanged.team).toBe(previous)
    expect({ listCalls, readCalls }).toEqual({ listCalls: 0, readCalls: 0 })

    await reconcileTeamEvents({
      client,
      list,
      previous,
      selectedConversationId: "team_events",
      events: eventPage([teamEvent("team_unrelated")])
    })
    expect({ listCalls, readCalls }).toEqual({ listCalls: 1, readCalls: 0 })

    await reconcileTeamEvents({
      client,
      list,
      previous,
      selectedConversationId: "team_events",
      events: eventPage([teamEvent("team_events")])
    })
    expect({ listCalls, readCalls }).toEqual({ listCalls: 2, readCalls: 1 })

    await reconcileTeamEvents({
      client,
      list,
      previous,
      selectedConversationId: "team_events",
      events: { ...eventPage([]), gap: true }
    })
    expect({ listCalls, readCalls }).toEqual({ listCalls: 3, readCalls: 2 })
  })

  it("dispatches typed Team actions and validates history requests", async () => {
    const calls: Array<{ readonly method: string; readonly input: unknown }> = []
    const client = {
      async createTeamConversation(input: unknown) {
        calls.push({ method: "create", input })
        return envelope({})
      },
      async selectTeamConversation(input: unknown) {
        calls.push({ method: "select", input })
        return envelope({})
      },
      async setTeamCoordinator(input: unknown) {
        calls.push({ method: "coordinator", input })
        return envelope({})
      },
      async submitTeamRound(input: unknown) {
        calls.push({ method: "submit", input })
        return envelope({})
      },
      async readTeamConversation(input: unknown) {
        calls.push({ method: "read", input })
        return envelope({})
      }
    } as unknown as SurfaceClient
    const options = { client }

    await dispatchAction(options, {
      type: "create-team-conversation",
      input: {
        mode: "discussion",
        title: "Review",
        idempotencyKey: "create-team"
      }
    }, undefined)
    await dispatchAction(options, {
      type: "select-team-conversation",
      conversationId: "team_actions"
    }, undefined)
    await dispatchAction(options, {
      type: "set-team-coordinator",
      input: {
        conversationId: "team_actions",
        expectedCoordinatorParticipantId: null,
        coordinatorParticipantId: "participant_lead"
      }
    }, undefined)
    await dispatchAction(options, {
      type: "submit-team-round",
      input: {
        conversationId: "team_actions",
        text: "Review this",
        idempotencyKey: "submit-team"
      }
    }, undefined)
    await dispatchAction(options, {
      type: "load-earlier-team-history",
      input: {
        conversationId: "team_actions",
        cursor: "opaque-cursor",
        limit: 50
      }
    }, undefined)
    expect(calls).toEqual([
      {
        method: "create",
        input: {
          mode: "discussion",
          title: "Review",
          idempotencyKey: "create-team"
        }
      },
      { method: "select", input: { conversationId: "team_actions" } },
      {
        method: "coordinator",
        input: {
          conversationId: "team_actions",
          expectedCoordinatorParticipantId: null,
          coordinatorParticipantId: "participant_lead"
        }
      },
      {
        method: "submit",
        input: {
          conversationId: "team_actions",
          text: "Review this",
          idempotencyKey: "submit-team"
        }
      },
      {
        method: "read",
        input: {
          conversationId: "team_actions",
          cursor: "opaque-cursor",
          limit: 50
        }
      }
    ])

    expect(parseRequest({
      kind: "web.request",
      operation: "dispatchAction",
      action: {
        type: "load-earlier-team-history",
        input: {
          conversationId: "team_actions",
          cursor: "opaque-cursor",
          limit: 50
        }
      }
    })).toMatchObject({ ok: true })
    expect(parseRequest({
      kind: "web.request",
      operation: "dispatchAction",
      action: {
        type: "load-earlier-team-history",
        input: {
          conversationId: "team_actions",
          cursor: "opaque-cursor",
          limit: 101
        }
      }
    })).toMatchObject({
      ok: false,
      error: { field: "action.input.limit" }
    })
  })
})

function envelope<T>(value: T): SurfaceClientCommandEnvelope<T> {
  return {
    ok: true,
    command: "readTeamConversation",
    value,
    event: {
      id: "event_test",
      sequence: 1,
      type: "assistant.surface.command_completed",
      command: "readTeamConversation",
      at: 1
    }
  }
}

function listEnvelope(
  page: TeamConversationPageReadModel
): SurfaceClientCommandEnvelope<TeamConversationListReadModel> {
  return {
    ...envelope({
      kind: "assistant.team-conversation-list" as const,
      availability: availability("ready"),
      conversations: [page.conversation]
    }),
    command: "listTeamConversations"
  }
}

function readEnvelope(
  page: TeamConversationPageReadModel
): SurfaceClientCommandEnvelope<ReadTeamConversationResult> {
  return envelope({
    kind: "assistant.team-conversation.found" as const,
    page
  })
}

function availability(state: "ready" | "unavailable") {
  const ready = state === "ready"
  return {
    kind: "assistant.team-availability" as const,
    state,
    reason: ready ? "configured" as const : "not_configured" as const,
    capabilities: {
      canList: ready,
      canCreateDiscussion: ready,
      canCreateCoordinated: ready,
      canManageParticipants: ready,
      canAssignCoordinator: ready,
      canSubmitRound: ready
    }
  }
}

function readyTeam(page: TeamConversationPageReadModel) {
  return {
    kind: "web.team" as const,
    state: "ready" as const,
    availability: availability("ready"),
    conversations: [page.conversation],
    conversationId: page.conversation.conversationId,
    page
  }
}

function teamPage(
  conversationId: string,
  messages: TeamConversationPageReadModel["messages"],
  nextCursor?: string
): TeamConversationPageReadModel {
  return {
    kind: "assistant.team-conversation-page",
    conversation: {
      conversationId,
      title: "Test group",
      mode: "discussion",
      state: "open",
      participantCount: 1,
      activeAgentCount: 1,
      activeRound: false,
      createdAt: 1,
      updatedAt: 40
    },
    participants: [],
    messages,
    rounds: [],
    deliveries: [],
    observedAt: 40,
    ...(nextCursor === undefined ? {} : { nextCursor })
  }
}

function message(messageId: string, createdAt: number) {
  return {
    messageId,
    authorParticipantId: "participant_user",
    kind: "message" as const,
    status: "sent" as const,
    content: [{
      type: "text" as const,
      partId: `part_${messageId}`,
      text: messageId
    }],
    revision: 1,
    createdAt,
    updatedAt: createdAt
  }
}

function eventPage(
  events: readonly SurfaceEvent[]
): Extract<SurfaceClientEventsResult, { readonly ok: true }> {
  return {
    ok: true,
    streamId: "team_test_stream",
    earliestSequence: 1,
    latestSequence: events.length,
    gap: false,
    hasMore: false,
    events
  }
}

function teamEvent(conversationId: string) {
  return {
    id: `event_${conversationId}`,
    sequence: 1,
    type: "assistant.surface.team.invalidated" as const,
    command: "readTeamConversation",
    at: 10,
    team: {
      kind: "assistant.team.invalidated" as const,
      sequence: 1,
      conversationId,
      cause: "delivery_changed" as const,
      at: 10
    }
  }
}
