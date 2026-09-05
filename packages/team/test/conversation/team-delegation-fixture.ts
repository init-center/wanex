import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
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
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"
import {
  createTeamConversationExecutionHost,
  createTeamDeliveryAgentContextResolver,
  TeamConversationRuntime,
  type TeamConversationExecutionHost
} from "../../src/conversation/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

export interface TeamDelegationJourneyHosts {
  readonly runtime: TeamConversationRuntime
  readonly agentHost: WanexRuntimeHost
  readonly teamHost: TeamConversationExecutionHost
}

export interface TeamDelegationFixture {
  readonly conversationId: string
  readonly leadSessionId: string
  readonly user: TeamParticipantRecord
  readonly lead: TeamParticipantRecord
  readonly research: TeamParticipantRecord
  readonly review: TeamParticipantRecord
}

export interface TeamDelegationProviderOptions {
  readonly finalOutcome?: "summary" | "pass"
  readonly failedChild?: "research" | "review"
}

export async function createJourneyStore(): Promise<{
  readonly storeDir: string
  readonly storage: StorageTestStore
}> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-team-delegation-journey-"))
  return {
    storeDir,
    storage: createStorageTestStore({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })
  }
}

export function createJourneyHosts(
  storage: StorageTestStore,
  provider: TeamDelegationProvider
): TeamDelegationJourneyHosts {
  let agentHost: WanexRuntimeHost
  let teamHost: TeamConversationExecutionHost | undefined
  const permissionPolicy = new AllowAllToolsPolicy()
  const resolver = createTeamDeliveryAgentContextResolver({
    storage,
    prepareDelegatedExecutionBinding: async (request) =>
      await agentHost.prepareExecutionBinding(request)
  })
  agentHost = new WanexRuntimeHost({
    storage,
    provider,
    workerCount: 3,
    toolPermissionPolicy: permissionPolicy,
    resolveAgentContext: async (request) => {
      const resolved = await resolver(request)
      return resolved === undefined
        ? undefined
        : {
            context: {
              ...resolved,
              toolPermissionPolicy: permissionPolicy
            }
          }
    },
    observeSessionTurnLifecycle() {
      teamHost?.wake()
    }
  })
  const runtime = new TeamConversationRuntime({
    storage,
    notifyWorkAvailable() {
      teamHost?.wake()
    }
  })
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

export async function createOrchestratedFixture(
  storage: StorageTestStore,
  runtime: TeamConversationRuntime,
  suffix: string
): Promise<TeamDelegationFixture> {
  const conversation = await runtime.createConversation({
    id: `team_delegation_${suffix}`,
    principalId: `team_delegation_owner_${suffix}`,
    mode: "orchestrated"
  })
  const user = await runtime.addParticipant({
    id: `participant_team_delegation_user_${suffix}`,
    conversationId: conversation.id,
    principalId: `principal_team_delegation_user_${suffix}`,
    kind: "user"
  })
  const participants = await Promise.all([
    createAgentParticipant(storage, runtime, conversation.id, suffix, "lead"),
    createAgentParticipant(storage, runtime, conversation.id, suffix, "research"),
    createAgentParticipant(storage, runtime, conversation.id, suffix, "review")
  ])
  const [lead, research, review] = participants
  if (lead === undefined || research === undefined || review === undefined) {
    throw new Error("Team delegation fixture participants are missing")
  }
  await runtime.setConversationLead({
    conversationId: conversation.id,
    leadParticipantId: lead.id
  })
  return {
    conversationId: conversation.id,
    leadSessionId: requireValue(lead.agentSessionId, "lead Session id"),
    user,
    lead,
    research,
    review
  }
}

async function createAgentParticipant(
  storage: StorageTestStore,
  runtime: TeamConversationRuntime,
  conversationId: string,
  suffix: string,
  role: string
): Promise<TeamParticipantRecord> {
  const sessionId = `ses_team_delegation_${suffix}_${role}`
  await storage.createSession({ id: sessionId, kind: "agent" })
  return await runtime.addParticipant({
    id: `participant_team_delegation_${suffix}_${role}`,
    conversationId,
    principalId: `principal_team_delegation_${suffix}_${role}`,
    kind: "agent",
    displayName: role,
    agentSessionId: sessionId
  })
}

export class TeamDelegationProvider extends FakeProviderAdapter {
  readonly initialLeadRequests: ProviderRequest[] = []
  readonly resumedLeadRequests: ProviderRequest[] = []
  readonly childRequests: ProviderRequest[] = []
  readonly passCompletionRequests: ProviderRequest[] = []
  private readonly options: TeamDelegationProviderOptions
  private targetIds: readonly [string, string] | undefined

  constructor(options: TeamDelegationProviderOptions = {}) {
    super({ responseText: "unused" })
    this.options = options
  }

  setTargets(researchParticipantId: string, reviewParticipantId: string): void {
    this.targetIds = [researchParticipantId, reviewParticipantId]
  }

  override async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    const passResult = toolResultJsonFromRequest(request, "team.pass")
    if (passResult !== undefined) {
      this.passCompletionRequests.push(request)
      yield {
        type: "text_delta",
        partId: "part_team_delegation_pass_complete",
        delta: "Pass recorded."
      }
      yield { type: "finish", reason: "stop" }
      return
    }

    const result = delegationResultFromRequest(request)
    const hasDelegateTool = request.tools?.some(
      (tool) => tool.name === "team_delegate"
    ) === true
    if (hasDelegateTool && result === undefined) {
      this.initialLeadRequests.push(request)
      yield* delegateToolCall(requireValue(
        this.targetIds,
        "delegation provider targets"
      ))
      return
    }
    if (result !== undefined) {
      this.resumedLeadRequests.push(request)
      if (this.options.finalOutcome === "pass") {
        yield* passToolCall(requireTeamPassDeliveryId(request))
        return
      }
      yield {
        type: "text_delta",
        partId: "part_team_delegation_summary",
        delta: "Lead summary from delegated results."
      }
      yield { type: "finish", reason: "stop" }
      return
    }

    this.childRequests.push(request)
    const prompt = requestText(request)
    const child = prompt.includes("Research") ? "research" : "review"
    if (this.options.failedChild === child) {
      yield {
        type: "error",
        error: {
          category: "server",
          message: `Controlled ${child} failure`,
          retryable: false,
          providerId: this.providerId,
          modelId: this.model.id,
          phase: "stream"
        }
      }
      return
    }
    yield {
      type: "text_delta",
      partId: `part_team_delegation_${child}`,
      delta: child === "research" ? "Research result." : "Review result."
    }
    yield { type: "finish", reason: "stop" }
  }
}

function* delegateToolCall(
  targets: readonly [string, string]
): Iterable<ProviderEvent> {
  yield {
    type: "tool_call_start",
    index: 0,
    toolCallId: "call_team_delegation_journey"
  }
  yield {
    type: "tool_call_delta",
    toolCallId: "call_team_delegation_journey",
    toolNameDelta: "team_delegate",
    inputJsonDelta: JSON.stringify({
      tasks: [
        {
          key: "research",
          targetParticipantId: targets[0],
          prompt: "Research the request."
        },
        {
          key: "review",
          targetParticipantId: targets[1],
          prompt: "Review the request."
        }
      ]
    })
  }
  yield {
    type: "tool_call_end",
    toolCallId: "call_team_delegation_journey"
  }
  yield { type: "finish", reason: "tool_calls" }
}

function* passToolCall(deliveryId: string): Iterable<ProviderEvent> {
  yield {
    type: "tool_call_start",
    index: 0,
    toolCallId: "call_team_delegation_pass"
  }
  yield {
    type: "tool_call_delta",
    toolCallId: "call_team_delegation_pass",
    toolNameDelta: "team_pass",
    inputJsonDelta: JSON.stringify({
      deliveryId,
      reason: "Delegated evidence does not require a public reply."
    })
  }
  yield {
    type: "tool_call_end",
    toolCallId: "call_team_delegation_pass"
  }
  yield { type: "finish", reason: "tool_calls" }
}

export function delegationResultFromRequest(
  request: ProviderRequest
): Readonly<Record<string, JsonValue>> | undefined {
  return toolResultJsonFromRequest(request, "team.delegation_result")
}

function toolResultJsonFromRequest(
  request: ProviderRequest,
  kind: string
): Readonly<Record<string, JsonValue>> | undefined {
  for (const message of request.messages) {
    if (message.role !== "tool") continue
    for (const part of message.content) {
      if (part.type !== "tool_result") continue
      for (const content of part.content) {
        if (
          content.type === "json" &&
          isRecord(content.value) &&
          content.value.kind === kind
        ) {
          return content.value
        }
      }
    }
  }
  return undefined
}

function requireTeamPassDeliveryId(request: ProviderRequest): string {
  for (const tool of request.tools ?? []) {
    if (tool.name !== "team_pass") continue
    const properties = tool.inputSchema.properties
    if (
      isUnknownRecord(properties) &&
      isUnknownRecord(properties.deliveryId) &&
      typeof properties.deliveryId.const === "string"
    ) {
      return properties.deliveryId.const
    }
  }
  throw new Error("resumed lead request has no exact team_pass delivery id")
}

function requestText(request: ProviderRequest): string {
  return request.messages
    .flatMap((message) => message.content)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value === undefined || value === null) throw new Error(`${label} is missing`)
  return value
}
