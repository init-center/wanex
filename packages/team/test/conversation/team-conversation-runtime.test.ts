import { createHash } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { TeamConversationMode } from "@wanex/protocol"
import { WanexJobRuntime } from "@wanex/runtime/jobs"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import {
  registerTeamDeliveryOutcomeWorkerHandler,
  registerTeamDeliveryWorkerHandler,
  TeamConversationRuntime
} from "../../src/conversation/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const clients: StorageTestStore[] = []

afterEach(async () => {
  while (clients.length > 0) await clients.pop()?.dispose()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("@wanex/team/conversation", () => {
  it("routes orchestrated typed targets without an implicit observer delivery", async () => {
    const runtime = await createRuntime()
    const conversation = await runtime.createConversation({ mode: "orchestrated" })
    const user = await runtime.addParticipant({
      conversationId: conversation.id,
      principalId: "orchestrated_user",
      kind: "user"
    })
    const lead = await addAgent(runtime, {
      conversationId: conversation.id,
      principalId: "orchestrated_lead"
    })
    const direct = await addAgent(runtime, {
      conversationId: conversation.id,
      principalId: "orchestrated_direct"
    })
    await runtime.setConversationLead({
      conversationId: conversation.id,
      leadParticipantId: lead.id
    })

    const leadRoute = await runtime.submitOrchestratedMessage({
      idempotencyKey: "orchestrated-default-route",
      message: {
        id: "orchestrated_default_message",
        conversationId: conversation.id,
        authorParticipantId: user.id,
        targets: [],
        content: [{ type: "text", id: "orchestrated_default_part", text: "Plan this." }]
      }
    })
    expect(leadRoute).toMatchObject({
      created: true,
      decision: {
        mode: "orchestrated",
        leadParticipantId: lead.id
      },
      deliveries: [{
        targetParticipantId: lead.id,
        role: "speaker",
        trigger: "lead"
      }]
    })
    expect(leadRoute.deliveries).toHaveLength(1)

    await expect(runtime.submitOrchestratedMessage({
      idempotencyKey: "orchestrated-explicit-lead-route",
      message: {
        id: "orchestrated_explicit_lead_message",
        conversationId: conversation.id,
        authorParticipantId: user.id,
        targets: [{ kind: "lead" }],
        content: [{
          type: "text",
          id: "orchestrated_explicit_lead_part",
          text: "Lead, take this."
        }]
      }
    })).resolves.toMatchObject({
      decision: { leadParticipantId: lead.id },
      deliveries: [{ targetParticipantId: lead.id, trigger: "lead" }]
    })

    const directRoute = await runtime.submitOrchestratedMessage({
      idempotencyKey: "orchestrated-direct-route",
      message: {
        id: "orchestrated_direct_message",
        conversationId: conversation.id,
        authorParticipantId: user.id,
        targets: [{ kind: "participant", participantId: direct.id }],
        content: [{ type: "text", id: "orchestrated_direct_part", text: "Answer this." }]
      }
    })
    expect(directRoute).toMatchObject({
      decision: { leadParticipantId: lead.id },
      deliveries: [{
        targetParticipantId: direct.id,
        role: "speaker",
        trigger: "direct"
      }]
    })
    expect(directRoute.deliveries).toHaveLength(1)
    expect(directRoute.deliveries).not.toContainEqual(
      expect.objectContaining({ targetParticipantId: lead.id })
    )

    await runtime.updateParticipantState(direct.id, "muted")
    await expect(runtime.submitOrchestratedMessage({
      idempotencyKey: "orchestrated-inactive-target",
      message: {
        id: "orchestrated_inactive_target_message",
        conversationId: conversation.id,
        authorParticipantId: user.id,
        targets: [{ kind: "participant", participantId: direct.id }],
        content: [{
          type: "text",
          id: "orchestrated_inactive_target_part",
          text: "Do not dispatch this."
        }]
      }
    })).rejects.toThrow(/target must be an active agent/)
  })

  it("recovers a committed orchestrated route from durable lead evidence", async () => {
    const runtime = await createRuntime()
    const conversation = await runtime.createConversation({ mode: "orchestrated" })
    const user = await runtime.addParticipant({
      conversationId: conversation.id,
      principalId: "orchestrated_recovery_user",
      kind: "user"
    })
    const firstLead = await addAgent(runtime, {
      conversationId: conversation.id,
      principalId: "orchestrated_recovery_first"
    })
    const secondLead = await addAgent(runtime, {
      conversationId: conversation.id,
      principalId: "orchestrated_recovery_second"
    })
    await runtime.setConversationLead({
      conversationId: conversation.id,
      leadParticipantId: firstLead.id
    })
    const storage = clients.at(-1)
    if (storage === undefined) throw new Error("team test storage is unavailable")
    let loseResponse = true
    const interruptedStorage = new Proxy(storage, {
      get(target, property, receiver) {
        if (property === "routeTeamMessage") {
          return async (...args: Parameters<StorageTestStore["routeTeamMessage"]>) => {
            const receipt = await target.routeTeamMessage(...args)
            if (loseResponse) {
              loseResponse = false
              throw new Error("simulated response loss after route commit")
            }
            return receipt
          }
        }
        const value = Reflect.get(target, property, receiver) as unknown
        return typeof value === "function" ? value.bind(target) : value
      }
    })
    const interrupted = new TeamConversationRuntime({
      storage: interruptedStorage,
      principalId: "team_runtime"
    })
    const request = {
      idempotencyKey: "orchestrated-response-loss",
      message: {
        id: "orchestrated_response_loss_message",
        conversationId: conversation.id,
        authorParticipantId: user.id,
        targets: [],
        content: [{
          type: "text" as const,
          id: "orchestrated_response_loss_part",
          text: "Recover this route."
        }]
      }
    }
    await expect(interrupted.submitOrchestratedMessage(request)).rejects
      .toThrow(/response loss/)

    await runtime.setConversationLead({
      conversationId: conversation.id,
      expectedLeadParticipantId: firstLead.id,
      leadParticipantId: secondLead.id
    })
    const recovered = await interrupted.submitOrchestratedMessage(request)
    expect(recovered).toMatchObject({
      created: false,
      decision: { leadParticipantId: firstLead.id },
      deliveries: [{ targetParticipantId: firstLead.id, trigger: "lead" }]
    })
    expect(recovered.deliveries).toHaveLength(1)
  })

  it("keeps unroutable orchestrated messages admitted for explicit recovery", async () => {
    const runtime = await createRuntime()
    const conversation = await runtime.createConversation({ mode: "orchestrated" })
    const user = await runtime.addParticipant({
      conversationId: conversation.id,
      principalId: "orchestrated_blocked_user",
      kind: "user"
    })
    await addAgent(runtime, {
      conversationId: conversation.id,
      principalId: "orchestrated_unassigned_agent"
    })
    await expect(runtime.submitOrchestratedMessage({
      idempotencyKey: "orchestrated-missing-lead",
      message: {
        id: "orchestrated_missing_lead_message",
        conversationId: conversation.id,
        authorParticipantId: user.id,
        targets: [],
        content: [{ type: "text", id: "orchestrated_missing_lead_part", text: "Wait." }]
      }
    })).rejects.toThrow(/requires an active lead/)
    await expect(runtime.getMessage("orchestrated_missing_lead_message")).resolves
      .toMatchObject({ state: "admitted", revision: 1 })
  })

  it("forwards canonical Team lead compare-and-set semantics", async () => {
    const runtime = await createRuntime()
    const conversation = await runtime.createConversation({ mode: "orchestrated" })
    const first = await addAgent(runtime, {
      conversationId: conversation.id,
      principalId: "lead_runtime_first"
    })
    const second = await addAgent(runtime, {
      conversationId: conversation.id,
      principalId: "lead_runtime_second"
    })

    await expect(runtime.setConversationLead({
      conversationId: conversation.id,
      leadParticipantId: first.id
    })).resolves.toMatchObject({ leadParticipantId: first.id })
    await expect(runtime.setConversationLead({
      conversationId: conversation.id,
      leadParticipantId: second.id
    })).rejects.toThrow(/lead changed/)
    await expect(runtime.setConversationLead({
      conversationId: conversation.id,
      expectedLeadParticipantId: first.id,
      leadParticipantId: second.id
    })).resolves.toMatchObject({ leadParticipantId: second.id })
    await expect(runtime.getConversation(conversation.id)).resolves.toMatchObject({
      leadParticipantId: second.id
    })
  })

  it("records durable message routing and queued delivery state", async () => {
    const runtime = await createRuntime()
    const conversation = await runtime.createConversation({
      title: "Runtime team",
      mode: "hybrid",
      idempotencyKey: "runtime-team-conversation"
    })
    const user = await runtime.addParticipant({
      id: "runtime_team_user",
      conversationId: conversation.id,
      principalId: "user_runtime",
      kind: "user"
    })
    const agent = await addAgent(runtime, {
      id: "runtime_team_agent",
      conversationId: conversation.id,
      principalId: "agent_runtime"
    })
    const request = {
      id: "runtime_team_message",
      conversationId: conversation.id,
      authorParticipantId: user.id,
      targets: [{ kind: "participant" as const, participantId: agent.id }],
      content: [{
        type: "text" as const,
        id: "part_runtime_team",
        text: "Please review this."
      }],
      metadata: { source: "runtime-test" },
      idempotencyKey: "runtime-team-message"
    }
    const message = await runtime.admitMessage(request)
    await expect(runtime.admitMessage(request)).resolves.toMatchObject({
      id: message.id,
      revision: 1
    })
    expect(message).toMatchObject({
      state: "admitted",
      revision: 1,
      targets: [{ kind: "participant", participantId: agent.id }]
    })

    const route = {
      id: "runtime_team_route",
      messageId: message.id,
      expectedRevision: 1,
      mode: "hybrid" as const,
      outcome: "deliver" as const,
      actorPrincipalId: "team_runtime",
      reason: "Explicit participant target",
      idempotencyKey: "runtime-team-route",
      deliveries: [{
        id: "runtime_team_delivery",
        targetParticipantId: agent.id,
        role: "speaker" as const,
        trigger: "mention" as const
      }]
    }
    const routed = await runtime.routeMessage(route)
    expect(routed).toMatchObject({
      created: true,
      message: { state: "routed", revision: 2 },
      round: {
        state: "open",
        expectedDeliveryCount: 1
      },
      deliveries: [{
        id: "runtime_team_delivery",
        discussionRoundId: expect.any(String),
        state: "queued",
        targetSessionId: "ses_runtime_team_agent",
        dispatchJobId: expect.any(String)
      }],
      dispatchJobs: [{ kind: "team.delivery", state: "ready" }]
    })
    await expect(runtime.routeMessage(route)).resolves.toMatchObject({
      created: false,
      decision: { id: routed.decision.id },
      deliveries: [{ id: routed.deliveries[0]?.id }]
    })
    await expect(runtime.getRoutingDecisionByMessage(message.id)).resolves
      .toMatchObject({ id: "runtime_team_route" })
    await expect(runtime.listRoutingDecisions({
      conversationId: conversation.id
    })).resolves.toHaveLength(1)
    await expect(runtime.listDeliveries({ messageId: message.id })).resolves
      .toMatchObject([{ id: "runtime_team_delivery", state: "queued" }])
    const roundId = routed.round?.id
    if (roundId === undefined) throw new Error("deliver route is missing its discussion round")
    await expect(runtime.getDiscussionRound(roundId)).resolves.toMatchObject({
      id: roundId,
      state: "open"
    })
    await expect(runtime.listDiscussionRounds({
      conversationId: conversation.id,
      state: "open"
    })).resolves.toMatchObject([{ id: roundId }])
    await expect(runtime.readConversationPage({
      conversationId: conversation.id,
      limit: 20
    })).resolves.toMatchObject({
      conversation: { id: conversation.id },
      participants: [{ id: user.id }, { id: agent.id }],
      messages: [{ id: message.id }],
      routingDecisions: [{ id: routed.decision.id }],
      rounds: [{ id: roundId, state: "open" }],
      deliveries: [{ id: "runtime_team_delivery" }]
    })

    const storage = clients.at(-1)
    if (storage === undefined) throw new Error("team test storage is unavailable")
    const jobs = new WanexJobRuntime({
      storage,
      workerId: "runtime_team_materializer",
      leaseMs: 60_000,
      kinds: ["team.delivery"]
    })
    registerTeamDeliveryWorkerHandler(jobs.worker, {
      storage,
      turnStorage: storage,
      resolveExecutionBinding: ({ context }) => ({
        prepared: {
          binding: testTurnBinding(context.delivery.id),
          context: { commit() {}, rollback() {} }
        },
        maxSteps: 8
      })
    })
    await expect(jobs.runWorkerOnce()).resolves.toMatchObject({
      status: "completed",
      job: { kind: "team.delivery", state: "succeeded" }
    })
    const materializedDeliveries = await runtime.listDeliveries({
      messageId: message.id
    })
    expect(materializedDeliveries).toMatchObject([{
        id: "runtime_team_delivery",
        state: "dispatched",
        childTurnId: "turn_team_runtime_team_delivery"
      }])
    const materializedDelivery = materializedDeliveries[0]
    if (
      materializedDelivery?.childInputId === undefined ||
      materializedDelivery.childTurnId === undefined ||
      materializedDelivery.childTurnJobId === undefined
    ) {
      throw new Error("materialized Team delivery is missing child turn identities")
    }
    await storage.requestSessionTurnCancel({
      sessionId: materializedDelivery.targetSessionId,
      turnId: materializedDelivery.childTurnId,
      inputId: materializedDelivery.childInputId,
      jobId: materializedDelivery.childTurnJobId,
      reason: "Team outcome worker test"
    })
    const outcomeJobs = new WanexJobRuntime({
      storage,
      workerId: "runtime_team_outcome_projector",
      leaseMs: 60_000,
      kinds: ["team.delivery.outcome"]
    })
    registerTeamDeliveryOutcomeWorkerHandler(outcomeJobs.worker, { storage })
    await expect(outcomeJobs.runWorkerOnce()).resolves.toMatchObject({
      status: "completed",
      job: { kind: "team.delivery.outcome", state: "succeeded" }
    })
    await expect(runtime.listDeliveries({ messageId: message.id })).resolves
      .toMatchObject([{
        id: "runtime_team_delivery",
        state: "cancelled",
        outcomeJobId: expect.any(String),
        finishedAt: expect.any(Number)
      }])
    await expect(runtime.getDiscussionRound(roundId)).resolves.toMatchObject({
      state: "closed",
      outcome: "cancelled",
      result: {
        expected: 1,
        responded: 0,
        passed: 0,
        failed: 0,
        cancelled: 1
      },
      closedAt: expect.any(Number)
    })
    await expect(runtime.readConversationPage({
      conversationId: conversation.id
    })).resolves.toMatchObject({
      rounds: [{ id: roundId, state: "closed", outcome: "cancelled" }],
      deliveries: [{ id: "runtime_team_delivery", state: "cancelled" }]
    })

    await expect(runtime.routeMessage({
      ...route,
      id: "runtime_team_route_conflict",
      outcome: "blocked",
      reason: "Conflicting route",
      idempotencyKey: "runtime-team-route-conflict",
      deliveries: []
    })).rejects.toThrow(/routing conflict/)
  })

  it("persists blocked decisions without creating deliveries", async () => {
    const runtime = await createRuntime()
    const conversation = await runtime.createConversation({ mode: "peer" })
    const user = await runtime.addParticipant({
      conversationId: conversation.id,
      principalId: "blocked_user",
      kind: "user"
    })
    const blocked = await runtime.submitRoutedMessage({
      idempotencyKey: "blocked-submit",
      message: {
        conversationId: conversation.id,
        authorParticipantId: user.id,
        targets: [{ kind: "all" }],
        content: [{ type: "text", id: "blocked_part", text: "Ask everyone" }]
      },
      route: {
        mode: "peer",
        outcome: "blocked",
        actorPrincipalId: "team_runtime",
        reason: "No eligible participants",
        deliveries: []
      }
    })
    expect(blocked).toMatchObject({
      message: { state: "blocked", revision: 2 },
      decision: { outcome: "blocked" },
      deliveries: []
    })
    expect(blocked).not.toHaveProperty("round")
    await expect(runtime.listDeliveries({ messageId: blocked.message.id })).resolves
      .toEqual([])
  })

  it("recovers the submit saga after admission and fences changed replay payload", async () => {
    const runtime = await createRuntime()
    const conversation = await runtime.createConversation({ mode: "peer" })
    const user = await runtime.addParticipant({
      conversationId: conversation.id,
      principalId: "submit_user",
      kind: "user"
    })
    const agent = await addAgent(runtime, {
      conversationId: conversation.id,
      principalId: "submit_agent"
    })
    const storage = clients.at(-1)
    if (storage === undefined) throw new Error("team test storage is unavailable")
    let failRouteOnce = true
    const interruptedStorage = new Proxy(storage, {
      get(target, property, receiver) {
        if (property === "routeTeamMessage") {
          return async (...args: Parameters<StorageTestStore["routeTeamMessage"]>) => {
            if (failRouteOnce) {
              failRouteOnce = false
              throw new Error("simulated process exit after admission")
            }
            return await target.routeTeamMessage(...args)
          }
        }
        const value = Reflect.get(target, property, receiver) as unknown
        return typeof value === "function" ? value.bind(target) : value
      }
    })
    const interrupted = new TeamConversationRuntime({
      storage: interruptedStorage,
      principalId: "team_runtime"
    })
    const request = {
      idempotencyKey: "recoverable-submit",
      message: {
        conversationId: conversation.id,
        authorParticipantId: user.id,
        targets: [{ kind: "participant" as const, participantId: agent.id }],
        content: [{ type: "text" as const, id: "submit_part", text: "Review this." }]
      },
      route: {
        mode: "peer" as const,
        outcome: "deliver" as const,
        actorPrincipalId: "team_runtime",
        reason: "Explicit submit target",
        deliveries: [{
          targetParticipantId: agent.id,
          role: "speaker" as const,
          trigger: "direct" as const
        }]
      }
    }
    await expect(interrupted.submitRoutedMessage(request)).rejects
      .toThrow(/simulated process exit/)
    await expect(runtime.listMessages({ conversationId: conversation.id })).resolves
      .toMatchObject([{ state: "admitted", revision: 1 }])

    const recovered = await interrupted.submitRoutedMessage(request)
    expect(recovered).toMatchObject({
      created: true,
      message: { state: "routed", revision: 2 },
      round: { state: "open", expectedDeliveryCount: 1 },
      deliveries: [{ targetParticipantId: agent.id }]
    })
    await expect(interrupted.submitRoutedMessage(request)).resolves.toMatchObject({
      created: false,
      decision: { id: recovered.decision.id },
      round: { id: recovered.round?.id },
      deliveries: [{ id: recovered.deliveries[0]?.id }]
    })
    await expect(interrupted.submitRoutedMessage({
      ...request,
      route: { ...request.route, reason: "Changed replay" }
    })).rejects.toThrow(/different content/)
    await expect(interrupted.submitRoutedMessage({
      ...request,
      idempotencyKey: " "
    })).rejects.toThrow(/idempotency key/)
    await expect(runtime.listDiscussionRounds({
      conversationId: conversation.id
    })).resolves.toHaveLength(1)
    await expect(runtime.listDeliveries({
      conversationId: conversation.id
    })).resolves.toHaveLength(1)
    const routeEvents = (await storage.queryEvents({ limit: 100 }))
      .filter((event) =>
        event.type === "team.message.routed" &&
        (event.payload as Record<string, unknown>).messageId === recovered.message.id
      )
    expect(routeEvents).toHaveLength(1)
  })

  it("rejects cross-conversation targets and inactive authors", async () => {
    const runtime = await createRuntime()
    const first = await runtime.createConversation({ mode: "hybrid" })
    const second = await runtime.createConversation({ mode: "hybrid" })
    const user = await runtime.addParticipant({
      conversationId: first.id,
      principalId: "user_first",
      kind: "user"
    })
    const foreign = await addAgent(runtime, {
      conversationId: second.id,
      principalId: "agent_second"
    })
    await expect(runtime.admitMessage({
      conversationId: first.id,
      authorParticipantId: user.id,
      targets: [{ kind: "participant", participantId: foreign.id }],
      content: [{ type: "text", id: "cross_part", text: "Cross" }],
      idempotencyKey: "cross-message"
    })).rejects.toThrow(/target participant must belong/)

    await runtime.updateParticipantState(user.id, "muted")
    await expect(runtime.admitMessage({
      conversationId: first.id,
      authorParticipantId: user.id,
      targets: [],
      content: [{ type: "text", id: "muted_part", text: "Muted" }],
      idempotencyKey: "muted-message"
    })).rejects.toThrow(/author must be active/)
  })

  it("uses product-neutral modes and rejects removed spellings", async () => {
    const runtime = await createRuntime()
    for (const mode of ["orchestrated", "peer", "hybrid"] as const) {
      await expect(runtime.createConversation({ id: `team_${mode}`, mode }))
        .resolves.toMatchObject({ mode })
    }
    for (const mode of ["tl", "free"] as const) {
      await expect(runtime.createConversation({
        id: `team_removed_${mode}`,
        mode: mode as unknown as TeamConversationMode
      })).rejects.toThrow(/did not match|invalid team conversation mode/)
    }
  })

  it("lists message history through a stable bounded cursor", async () => {
    const runtime = await createRuntime()
    const conversation = await runtime.createConversation({ mode: "peer" })
    const participant = await addAgent(runtime, {
      conversationId: conversation.id,
      principalId: "agent_cursor"
    })
    const messages = []
    for (let index = 0; index < 3; index += 1) {
      messages.push(await runtime.admitMessage({
        id: `team_cursor_message_${index}`,
        conversationId: conversation.id,
        authorParticipantId: participant.id,
        targets: [],
        content: [{
          type: "text",
          id: `team_cursor_part_${index}`,
          text: `Message ${index}`
        }],
        idempotencyKey: `team-cursor-message-${index}`
      }))
    }

    await expect(runtime.listMessages({
      conversationId: conversation.id,
      limit: 2
    })).resolves.toHaveLength(2)
    const cursor = messages[1]
    const expected = messages[2]
    if (cursor === undefined || expected === undefined) {
      throw new Error("expected three durable Team messages")
    }
    await expect(runtime.listMessages({
      conversationId: conversation.id,
      afterCreatedAt: cursor.createdAt,
      afterMessageId: cursor.id,
      limit: 2
    })).resolves.toMatchObject([{ id: expected.id }])
  })
})

async function createRuntime(): Promise<TeamConversationRuntime> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-team-conversation-"))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  return new TeamConversationRuntime({ storage, principalId: "team_runtime" })
}

async function addAgent(
  runtime: TeamConversationRuntime,
  request: {
    readonly id?: string
    readonly conversationId: string
    readonly principalId: string
  }
) {
  const storage = clients.at(-1)
  if (storage === undefined) throw new Error("team test storage is unavailable")
  const participantId = request.id ?? `team_agent_${request.principalId}`
  const sessionId = `ses_${participantId}`
  await storage.createSession({ id: sessionId, kind: "agent" })
  return await runtime.addParticipant({
    ...request,
    id: participantId,
    kind: "agent",
    agentSessionId: sessionId
  })
}

function testTurnBinding(label: string) {
  const endpoint = {
    id: `endpoint_${label}`,
    connection: { id: `connection_${label}`, providerId: "fake" },
    protocol: { id: "fake" },
    model: {
      id: `model_${label}`,
      operations: ["conversation"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: [],
      catalog: {
        source: "custom",
        catalogId: `team.test.${label}`,
        revision: "1"
      }
    }
  } as const
  const binding = {
    createdAt: 1,
    modelEndpoint: {
      endpointId: endpoint.id,
      endpointDigest: digestJson(endpoint),
      connection: endpoint.connection,
      protocol: endpoint.protocol,
      model: endpoint.model
    },
    completion: { maxOutputTokens: 4_096 },
    capabilityRoutes: [],
    resources: [],
    recovery: {
      providerMaxAttempts: 1,
      idempotentToolMaxAttempts: 1
    }
  }
  return { digest: digestJson(binding), ...binding }
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)])
    )
  }
  return value
}
