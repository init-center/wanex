import type {
  JsonValue,
  TeamParticipantRecord
} from "@wanex/protocol"
import { WanexRuntimeHost } from "@wanex/runtime/host"
import {
  FakeProviderAdapter,
  type ProviderEvent,
  type ProviderRequest
} from "@wanex/runtime/provider"
import { AllowAllToolsPolicy } from "@wanex/runtime/tools"
import {
  createTeamConversationExecutionHost,
  createTeamDeliveryAgentContextResolver,
  TeamConversationRuntime,
  type TeamConversationExecutionHost
} from "@wanex/team/conversation"
import type { EvalStore } from "./eval-storage.js"
import { createEvalScenario } from "./runner.js"
import { assert } from "./scenario-utils.js"

export const teamLeadDelegationDurableScenario = createEvalScenario({
  id: "team.lead-delegation-durable",
  title: "Team lead delegation survives host replacement and publishes once",
  tags: ["team", "delegation", "runtime-host", "restart", "product-path"],
  async run(context) {
    const provider = new EvalTeamDelegationProvider()
    let hosts = createHosts(context.storage, provider)
    try {
      const fixture = await createTeamFixture(context.storage, hosts.runtime)
      provider.setTargets(fixture.research.id, fixture.review.id)
      const routed = await hosts.runtime.submitOrchestratedMessage({
        idempotencyKey: "eval-team-lead-delegation",
        message: {
          conversationId: fixture.conversationId,
          authorParticipantId: fixture.user.id,
          targets: [],
          content: [{
            type: "text",
            id: "part_eval_team_lead_delegation",
            text: "Delegate two checks and provide one final summary."
          }]
        }
      })
      const round = required(routed.round, "Eval Team round")
      const delivery = required(routed.deliveries[0], "Eval lead delivery")
      assert(routed.deliveries.length === 1, "orchestrated route must have one delivery")

      await hosts.teamHost.runOnce()
      const dispatched = required(
        (await hosts.runtime.listDeliveries({ messageId: routed.message.id }))[0],
        "materialized Eval lead delivery"
      )
      const parentTurnId = required(dispatched.childTurnId, "Eval lead Turn")
      const parentJobId = required(dispatched.childTurnJobId, "Eval lead job")
      await hosts.agentHost.runOnce()
      await hosts.agentHost.runOnce()

      const tool = (await context.storage.listToolExecutions({
        turnId: parentTurnId
      })).find((candidate) => candidate.toolName === "team_delegate")
      assert(tool?.state === "succeeded", "durable delegation Tool must collect")
      const operation = tool === undefined
        ? null
        : await context.storage.getTeamDelegationOperationByToolExecution({
            toolExecutionId: tool.id
          })
      assert(operation?.state === "succeeded", "delegation operation must succeed")
      assert(
        (await hosts.runtime.getDiscussionRound(round.id))?.state === "open",
        "Tool collection must not close the Team round"
      )

      await hosts.teamHost.dispose()
      await hosts.agentHost.dispose()
      hosts = createHosts(context.storage, provider)
      await hosts.agentHost.runOnce()
      await hosts.teamHost.runOnce()

      const messages = await hosts.runtime.listMessages({
        conversationId: fixture.conversationId
      })
      const completedRound = await hosts.runtime.getDiscussionRound(round.id)
      const completedDelivery = (await hosts.runtime.listDeliveries({
        messageId: routed.message.id
      }))[0]
      assert(messages.length === 2, "Team must expose one user message and one summary")
      assert(
        messages[1]?.authorParticipantId === fixture.lead.id,
        "summary must belong to the source lead"
      )
      assert(
        completedDelivery?.state === "responded" &&
          completedDelivery.childTurnId === parentTurnId &&
          completedDelivery.childTurnJobId === parentJobId,
        "source delivery must settle from the same logical lead Turn"
      )
      assert(
        completedRound?.state === "closed" &&
          completedRound.outcome === "completed" &&
          completedRound.result?.responded === 1,
        "round must close only after the final lead outcome"
      )
      assert(provider.initialLeadRequests === 1, "lead must delegate once")
      assert(provider.childRequests === 2, "two delegated child requests must run")
      assert(provider.resumedLeadRequests === 1, "lead must resume exactly once")
      return {
        conversationId: fixture.conversationId,
        sourceDeliveryId: delivery.id,
        parentTurnId,
        parentJobId,
        operationId: operation?.id ?? null,
        publicMessageCount: messages.length,
        delegatedChildRequests: provider.childRequests,
        resumedLeadRequests: provider.resumedLeadRequests,
        roundOutcome: completedRound?.outcome ?? null
      }
    } finally {
      await hosts.teamHost.dispose()
      await hosts.agentHost.dispose()
    }
  }
})

function createHosts(
  storage: EvalStore,
  provider: EvalTeamDelegationProvider
): {
  readonly runtime: TeamConversationRuntime
  readonly agentHost: WanexRuntimeHost
  readonly teamHost: TeamConversationExecutionHost
} {
  let agentHost: WanexRuntimeHost
  let teamHost: TeamConversationExecutionHost | undefined
  const policy = new AllowAllToolsPolicy()
  const resolver = createTeamDeliveryAgentContextResolver({
    storage,
    prepareDelegatedExecutionBinding: async (request) =>
      await agentHost.prepareExecutionBinding(request)
  })
  agentHost = new WanexRuntimeHost({
    storage,
    provider,
    workerCount: 3,
    toolPermissionPolicy: policy,
    resolveAgentContext: async (request) => {
      const resolved = await resolver(request)
      return resolved === undefined
        ? undefined
        : { ...resolved, toolPermissionPolicy: policy }
    },
    observeSessionTurnResult() {
      teamHost?.wake()
    }
  })
  const runtime = new TeamConversationRuntime({ storage })
  teamHost = createTeamConversationExecutionHost({
    storage,
    teamStorage: storage,
    prepareExecutionBinding: async ({ plan, content, origin }) =>
      await agentHost.prepareExecutionBinding({
        sessionId: plan.sessionId,
        inputId: plan.inputId,
        turnId: plan.turnId,
        content,
        origin
      }),
    wakeAgentHost() {
      agentHost.wake()
    }
  })
  return { runtime, agentHost, teamHost }
}

async function createTeamFixture(
  storage: EvalStore,
  runtime: TeamConversationRuntime
): Promise<{
  readonly conversationId: string
  readonly user: TeamParticipantRecord
  readonly lead: TeamParticipantRecord
  readonly research: TeamParticipantRecord
  readonly review: TeamParticipantRecord
}> {
  const conversation = await runtime.createConversation({
    id: "team_eval_lead_delegation",
    principalId: "principal_eval_team_owner",
    mode: "orchestrated"
  })
  const user = await runtime.addParticipant({
    id: "participant_eval_team_user",
    conversationId: conversation.id,
    principalId: "principal_eval_team_user",
    kind: "user"
  })
  const lead = await addAgent(storage, runtime, conversation.id, "lead")
  const research = await addAgent(storage, runtime, conversation.id, "research")
  const review = await addAgent(storage, runtime, conversation.id, "review")
  await runtime.setConversationLead({
    conversationId: conversation.id,
    leadParticipantId: lead.id
  })
  return {
    conversationId: conversation.id,
    user,
    lead,
    research,
    review
  }
}

async function addAgent(
  storage: EvalStore,
  runtime: TeamConversationRuntime,
  conversationId: string,
  role: string
): Promise<TeamParticipantRecord> {
  const sessionId = `ses_eval_team_${role}`
  await storage.createSession({ id: sessionId, kind: "agent" })
  return await runtime.addParticipant({
    id: `participant_eval_team_${role}`,
    conversationId,
    principalId: `principal_eval_team_${role}`,
    kind: "agent",
    agentSessionId: sessionId
  })
}

class EvalTeamDelegationProvider extends FakeProviderAdapter {
  initialLeadRequests = 0
  childRequests = 0
  resumedLeadRequests = 0
  private targets: readonly [string, string] | undefined

  constructor() {
    super({ responseText: "unused" })
  }

  setTargets(research: string, review: string): void {
    this.targets = [research, review]
  }

  override async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    const result = delegationResult(request)
    if (
      result === undefined &&
      request.tools?.some((tool) => tool.name === "team_delegate") === true
    ) {
      this.initialLeadRequests += 1
      const targets = required(this.targets, "Eval Team targets")
      yield { type: "tool_call_start", index: 0, toolCallId: "call_eval_team_delegate" }
      yield {
        type: "tool_call_delta",
        toolCallId: "call_eval_team_delegate",
        toolNameDelta: "team_delegate",
        inputJsonDelta: JSON.stringify({
          tasks: [
            {
              key: "research",
              targetParticipantId: targets[0],
              prompt: "Research the Eval request."
            },
            {
              key: "review",
              targetParticipantId: targets[1],
              prompt: "Review the Eval request."
            }
          ]
        })
      }
      yield { type: "tool_call_end", toolCallId: "call_eval_team_delegate" }
      yield { type: "finish", reason: "tool_calls" }
      return
    }
    if (result !== undefined) {
      this.resumedLeadRequests += 1
      yield {
        type: "text_delta",
        partId: "part_eval_team_summary",
        delta: "Eval lead summary."
      }
      yield { type: "finish", reason: "stop" }
      return
    }
    this.childRequests += 1
    yield {
      type: "text_delta",
      partId: "part_eval_team_child",
      delta: "Eval delegated evidence."
    }
    yield { type: "finish", reason: "stop" }
  }
}

function delegationResult(request: ProviderRequest): JsonValue | undefined {
  for (const message of request.messages) {
    if (message.role !== "tool") continue
    for (const part of message.content) {
      if (part.type !== "tool_result") continue
      const result = part.content.find(
        (content) =>
          content.type === "json" &&
          isRecord(content.value) &&
          content.value.kind === "team.delegation_result"
      )
      if (result?.type === "json") return result.value
    }
  }
  return undefined
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function required<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw new Error(`${label} is missing`)
  return value
}
