import { rm } from "node:fs/promises"
import { afterEach, describe, expect, it } from "vitest"
import type {
  TeamDelegationOperationRecord,
  TeamDeliveryRecord,
  TeamDiscussionRoundRecord,
  ToolExecutionRecord
} from "@wanex/protocol"
import type { WanexRuntimeHost } from "@wanex/runtime/host"
import type { StorageTestStore } from "@wanex/storage/testing"
import type {
  TeamConversationExecutionHost,
  TeamConversationRuntime
} from "../../src/conversation/index.js"
import {
  createJourneyHosts,
  createJourneyStore,
  createOrchestratedFixture,
  delegationResultFromRequest,
  requireValue,
  TeamDelegationProvider,
  type TeamDelegationFixture,
  type TeamDelegationJourneyHosts,
  type TeamDelegationProviderOptions
} from "./team-delegation-fixture.js"

interface JourneyCleanup {
  readonly storeDir: string
  readonly storage: StorageTestStore
  readonly agentHosts: WanexRuntimeHost[]
  readonly teamHosts: TeamConversationExecutionHost[]
}

interface SuspendedDelegationJourney extends TeamDelegationJourneyHosts {
  readonly cleanup: JourneyCleanup
  readonly storage: StorageTestStore
  readonly provider: TeamDelegationProvider
  readonly fixture: TeamDelegationFixture
  readonly round: TeamDiscussionRoundRecord
  readonly sourceDelivery: TeamDeliveryRecord
  readonly parentTurnId: string
  readonly parentInputId: string
  readonly parentJobId: string
  readonly delegationTool: ToolExecutionRecord
  readonly operation: TeamDelegationOperationRecord
}

const cleanups: JourneyCleanup[] = []

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup === undefined) continue
    for (const host of cleanup.teamHosts.reverse()) await host.dispose()
    for (const host of cleanup.agentHosts.reverse()) await host.dispose()
    await cleanup.storage.dispose()
    await rm(cleanup.storeDir, { recursive: true, force: true })
  }
})

describe("durable Team lead delegation journey", () => {
  it("resumes the same lead Turn and publishes one summary after bounded collection", async () => {
    const journey = await suspendLeadForDelegation("summary")

    expect(journey.provider.initialLeadRequests).toHaveLength(1)
    expect(journey.delegationTool.state).toBe("waiting")
    expect(journey.operation).toMatchObject({
      parentTurnId: journey.parentTurnId,
      parentSessionJobId: journey.parentJobId,
      sourceDeliveryId: journey.sourceDelivery.id,
      state: "running"
    })
    await expectRoundOpenWithoutDelegatedMessages(journey)

    const childRun = await completeDelegatedChildren(journey)
    expect(childRun.results.filter(
      (result) => result.worker.status === "completed"
    )).toHaveLength(2)
    expect(journey.provider.childRequests).toHaveLength(2)
    const collection = await expectDelegationCollection(journey, "succeeded")
    expect(collection.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ state: "succeeded" }),
      expect.objectContaining({ state: "succeeded" })
    ]))
    await expectRoundOpenWithoutDelegatedMessages(journey)

    await completeLeadAndProjectOutcome(journey)
    expect(journey.provider.resumedLeadRequests).toHaveLength(1)
    expect(delegationResultFromRequest(
      journey.provider.resumedLeadRequests[0]!
    )).toMatchObject({
      kind: "team.delegation_result",
      graphState: "succeeded"
    })
    await expectSingleLeadSummary(journey)
    await expect(journey.teamHost.runOnce()).resolves.toMatchObject([{
      status: "idle"
    }])
    await expectSingleLeadSummary(journey)
  })

  it("summarizes partial failure for the source lead after in-flight reassignment", async () => {
    const journey = await suspendLeadForDelegation("partial", {
      failedChild: "review"
    })
    await journey.runtime.setConversationLead({
      conversationId: journey.fixture.conversationId,
      expectedLeadParticipantId: journey.fixture.lead.id,
      leadParticipantId: journey.fixture.research.id
    })

    const childRun = await completeDelegatedChildren(journey)
    expect(childRun.results.filter(
      (result) => result.worker.status === "failed"
    )).toHaveLength(1)
    const collection = await expectDelegationCollection(journey, "failed")
    expect(collection.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ state: "succeeded" }),
      expect.objectContaining({ state: "failed" })
    ]))
    expect(JSON.stringify(collection)).not.toContain("Controlled review failure")

    await completeLeadAndProjectOutcome(journey)
    await expectSingleLeadSummary(journey)
    expect(await journey.runtime.getConversation(journey.fixture.conversationId))
      .toMatchObject({ leadParticipantId: journey.fixture.research.id })
  })

  it("closes the round as passed without creating a public reply", async () => {
    const journey = await suspendLeadForDelegation("pass", {
      finalOutcome: "pass"
    })
    await completeDelegatedChildren(journey)
    await journey.agentHost.runOnce()
    expect(journey.provider.resumedLeadRequests).toHaveLength(1)
    expect(journey.provider.passCompletionRequests).toHaveLength(1)
    await journey.teamHost.runOnce()

    expect(await journey.runtime.listMessages({
      conversationId: journey.fixture.conversationId
    })).toHaveLength(1)
    expect(await journey.runtime.listDeliveries({
      messageId: journey.sourceDelivery.messageId
    })).toMatchObject([{
      id: journey.sourceDelivery.id,
      state: "passed",
      targetParticipantId: journey.fixture.lead.id
    }])
    expect(await journey.runtime.getDiscussionRound(journey.round.id)).toMatchObject({
      state: "closed",
      outcome: "completed",
      result: {
        expected: 1,
        responded: 0,
        passed: 1,
        failed: 0,
        cancelled: 0
      }
    })
  })

  it("propagates queued child cancellation and closes without a fake reply", async () => {
    const journey = await suspendLeadForDelegation("cancel")
    const cancellation = await journey.agentHost.requestSessionTurnCancel({
      sessionId: journey.fixture.leadSessionId,
      turnId: journey.parentTurnId,
      inputId: journey.parentInputId,
      jobId: journey.parentJobId,
      reason: "Cancel delegated Team work"
    })
    expect(cancellation).toMatchObject({
      status: "cancel_requested",
      cascadeJobIds: [],
      turn: { id: journey.parentTurnId, state: "cancel_requested" },
      job: { id: journey.parentJobId, state: "ready" }
    })
    expect(await journey.storage.getTeamDelegationOperation({
      operationId: journey.operation.id
    })).toMatchObject({ state: "cancelled" })
    expect(await journey.storage.getToolExecution(journey.delegationTool.id))
      .toMatchObject({ state: "failed", isError: true })

    const parentRun = await journey.agentHost.runOnce()
    expect(parentRun.results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        worker: expect.objectContaining({
          status: "completed",
          job: expect.objectContaining({
            id: journey.parentJobId,
            state: "cancelled"
          })
        })
      })
    ]))
    await journey.teamHost.runOnce()
    expect(await journey.runtime.listMessages({
      conversationId: journey.fixture.conversationId
    })).toHaveLength(1)
    expect(await journey.runtime.listDeliveries({
      messageId: journey.sourceDelivery.messageId
    })).toMatchObject([{
      id: journey.sourceDelivery.id,
      state: "cancelled"
    }])
    expect(await journey.runtime.getDiscussionRound(journey.round.id)).toMatchObject({
      state: "closed",
      outcome: "cancelled",
      result: {
        expected: 1,
        responded: 0,
        passed: 0,
        failed: 0,
        cancelled: 1
      }
    })
  })

  it("recovers a collected lead Turn after host restart without duplicate output", async () => {
    const journey = await suspendLeadForDelegation("restart")
    await completeDelegatedChildren(journey)
    await journey.teamHost.dispose()
    await journey.agentHost.dispose()

    const restarted = createJourneyHosts(journey.storage, journey.provider)
    journey.cleanup.agentHosts.push(restarted.agentHost)
    journey.cleanup.teamHosts.push(restarted.teamHost)
    await restarted.agentHost.runOnce()
    await restarted.teamHost.runOnce()

    await expectSingleLeadSummary({ ...journey, ...restarted })
    expect(await journey.storage.listSessionAttempts({
      turnId: journey.parentTurnId
    })).toHaveLength(2)
    expect(journey.provider.initialLeadRequests).toHaveLength(1)
    expect(journey.provider.resumedLeadRequests).toHaveLength(1)
  })
})

async function suspendLeadForDelegation(
  suffix: string,
  providerOptions: TeamDelegationProviderOptions = {}
): Promise<SuspendedDelegationJourney> {
  const { storeDir, storage } = await createJourneyStore()
  const provider = new TeamDelegationProvider(providerOptions)
  const hosts = createJourneyHosts(storage, provider)
  const cleanup: JourneyCleanup = {
    storeDir,
    storage,
    agentHosts: [hosts.agentHost],
    teamHosts: [hosts.teamHost]
  }
  cleanups.push(cleanup)
  const fixture = await createOrchestratedFixture(storage, hosts.runtime, suffix)
  provider.setTargets(fixture.research.id, fixture.review.id)
  const routed = await hosts.runtime.submitOrchestratedMessage({
    idempotencyKey: `team-delegation-${suffix}`,
    message: {
      conversationId: fixture.conversationId,
      authorParticipantId: fixture.user.id,
      targets: [],
      content: [{
        type: "text",
        id: `part_team_delegation_${suffix}`,
        text: "Research and review this request, then return one outcome."
      }]
    }
  })
  const round = requireValue(routed.round, "orchestrated discussion round")
  const sourceDelivery = requireValue(
    routed.deliveries[0],
    "orchestrated lead delivery"
  )
  expect(routed.deliveries).toHaveLength(1)
  expect(round).toMatchObject({ state: "open", expectedDeliveryCount: 1 })

  const materialization = await hosts.teamHost.runOnce()
  expect(materialization, JSON.stringify(materialization, null, 2)).toMatchObject([{
    status: "completed",
    job: { kind: "team.delivery", state: "succeeded" }
  }])
  const dispatched = requireValue(
    (await hosts.runtime.listDeliveries({ messageId: routed.message.id }))[0],
    "materialized lead delivery"
  )
  const parentTurnId = requireValue(dispatched.childTurnId, "lead Turn id")
  const parentInputId = requireValue(dispatched.childInputId, "lead input id")
  const parentJobId = requireValue(dispatched.childTurnJobId, "lead job id")
  const initialLeadRun = await hosts.agentHost.runOnce()
  expect(initialLeadRun.results).toEqual(expect.arrayContaining([
    expect.objectContaining({
      worker: expect.objectContaining({
        status: "completed",
        job: expect.objectContaining({ id: parentJobId, state: "waiting" })
      })
    })
  ]))
  const delegationTool = requireValue(
    (await storage.listToolExecutions({
      sessionId: fixture.leadSessionId,
      turnId: parentTurnId
    })).find((execution) => execution.toolName === "team_delegate"),
    "delegation Tool execution"
  )
  const operation = requireValue(
    await storage.getTeamDelegationOperationByToolExecution({
      toolExecutionId: delegationTool.id
    }),
    "Team delegation operation"
  )
  return {
    ...hosts,
    cleanup,
    storage,
    provider,
    fixture,
    round,
    sourceDelivery,
    parentTurnId,
    parentInputId,
    parentJobId,
    delegationTool,
    operation
  }
}

async function completeDelegatedChildren(
  journey: SuspendedDelegationJourney
): Promise<Awaited<ReturnType<WanexRuntimeHost["runOnce"]>>> {
  return await journey.agentHost.runOnce()
}

async function completeLeadAndProjectOutcome(
  journey: SuspendedDelegationJourney
): Promise<void> {
  const resumed = await journey.agentHost.runOnce()
  expect(resumed.results).toEqual(expect.arrayContaining([
    expect.objectContaining({
      worker: expect.objectContaining({
        status: "completed",
        job: expect.objectContaining({
          id: journey.parentJobId,
          state: "succeeded"
        })
      })
    })
  ]))
  expect(await journey.storage.listSessionTurns({
    sessionId: journey.fixture.leadSessionId
  })).toMatchObject([{
    id: journey.parentTurnId,
    state: "succeeded"
  }])
  expect(await journey.storage.listSessionAttempts({
    turnId: journey.parentTurnId
  })).toHaveLength(2)
  expect(await journey.runtime.getDiscussionRound(journey.round.id))
    .toMatchObject({ state: "open" })
  const projected = await journey.teamHost.runOnce()
  expect(projected).toMatchObject([{
    status: "completed",
    job: { kind: "team.delivery.outcome", state: "succeeded" }
  }])
}

async function expectDelegationCollection(
  journey: SuspendedDelegationJourney,
  graphState: "succeeded" | "failed"
): Promise<Record<string, unknown>> {
  const tool = await journey.storage.getToolExecution(journey.delegationTool.id)
  expect(tool).toMatchObject({ state: "succeeded", isError: false })
  const content = tool?.content?.[0]
  if (content?.type !== "json" || !isUnknownRecord(content.value)) {
    throw new Error("delegation Tool has no structured collection")
  }
  expect(content.value).toMatchObject({
    kind: "team.delegation_result",
    graphState
  })
  return content.value
}

async function expectRoundOpenWithoutDelegatedMessages(
  journey: SuspendedDelegationJourney
): Promise<void> {
  expect(await journey.runtime.getDiscussionRound(journey.round.id)).toMatchObject({
    state: "open",
    expectedDeliveryCount: 1
  })
  expect(await journey.runtime.listMessages({
    conversationId: journey.fixture.conversationId
  })).toHaveLength(1)
}

async function expectSingleLeadSummary(
  journey: Pick<
    SuspendedDelegationJourney,
    "runtime" | "fixture" | "sourceDelivery" | "round" | "parentTurnId" | "parentJobId"
  >
): Promise<void> {
  const messages = await journey.runtime.listMessages({
    conversationId: journey.fixture.conversationId
  })
  expect(messages).toHaveLength(2)
  expect(messages[1]).toMatchObject({
    authorParticipantId: journey.fixture.lead.id,
    parentMessageId: journey.sourceDelivery.messageId,
    discussionRoundId: journey.round.id,
    content: [{
      type: "text",
      text: "Lead summary from delegated results."
    }]
  })
  expect(await journey.runtime.listDeliveries({
    messageId: journey.sourceDelivery.messageId
  })).toMatchObject([{
    id: journey.sourceDelivery.id,
    targetParticipantId: journey.fixture.lead.id,
    childTurnId: journey.parentTurnId,
    childTurnJobId: journey.parentJobId,
    state: "responded",
    replyMessageId: messages[1]?.id
  }])
  expect(await journey.runtime.getDiscussionRound(journey.round.id)).toMatchObject({
    state: "closed",
    outcome: "completed",
    expectedDeliveryCount: 1,
    result: {
      expected: 1,
      responded: 1,
      passed: 0,
      failed: 0,
      cancelled: 0
    }
  })
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
