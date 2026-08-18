import { createHash } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import type {
  SessionInputOrigin,
  SessionTurnExecutionBinding,
  TeamDeliveryMaterializationContext
} from "@wanex/protocol"
import type { TeamConversationStorage } from "../../src/conversation/storage.js"
import {
  createTeamDeliveryAgentContextResolver,
  TEAM_DELEGATE_TOOL_NAME,
  TEAM_PASS_TOOL_NAME
} from "../../src/conversation/index.js"

describe("Team delivery agent context", () => {
  it("leaves ordinary session turns unchanged", async () => {
    const getContext = vi.fn()
    const resolver = createTeamDeliveryAgentContextResolver({
      storage: storageWith(getContext),
      prepareDelegatedExecutionBinding: unavailableDelegatedBinding
    })

    await expect(resolver({
      sessionId: "ses_ordinary",
      inputId: "inp_ordinary",
      turnId: "turn_ordinary",
      origin: { kind: "client", sourceRef: "composer" },
      signal: new AbortController().signal
    })).resolves.toBeUndefined()
    expect(getContext).not.toHaveBeenCalled()
  })

  it("injects an exact delivery-bound team_pass tool", async () => {
    const context = teamContext()
    const resolver = createTeamDeliveryAgentContextResolver({
      storage: storageWith(async () => context),
      prepareDelegatedExecutionBinding: unavailableDelegatedBinding
    })

    const resolved = await resolver({
      sessionId: context.childPlan.sessionId,
      inputId: context.childPlan.inputId,
      turnId: context.childPlan.turnId,
      origin: context.childPlan.origin,
      signal: new AbortController().signal
    })

    expect(resolved?.tools?.list().map((tool) => tool.name)).toEqual([
      TEAM_PASS_TOOL_NAME
    ])
    expect(
      resolved?.tools?.get(TEAM_PASS_TOOL_NAME)?.runtimeBinding.configurationDigest
    ).toBe(createHash("sha256").update(
      JSON.stringify({ deliveryId: context.delivery.id })
    ).digest("hex"))
  })

  it("injects team_delegate only for the exact current orchestrated lead delivery", async () => {
    const context = currentLeadContext()
    const target = {
      id: "participant_target",
      conversationId: context.conversation.id,
      principalId: "principal_target",
      kind: "agent",
      displayName: "Target",
      agentSessionId: "ses_target",
      state: "active",
      createdAt: 1,
      updatedAt: 1
    } as const
    const storage = {
      getTeamDeliveryMaterializationContext: async () => context,
      getTeamRoutingDecisionByMessage: async () => ({
        id: context.delivery.routingDecisionId,
        conversationId: context.conversation.id,
        messageId: context.message.id,
        mode: "orchestrated",
        outcome: "deliver",
        leadParticipantId: context.participant.id,
        actorPrincipalId: "principal_user",
        reason: "current lead",
        idempotencyKey: "route-current-lead",
        createdAt: 1
      }),
      listTeamParticipants: async () => [context.participant, target]
    } as unknown as TeamConversationStorage
    const resolver = createTeamDeliveryAgentContextResolver({
      storage,
      prepareDelegatedExecutionBinding: unavailableDelegatedBinding
    })
    const resolved = await resolver({
      sessionId: context.childPlan.sessionId,
      inputId: context.childPlan.inputId,
      turnId: context.childPlan.turnId,
      origin: context.childPlan.origin,
      signal: new AbortController().signal
    })
    expect(resolved?.tools?.list().map((tool) => tool.name)).toEqual([
      TEAM_DELEGATE_TOOL_NAME,
      TEAM_PASS_TOOL_NAME
    ])

    const stale = {
      ...context,
      conversation: {
        ...context.conversation,
        leadParticipantId: "participant_other_lead"
      }
    }
    const staleResolver = createTeamDeliveryAgentContextResolver({
      storage: {
        ...storage,
        getTeamDeliveryMaterializationContext: async () => stale
      } as TeamConversationStorage,
      prepareDelegatedExecutionBinding: unavailableDelegatedBinding
    })
    const staleResult = await staleResolver({
      sessionId: stale.childPlan.sessionId,
      inputId: stale.childPlan.inputId,
      turnId: stale.childPlan.turnId,
      origin: stale.childPlan.origin,
      signal: new AbortController().signal
    })
    expect(staleResult?.tools?.list().map((tool) => tool.name)).toEqual([
      TEAM_PASS_TOOL_NAME
    ])

    const resumed = await staleResolver({
      ...exactContextRequest(stale),
      executionBinding: {
        toolSnapshot: resolved?.tools?.snapshot()
      } as unknown as SessionTurnExecutionBinding
    })
    expect(resumed?.tools?.list().map((tool) => tool.name)).toEqual([
      TEAM_DELEGATE_TOOL_NAME,
      TEAM_PASS_TOOL_NAME
    ])
  })

  it("fails closed for missing, malformed, and mismatched delivery origins", async () => {
    const context = teamContext()
    const resolver = createTeamDeliveryAgentContextResolver({
      storage: storageWith(async () => context),
      prepareDelegatedExecutionBinding: unavailableDelegatedBinding
    })
    const exact = {
      sessionId: context.childPlan.sessionId,
      inputId: context.childPlan.inputId,
      turnId: context.childPlan.turnId,
      origin: context.childPlan.origin,
      signal: new AbortController().signal
    }

    await expect(resolver({ ...exact, turnId: "turn_forged" }))
      .rejects.toThrow(/does not match its child plan/)
    await expect(resolver({
      ...exact,
      origin: {
        ...context.childPlan.origin,
        metadata: {
          ...context.childPlan.origin.metadata,
          teamDeliveryId: "delivery_missing"
        }
      }
    })).rejects.toThrow(/does not match its child plan/)
    await expect(createTeamDeliveryAgentContextResolver({
      storage: storageWith(async () => null),
      prepareDelegatedExecutionBinding: unavailableDelegatedBinding
    })({
      ...exact,
      origin: teamOrigin("delivery_missing")
    })).rejects.toThrow(/does not resolve/)
    await expect(resolver({
      ...exact,
      origin: {
        kind: "client",
        metadata: { teamDeliveryId: context.delivery.id }
      }
    })).rejects.toThrow(/origin is malformed/)
  })
})

async function unavailableDelegatedBinding(): Promise<never> {
  throw new Error("Delegated binding is not expected in this fixture")
}

function exactContextRequest(context: TeamDeliveryMaterializationContext) {
  return {
    sessionId: context.childPlan.sessionId,
    inputId: context.childPlan.inputId,
    turnId: context.childPlan.turnId,
    origin: context.childPlan.origin,
    signal: new AbortController().signal
  }
}

function storageWith(
  getContext: (
    deliveryId: string
  ) => Promise<TeamDeliveryMaterializationContext | null>
): TeamConversationStorage {
  return {
    getTeamDeliveryMaterializationContext: getContext
  } as unknown as TeamConversationStorage
}

function teamContext(): TeamDeliveryMaterializationContext {
  const origin = teamOrigin("delivery_exact")
  return {
    conversation: { id: "conversation_exact" },
    participant: {
      id: "participant_exact",
      state: "active",
      kind: "agent",
      agentSessionId: "ses_exact"
    },
    message: { id: "message_exact" },
    delivery: {
      id: "delivery_exact",
      state: "queued",
      messageId: "message_exact",
      targetParticipantId: "participant_exact",
      targetSessionId: "ses_exact"
    },
    dispatchJob: { id: "job_delivery_exact" },
    childPlan: {
      sessionId: "ses_exact",
      inputId: "inp_exact",
      turnId: "turn_exact",
      jobId: "job_turn_exact",
      principalId: "principal_exact",
      inputType: "user",
      content: [{ type: "text", id: "part_exact", text: "Review this" }],
      origin,
      intent: "normal",
      inputIdempotencyKey: "delivery-exact-input",
      jobIdempotencyKey: "delivery-exact-job"
    }
  } as unknown as TeamDeliveryMaterializationContext
}

function currentLeadContext(): TeamDeliveryMaterializationContext {
  const context = teamContext()
  return {
    ...context,
    conversation: {
      ...context.conversation,
      principalId: "principal_owner",
      mode: "orchestrated",
      state: "open",
      leadParticipantId: context.participant.id,
      createdAt: 1,
      updatedAt: 1
    },
    participant: {
      ...context.participant,
      conversationId: context.conversation.id,
      principalId: "principal_lead",
      createdAt: 1,
      updatedAt: 1
    },
    message: {
      ...context.message,
      conversationId: context.conversation.id
    },
    delivery: {
      ...context.delivery,
      conversationId: context.conversation.id,
      routingDecisionId: "route_exact",
      role: "speaker"
    }
  } as TeamDeliveryMaterializationContext
}

function teamOrigin(deliveryId: string): SessionInputOrigin {
  return {
    kind: "agent",
    sourceRef: "message_exact",
    parentRef: deliveryId,
    metadata: {
      teamConversationId: "conversation_exact",
      teamMessageId: "message_exact",
      teamRoutingDecisionId: "route_exact",
      teamDiscussionRoundId: "round_exact",
      teamDeliveryId: deliveryId,
      targetParticipantId: "participant_exact"
    }
  }
}
