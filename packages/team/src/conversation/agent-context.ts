import type {
  JsonValue,
  TeamDeliveryMaterializationContext
} from "@wanex/protocol"
import type {
  ResolveSessionTurnAgentContextRequest
} from "@wanex/runtime/execution"
import type { PreparedAgentContext } from "@wanex/runtime/context"
import type { PreparedSessionTurnExecutionBinding } from "@wanex/runtime/host"
import {
  ToolRegistry,
  type ToolDefinition
} from "@wanex/runtime/tools"
import {
  createTeamDelegateTool,
  type PrepareTeamDelegationExecutionBindingRequest
} from "./delegation-tool.js"
import { createTeamPassTool } from "./pass-tool.js"
import type { TeamConversationStorage } from "./storage.js"

export interface TeamDeliveryAgentContextResolverOptions {
  readonly storage: TeamConversationStorage
  prepareDelegatedExecutionBinding(
    request: PrepareTeamDelegationExecutionBindingRequest
  ): Promise<PreparedSessionTurnExecutionBinding>
}

export type TeamDeliveryAgentContextResolver = (
  request: ResolveSessionTurnAgentContextRequest
) => Promise<Pick<PreparedAgentContext, "tools"> | undefined>

export function createTeamDeliveryAgentContextResolver(
  options: TeamDeliveryAgentContextResolverOptions
): TeamDeliveryAgentContextResolver {
  return async (request) => {
    const deliveryId = teamDeliveryIdFromOrigin(request.origin)
    if (deliveryId === undefined) return undefined
    const context = await options.storage.getTeamDeliveryMaterializationContext(
      deliveryId
    )
    if (context === null) {
      throw new Error(`Team delivery origin does not resolve: ${deliveryId}`)
    }
    const plan = context.childPlan
    if (
      request.sessionId !== plan.sessionId ||
      request.inputId !== plan.inputId ||
      request.turnId !== plan.turnId ||
      !sameJson(request.origin, plan.origin) ||
      context.delivery.id !== deliveryId ||
      context.delivery.targetSessionId !== plan.sessionId ||
      context.participant.id !== context.delivery.targetParticipantId ||
      context.message.id !== context.delivery.messageId
    ) {
      throw new Error(`Team delivery origin does not match its child plan: ${deliveryId}`)
    }
    if (
      context.delivery.state === "queued" &&
      (
        context.participant.state !== "active" ||
        context.participant.kind !== "agent" ||
        context.participant.agentSessionId !== plan.sessionId
      )
    ) {
      throw new Error(`Team delivery child plan is no longer active: ${deliveryId}`)
    }
    const tools = new ToolRegistry()
    tools.register(createTeamPassTool({ deliveryId }))
    const isCurrentLead = await isCurrentOrchestratedLeadDelivery(
      options.storage,
      context
    )
    if (isCurrentLead || request.executionBinding !== undefined) {
      const participants = (await options.storage.listTeamParticipants({
        conversationId: context.conversation.id,
        state: "active"
      })).filter(
        (participant) =>
          participant.id !== context.participant.id &&
          participant.kind === "agent" &&
          participant.agentSessionId !== undefined
      )
      if (participants.length > 0) {
        const delegateTool = createTeamDelegateTool({
          conversationId: context.conversation.id,
          deliveryId,
          leadParticipantId: context.participant.id,
          participants,
          ...(request.executionBinding === undefined
            ? {}
            : { inheritedContextBinding: request.executionBinding }),
          ...(request.contextIdentity === undefined
            ? {}
            : { inheritedContextIdentity: request.contextIdentity }),
          prepareExecutionBinding: options.prepareDelegatedExecutionBinding
        })
        if (
          isCurrentLead ||
          bindingContainsExactTool(request.executionBinding, delegateTool)
        ) {
          tools.register(delegateTool)
        }
      }
    }
    return { tools }
  }
}

function bindingContainsExactTool(
  binding: ResolveSessionTurnAgentContextRequest["executionBinding"],
  tool: ToolDefinition
): boolean {
  if (binding?.toolSnapshot === undefined) return false
  const registry = new ToolRegistry()
  registry.register(tool)
  const expected = registry.snapshot().tools[0]
  if (expected === undefined) return false
  const snapshot = binding.toolSnapshot
  if (
    !isJsonRecord(snapshot) ||
    !Array.isArray(snapshot.tools)
  ) {
    return false
  }
  return snapshot.tools.some((candidate) => sameJson(candidate, expected))
}

function isJsonRecord(
  value: JsonValue
): value is Readonly<Record<string, JsonValue>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

async function isCurrentOrchestratedLeadDelivery(
  storage: TeamConversationStorage,
  context: TeamDeliveryMaterializationContext
): Promise<boolean> {
  if (
    context.conversation.state !== "open" ||
    context.conversation.mode !== "orchestrated" ||
    context.conversation.leadParticipantId !== context.participant.id ||
    context.delivery.targetParticipantId !== context.participant.id ||
    context.delivery.role !== "speaker" ||
    (context.delivery.state !== "queued" && context.delivery.state !== "dispatched")
  ) {
    return false
  }
  const decision = await storage.getTeamRoutingDecisionByMessage(context.message.id)
  return decision !== null &&
    decision.id === context.delivery.routingDecisionId &&
    decision.conversationId === context.conversation.id &&
    decision.mode === "orchestrated" &&
    decision.outcome === "deliver" &&
    decision.leadParticipantId === context.participant.id
}

function teamDeliveryIdFromOrigin(
  origin: ResolveSessionTurnAgentContextRequest["origin"]
): string | undefined {
  const candidate = origin?.metadata?.teamDeliveryId
  if (candidate === undefined) return undefined
  if (
    origin?.kind !== "agent" ||
    typeof candidate !== "string" ||
    candidate.length === 0
  ) {
    throw new Error("Team delivery origin is malformed")
  }
  return candidate
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(sortJson(left)) === JSON.stringify(sortJson(right))
}

function sortJson(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value !== "object") return value as JsonValue
  if (Array.isArray(value)) return value.map(sortJson) as JsonValue
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJson(item)])
  ) as JsonValue
}
