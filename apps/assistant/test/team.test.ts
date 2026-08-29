import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { TeamConversationPage } from "@wanex/protocol"
import {
  createMemoryStateStore,
  createSurfaceAdapter,
  createShell,
  type TeamConversationPort,
  type TeamPortInvalidation
} from "../src/index.js"
import {
  projectTeamConversationPage,
  projectTeamConversationSummary
} from "../src/team/index.js"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient
} from "../src/surface/client.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("Assistant Team boundary", () => {
  it("stays truthful without a configured Team port", async () => {
    const stateStore = createMemoryStateStore({
      selection: { kind: "team", conversationId: "team_missing" }
    })
    const app = await createAssistant({ stateStore })
    try {
      expect(app.teamConversations.readAvailability()).toEqual({
        kind: "assistant.team-availability",
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
      })
      await expect(app.teamConversations.listConversations()).resolves.toEqual({
        kind: "assistant.team-conversation-list",
        availability: app.teamConversations.readAvailability(),
        conversations: []
      })
      await expect(app.teamConversations.readConversation()).resolves.toEqual({
        kind: "assistant.team-conversation.unavailable",
        availability: app.teamConversations.readAvailability()
      })

      await app.readHome()
      expect(app.status().state.selection).toBeUndefined()
      expect(stateStore.snapshot()?.ui.selection).toBeUndefined()
      await expect(
        app.teamConversations.selectConversation({
          conversationId: "team_missing"
        })
      ).rejects.toThrow("Team conversations are not configured")
    } finally {
      await app.dispose()
    }
  })

  it("lists, reads, selects, and invalidates through one safe port", async () => {
    const port = new FakeTeamPort(teamPage())
    const stateStore = createMemoryStateStore()
    const app = await createAssistant({ stateStore, teamConversations: port })
    const events: TeamPortInvalidation[] = []
    app.teamEvents.subscribeTeamEvents(() => {
      throw new Error("listener failure")
    })
    app.teamEvents.subscribeTeamEvents((event) => events.push(event))

    try {
      await expect(app.teamConversations.listConversations({ limit: 500 }))
        .resolves.toMatchObject({
          availability: { state: "ready" },
          conversations: [
            {
              conversationId: "team_assistant",
              title: "Design review",
              participantCount: 3,
              activeAgentCount: 2,
              activeRound: true
            }
          ]
        })
      expect(port.lastListLimit).toBe(100)

      const selected = await app.teamConversations.selectConversation({
        conversationId: " team_assistant "
      })
      expect(selected.conversationId).toBe("team_assistant")
      expect(app.status().state.selection).toEqual({
        kind: "team",
        conversationId: "team_assistant"
      })
      expect(stateStore.snapshot()?.ui.selection).toEqual({
        kind: "team",
        conversationId: "team_assistant"
      })
      await expect(app.teamConversations.readConversation()).resolves
        .toMatchObject({
          kind: "assistant.team-conversation.found",
          page: {
            conversation: { conversationId: "team_assistant" },
            messages: [
              { messageId: "message_user", status: "sent" },
              { messageId: "message_agent", status: "sent" }
            ],
            deliveries: [
              { deliveryId: "delivery_waiting", status: "waiting" },
              { deliveryId: "delivery_reply", status: "replied" }
            ]
          }
        })

      await app.teamConversations.createConversation({
        mode: "discussion",
        title: "  Architecture group  ",
        idempotencyKey: "  create-team  "
      })
      expect(port.createRequest).toEqual({
        mode: "discussion",
        title: "Architecture group",
        idempotencyKey: "create-team"
      })
      await app.teamConversations.addParticipant({
        conversationId: " team_assistant ",
        agentSessionId: " session_agent_a ",
        displayName: " Architect ",
        role: " Reviewer ",
        idempotencyKey: " add-agent-a "
      })
      expect(port.addRequest).toEqual({
        conversationId: "team_assistant",
        agentSessionId: "session_agent_a",
        displayName: "Architect",
        role: "Reviewer",
        idempotencyKey: "add-agent-a"
      })
      await app.teamConversations.submitRound({
        conversationId: " team_assistant ",
        text: "  Compare the designs  ",
        idempotencyKey: " submit-round "
      })
      expect(port.submitRequest).toEqual({
        conversationId: "team_assistant",
        text: "Compare the designs",
        idempotencyKey: "submit-round"
      })
      await app.teamConversations.setCoordinator({
        conversationId: " team_assistant ",
        expectedCoordinatorParticipantId: null,
        coordinatorParticipantId: " participant_agent_a "
      })
      expect(port.coordinatorRequest).toEqual({
        conversationId: "team_assistant",
        expectedCoordinatorParticipantId: null,
        coordinatorParticipantId: "participant_agent_a"
      })
      await expect(app.teamConversations.updateParticipant({
        conversationId: "team_assistant",
        participantId: "participant_agent_a",
        state: "gone"
      } as never)).rejects.toThrow("unsupported Team participant state: gone")

      port.emit({
        conversationId: "team_assistant",
        cause: "delivery_changed",
        at: 90
      })
      expect(events).toEqual([
        {
          kind: "assistant.team.invalidated",
          sequence: 1,
          conversationId: "team_assistant",
          cause: "delivery_changed",
          at: 90
        }
      ])

      await app.teamConversations.closeConversation({
        conversationId: "team_assistant"
      })
      expect(app.status().state.selection).toBeUndefined()
    } finally {
      await app.dispose()
    }
    expect(port.unsubscribeCount).toBe(1)
    port.emit({ cause: "conversation_changed", at: 91 })
    expect(events).toHaveLength(1)
  })

  it("rebuilds public content and strips durable private fields", () => {
    const projected = projectTeamConversationPage(teamPage(), "opaque-next")
    const json = JSON.stringify(projected)

    expect(projected.nextCursor).toBe("opaque-next")
    expect(projected.messages[0]?.content).toEqual([
      { type: "text", partId: "part_user", text: "Review this" },
      {
        type: "resource",
        partId: "part_resource",
        resourceId: "resource_public",
        sha256: "a".repeat(64),
        sizeBytes: 12,
        kind: "image",
        mediaType: "image/png"
      }
    ])
    expect(json).not.toContain("principal-private")
    expect(json).not.toContain("metadata-private")
    expect(json).not.toContain("provider-private")
    expect(json).not.toContain("job-private")
    expect(json).not.toContain("error-private")
    expect(json).not.toContain("idempotency-private")
    expect(json).not.toContain("session_agent_a")
    expect(json).not.toContain("session_agent_b")

    const states = [
      "queued",
      "dispatched",
      "responded",
      "passed",
      "failed",
      "cancelled"
    ] as const
    const statuses = projectTeamConversationPage({
      ...teamPage(),
      deliveries: states.map((state, index) => ({
        ...teamPage().deliveries[0]!,
        id: `delivery_${state}_${index}`,
        state
      }))
    }).deliveries.map((delivery) => delivery.status)
    expect(statuses).toEqual([
      "waiting",
      "responding",
      "replied",
      "passed",
      "failed",
      "cancelled"
    ])
  })

  it("fails closed for unsupported policy and non-public message parts", () => {
    const page = teamPage()
    expect(() => projectTeamConversationSummary({
      conversation: { ...page.conversation, mode: "hybrid" },
      participants: page.participants,
      rounds: page.rounds
    })).toThrow("unsupported Assistant Team conversation mode: hybrid")

    expect(() => projectTeamConversationSummary({
      conversation: {
        ...page.conversation,
        mode: "peer",
        leadParticipantId: "participant_agent_a"
      },
      participants: page.participants,
      rounds: page.rounds
    })).toThrow("discussion Team conversation cannot have a coordinator")

    expect(projectTeamConversationSummary({
      conversation: {
        ...page.conversation,
        mode: "orchestrated",
        leadParticipantId: "participant_agent_a"
      },
      participants: page.participants,
      rounds: page.rounds
    })).toMatchObject({
      mode: "coordinated",
      coordinatorParticipantId: "participant_agent_a"
    })
    expect(() => projectTeamConversationSummary({
      conversation: {
        ...page.conversation,
        mode: "orchestrated",
        leadParticipantId: "participant_missing"
      },
      participants: page.participants,
      rounds: page.rounds
    })).toThrow("coordinated Team coordinator must be an active agent")

    expect(() => projectTeamConversationPage({
      ...page,
      messages: [
        {
          ...page.messages[0]!,
          content: [
            {
              type: "reasoning",
              id: "reasoning_private",
              text: "private chain"
            }
          ]
        }
      ]
    })).toThrow("unsupported public Team message part: reasoning")
  })

  it("carries Team commands and invalidations through the strict Surface", async () => {
    const port = new FakeTeamPort(teamPage())
    const app = await createAssistant({ teamConversations: port })
    const surface = createSurfaceAdapter(app, { now: () => 30_001 })
    const transport = createInProcessSurfaceClientTransport(surface)
    const client = createSurfaceClient(transport)
    try {
      await expect(client.listTeamConversations({ limit: 500 })).resolves
        .toMatchObject({
          ok: true,
          value: {
            kind: "assistant.team-conversation-list",
            conversations: [{ conversationId: "team_assistant" }]
          }
        })
      expect(port.lastListLimit).toBe(100)
      await expect(client.selectTeamConversation({
        conversationId: "team_assistant"
      })).resolves.toMatchObject({
        ok: true,
        value: { conversationId: "team_assistant" }
      })
      await expect(client.readTeamConversation()).resolves.toMatchObject({
        ok: true,
        value: {
          kind: "assistant.team-conversation.found",
          page: { conversation: { conversationId: "team_assistant" } }
        }
      })
      await expect(client.submitTeamRound({
        conversationId: "team_assistant",
        text: "Review through Surface",
        idempotencyKey: "surface-team-submit"
      })).resolves.toMatchObject({
        ok: true,
        value: { kind: "assistant.team-round.submitted" }
      })
      await expect(client.setTeamCoordinator({
        conversationId: "team_assistant",
        expectedCoordinatorParticipantId: null,
        coordinatorParticipantId: "participant_agent_a"
      })).resolves.toMatchObject({
        ok: true,
        value: { conversationId: "team_assistant" }
      })
      expect(port.coordinatorRequest).toEqual({
        conversationId: "team_assistant",
        expectedCoordinatorParticipantId: null,
        coordinatorParticipantId: "participant_agent_a"
      })
      await expect(surface.dispatchSurfaceCommand({
        command: "createTeamConversation",
        input: {
          title: "Missing explicit mode",
          idempotencyKey: "surface-team-missing-mode"
        }
      })).resolves.toMatchObject({
        ok: false,
        error: {
          code: "validation_error",
          message: expect.stringContaining("mode is not supported")
        }
      })
      await expect(surface.dispatchSurfaceCommand({
        command: "submitTeamRound",
        input: {
          conversationId: "team_assistant",
          text: "Renderer must not choose the route",
          idempotencyKey: "surface-team-route-forgery",
          mode: "coordinated"
        }
      })).resolves.toMatchObject({
        ok: false,
        error: {
          code: "validation_error",
          message: expect.stringContaining("mode is not supported")
        }
      })

      port.emit({
        conversationId: "team_assistant",
        cause: "delivery_changed",
        at: 30_002
      })
      expect(surface.readSurfaceEvents().events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "assistant.surface.team.invalidated",
            command: "readTeamConversation",
            team: {
              kind: "assistant.team.invalidated",
              sequence: 1,
              conversationId: "team_assistant",
              cause: "delivery_changed",
              at: 30_002
            }
          })
        ])
      )
      await expect(surface.dispatchSurfaceCommand({
        command: "addTeamParticipant",
        input: {
          conversationId: "team_assistant",
          agentSessionId: "session_agent_a",
          idempotencyKey: "surface-team-add",
          principalId: "must-not-cross-surface"
        }
      })).resolves.toMatchObject({
        ok: false,
        error: {
          code: "validation_error",
          message: expect.stringContaining("principalId is not supported")
        }
      })

      const malformed = createSurfaceClient({
        ...transport,
        async dispatchSurfaceCommand(request) {
          const response = await transport.dispatchSurfaceCommand(request)
          if (
            request.command !== "readTeamConversation" ||
            !response.ok ||
            typeof response.value !== "object" ||
            response.value === null
          ) {
            return response
          }
          const value = structuredClone(response.value) as Record<string, any>
          value.page.participants[0].principalId = "raw-principal-leak"
          return { ...response, value }
        }
      })
      await expect(malformed.readTeamConversation({
        conversationId: "team_assistant"
      })).resolves.toMatchObject({
        ok: false,
        error: { code: "invalid_transport_response" }
      })
    } finally {
      await surface.dispose()
      await app.dispose()
    }
  })
})

class FakeTeamPort implements TeamConversationPort {
  readonly page: ReturnType<typeof projectTeamConversationPage>
  lastListLimit: number | undefined
  unsubscribeCount = 0
  createRequest: unknown
  addRequest: unknown
  coordinatorRequest: unknown
  submitRequest: unknown
  private listener: ((event: TeamPortInvalidation) => void) | undefined

  constructor(page: TeamConversationPage) {
    this.page = projectTeamConversationPage(page)
  }

  readAvailability() {
    return {
      kind: "assistant.team-availability" as const,
      state: "ready" as const,
      reason: "configured" as const,
      capabilities: {
        canList: true,
        canCreateDiscussion: true,
        canCreateCoordinated: true,
        canManageParticipants: true,
        canAssignCoordinator: true,
        canSubmitRound: true
      }
    }
  }

  async listConversations(request: { readonly limit?: number }) {
    this.lastListLimit = request.limit
    return {
      kind: "assistant.team-conversation-list" as const,
      availability: this.readAvailability(),
      conversations: [this.page.conversation]
    }
  }

  async readConversationPage(request: { readonly conversationId: string }) {
    return request.conversationId === this.page.conversation.conversationId
      ? this.page
      : null
  }

  async createConversation(request: unknown) {
    this.createRequest = request
    return this.page.conversation
  }

  async closeConversation() {
    return { ...this.page.conversation, state: "closed" as const }
  }

  async addParticipant(request: unknown) {
    this.addRequest = request
    return this.page.participants[1]!
  }

  async updateParticipant() {
    return this.page.participants[1]!
  }

  async setCoordinator(request: unknown) {
    this.coordinatorRequest = request
    return this.page.conversation
  }

  async submitRound(request: unknown) {
    this.submitRequest = request
    return {
      kind: "assistant.team-round.submitted" as const,
      conversation: this.page.conversation,
      message: this.page.messages[0]!,
      round: this.page.rounds[0]!,
      deliveries: this.page.deliveries
    }
  }

  subscribeInvalidations(listener: (event: TeamPortInvalidation) => void) {
    this.listener = listener
    return () => {
      this.unsubscribeCount += 1
      this.listener = undefined
    }
  }

  emit(event: TeamPortInvalidation): void {
    this.listener?.(event)
  }
}

async function createAssistant(
  options: Partial<Parameters<typeof createShell>[0]>
) {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-assistant-team-"))
  tempDirs.push(storeDir)
  return await createShell({
    storage: { kind: "local-system-service", storeDir },
    artifacts: { explicitPath: serviceBin },
    ...options
  })
}

function teamPage(): TeamConversationPage {
  return {
    conversation: {
      id: "team_assistant",
      principalId: "principal-private",
      title: "Design review",
      mode: "peer",
      state: "open",
      metadata: { secret: "metadata-private" },
      createdAt: 1,
      updatedAt: 20
    },
    participants: [
      {
        id: "participant_user",
        conversationId: "team_assistant",
        principalId: "principal-private-user",
        kind: "user",
        displayName: "You",
        state: "active",
        metadata: { secret: "metadata-private-user" },
        createdAt: 2,
        updatedAt: 2
      },
      {
        id: "participant_agent_a",
        conversationId: "team_assistant",
        principalId: "principal-private-agent-a",
        kind: "agent",
        displayName: "Architect",
        agentSessionId: "session_agent_a",
        state: "active",
        createdAt: 3,
        updatedAt: 3
      },
      {
        id: "participant_agent_b",
        conversationId: "team_assistant",
        principalId: "principal-private-agent-b",
        kind: "agent",
        displayName: "Reviewer",
        agentSessionId: "session_agent_b",
        state: "active",
        createdAt: 4,
        updatedAt: 4
      }
    ],
    messages: [
      {
        id: "message_user",
        conversationId: "team_assistant",
        authorParticipantId: "participant_user",
        discussionRoundId: "round_assistant",
        kind: "message",
        state: "routed",
        targets: [{ kind: "all" }],
        content: [
          {
            type: "text",
            id: "part_user",
            text: "Review this",
            providerMetadata: { secret: "provider-private" }
          },
          {
            type: "resource",
            id: "part_resource",
            resourceId: "resource_public",
            sha256: "a".repeat(64),
            sizeBytes: 12,
            kind: "image",
            mediaType: "image/png",
            providerMetadata: { secret: "provider-private-resource" }
          }
        ],
        metadata: { secret: "metadata-private-message" },
        idempotencyKey: "idempotency-private-message",
        revision: 2,
        createdAt: 10,
        updatedAt: 11
      },
      {
        id: "message_agent",
        conversationId: "team_assistant",
        authorParticipantId: "participant_agent_a",
        parentMessageId: "message_user",
        discussionRoundId: "round_assistant",
        kind: "message",
        state: "visible",
        targets: [],
        content: [{ type: "text", id: "part_agent", text: "Looks good" }],
        idempotencyKey: "idempotency-private-reply",
        revision: 1,
        createdAt: 12,
        updatedAt: 12
      }
    ],
    routingDecisions: [],
    rounds: [
      {
        id: "round_assistant",
        conversationId: "team_assistant",
        sourceMessageId: "message_user",
        routingDecisionId: "route_private",
        mode: "peer",
        state: "open",
        expectedDeliveryCount: 2,
        idempotencyKey: "idempotency-private-round",
        createdAt: 11,
        updatedAt: 12
      }
    ],
    deliveries: [
      {
        id: "delivery_waiting",
        conversationId: "team_assistant",
        messageId: "message_user",
        routingDecisionId: "route_private",
        discussionRoundId: "round_assistant",
        targetParticipantId: "participant_agent_b",
        role: "speaker",
        trigger: "round",
        state: "queued",
        targetSessionId: "session_agent_b",
        dispatchJobId: "job-private-waiting",
        lastError: { secret: "error-private-waiting" },
        idempotencyKey: "idempotency-private-delivery-waiting",
        createdAt: 11,
        updatedAt: 11
      },
      {
        id: "delivery_reply",
        conversationId: "team_assistant",
        messageId: "message_user",
        routingDecisionId: "route_private",
        discussionRoundId: "round_assistant",
        targetParticipantId: "participant_agent_a",
        role: "speaker",
        trigger: "round",
        state: "responded",
        targetSessionId: "session_agent_a",
        dispatchJobId: "job-private-reply",
        childTurnId: "turn_private",
        replyMessageId: "message_agent",
        idempotencyKey: "idempotency-private-delivery-reply",
        createdAt: 11,
        updatedAt: 12,
        finishedAt: 12
      }
    ],
    observedAt: 20,
    nextCursor: { createdAt: 12, messageId: "message_agent" }
  }
}
