import { createHash } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"
import { TeamConversationRuntime } from "@wanex/team/conversation"
import { createLocalTeamConversationAdapter } from "../src/team/adapter.js"
import {
  decodeTeamPageCursor,
  encodeTeamPageCursor
} from "../src/team/cursor.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const stores: StorageTestStore[] = []
const disposers: Array<() => void> = []

afterEach(async () => {
  while (disposers.length > 0) disposers.pop()?.()
  while (stores.length > 0) await stores.pop()?.dispose()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("Local Team conversation adapter", () => {
  it("uses a strict opaque cursor contract", () => {
    const cursor = { createdAt: 1_234, messageId: "tmsg_cursor" }
    const encoded = encodeTeamPageCursor(cursor)

    expect(encoded).not.toContain("tmsg_cursor")
    expect(decodeTeamPageCursor(encoded)).toEqual(cursor)
    expect(() => decodeTeamPageCursor("not+base64url")).toThrow(/cursor is invalid/)
    expect(() => decodeTeamPageCursor(Buffer.from(JSON.stringify({
      createdAt: 1_234,
      messageId: "tmsg_cursor",
      storeDir: "/private/store"
    })).toString("base64url"))).toThrow(/cursor is invalid/)
    expect(() => decodeTeamPageCursor(Buffer.from(JSON.stringify({
      createdAt: -1,
      messageId: "tmsg_cursor"
    })).toString("base64url"))).toThrow(/cursor is invalid/)
  })

  it("recovers create after the conversation commit and isolates listeners", async () => {
    const { runtime, adapter } = await createHarness()
    const idempotencyKey = "team-adapter-partial-create"
    const digest = stableDigest(idempotencyKey)
    const conversationId = `team_assistant_${digest.slice(0, 32)}`
    await runtime.createConversation({
      id: conversationId,
      principalId: "assistant-host-team",
      mode: "peer",
      idempotencyKey: `assistant-team-create:${digest}`
    })

    const observed: string[] = []
    adapter.port.subscribeInvalidations(() => {
      throw new Error("listener failure")
    })
    adapter.port.subscribeInvalidations((event) => observed.push(event.cause))

    const created = await adapter.port.createConversation({
      mode: "discussion",
      idempotencyKey
    })
    const replayed = await adapter.port.createConversation({
      mode: "discussion",
      idempotencyKey
    })
    const participants = await runtime.listParticipants(conversationId)

    expect(created.conversationId).toBe(conversationId)
    expect(replayed.conversationId).toBe(conversationId)
    expect(participants).toMatchObject([{
      kind: "user",
      state: "active",
      principalId: "assistant-host-user",
      displayName: "You"
    }])
    expect(observed).toEqual([
      "conversation_changed",
      "participants_changed",
      "conversation_changed",
      "participants_changed"
    ])

    adapter.dispose()
    adapter.notify({
      conversationId,
      cause: "round_changed",
      at: Date.now()
    })
    expect(observed).toHaveLength(4)
  })

  it("rejects invalid participant operations and a round without agents", async () => {
    const { storage, runtime, adapter } = await createHarness()
    const first = await adapter.port.createConversation({
      mode: "discussion",
      idempotencyKey: "team-adapter-validation-first"
    })
    const second = await adapter.port.createConversation({
      mode: "discussion",
      idempotencyKey: "team-adapter-validation-second"
    })
    const firstUser = (await runtime.listParticipants(first.conversationId))[0]
    const secondUser = (await runtime.listParticipants(second.conversationId))[0]
    if (firstUser === undefined || secondUser === undefined) {
      throw new Error("local Team user setup is incomplete")
    }

    await expect(adapter.port.submitRound({
      conversationId: first.conversationId,
      text: "No agent can receive this.",
      idempotencyKey: "team-adapter-no-agent"
    })).rejects.toThrow(/at least one active agent/)
    await expect(adapter.port.updateParticipant({
      conversationId: first.conversationId,
      participantId: firstUser.id,
      state: "muted"
    })).rejects.toThrow(/Only Team agent participants/)
    await expect(adapter.port.updateParticipant({
      conversationId: first.conversationId,
      participantId: secondUser.id,
      state: "muted"
    })).rejects.toThrow(/does not belong/)

    await storage.createSession({ id: "ses_team_adapter_valid", kind: "agent" })
    const agent = await adapter.port.addParticipant({
      conversationId: first.conversationId,
      agentSessionId: "ses_team_adapter_valid",
      idempotencyKey: "team-adapter-valid-agent"
    })
    await expect(adapter.port.updateParticipant({
      conversationId: first.conversationId,
      participantId: agent.participantId,
      state: "muted"
    })).resolves.toMatchObject({ state: "muted" })
  })

  it("does not expose or mutate conversations owned by another principal", async () => {
    const { runtime, adapter } = await createHarness()
    const foreign = await runtime.createConversation({
      id: "team_foreign_principal",
      principalId: "another-assistant",
      mode: "peer"
    })
    const foreignUser = await runtime.addParticipant({
      conversationId: foreign.id,
      principalId: "foreign-user",
      kind: "user"
    })
    await runtime.admitMessage({
      conversationId: foreign.id,
      authorParticipantId: foreignUser.id,
      targets: [{ kind: "all" }],
      content: [{
        type: "text",
        id: "part_foreign_principal",
        text: "This must stay below the Assistant boundary."
      }],
      idempotencyKey: "foreign-principal-message"
    })

    await expect(adapter.port.readConversationPage({
      conversationId: foreign.id,
      limit: 50
    })).resolves.toBeNull()
    await expect(adapter.port.closeConversation({
      conversationId: foreign.id
    })).rejects.toThrow(/not available/)
    await expect(adapter.port.listConversations({ state: "open" })).resolves
      .toMatchObject({ conversations: [] })
    await expect(runtime.getConversation(foreign.id)).resolves
      .toMatchObject({ state: "open" })
  })

  it("does not let an injected user replace the deterministic local author", async () => {
    const { storage, runtime, adapter } = await createHarness()
    const conversation = await adapter.port.createConversation({
      mode: "discussion",
      idempotencyKey: "team-adapter-local-author"
    })
    const localUser = (await runtime.listParticipants(
      conversation.conversationId
    )).find((participant) => participant.principalId === "assistant-host-user")
    if (localUser === undefined) throw new Error("local Team user is missing")
    await runtime.updateParticipantState(localUser.id, "left")
    await runtime.addParticipant({
      conversationId: conversation.conversationId,
      principalId: "injected-user",
      kind: "user"
    })
    await storage.createSession({ id: "ses_team_adapter_author", kind: "agent" })
    await adapter.port.addParticipant({
      conversationId: conversation.conversationId,
      agentSessionId: "ses_team_adapter_author",
      idempotencyKey: "team-adapter-author-agent"
    })

    await expect(adapter.port.submitRound({
      conversationId: conversation.conversationId,
      text: "The injected user must not author this.",
      idempotencyKey: "team-adapter-injected-author-message"
    })).rejects.toThrow(/no active local user/)
  })

  it("fans out to an exact agent snapshot and fences overlapping rounds", async () => {
    const { storage, runtime, adapter } = await createHarness()
    const conversation = await adapter.port.createConversation({
      mode: "discussion",
      idempotencyKey: "team-adapter-fanout-conversation"
    })
    await storage.createSession({ id: "ses_team_adapter_alpha", kind: "agent" })
    await storage.createSession({ id: "ses_team_adapter_beta", kind: "agent" })
    const alpha = await adapter.port.addParticipant({
      conversationId: conversation.conversationId,
      agentSessionId: "ses_team_adapter_alpha",
      displayName: "Alpha",
      idempotencyKey: "team-adapter-alpha"
    })
    const beta = await adapter.port.addParticipant({
      conversationId: conversation.conversationId,
      agentSessionId: "ses_team_adapter_beta",
      displayName: "Beta",
      idempotencyKey: "team-adapter-beta"
    })
    const request = {
      conversationId: conversation.conversationId,
      text: "Review this in one finite round.",
      idempotencyKey: "team-adapter-fanout-message"
    }
    const submitted = await adapter.port.submitRound(request)
    const replayed = await adapter.port.submitRound(request)
    const rawMessage = await runtime.getMessage(submitted.message.messageId)

    expect(submitted.deliveries.map((delivery) => delivery.participantId).sort())
      .toEqual([alpha.participantId, beta.participantId].sort())
    expect(rawMessage?.targets).toEqual([
      { kind: "participant", participantId: alpha.participantId },
      { kind: "participant", participantId: beta.participantId }
    ])
    expect(replayed).toMatchObject({
      message: { messageId: submitted.message.messageId },
      round: { roundId: submitted.round.roundId },
      deliveries: submitted.deliveries.map((delivery) => ({
        deliveryId: delivery.deliveryId,
        participantId: delivery.participantId
      }))
    })
    await expect(adapter.port.submitRound({
      ...request,
      idempotencyKey: "team-adapter-overlapping-message"
    })).rejects.toThrow(/active round/)
    await expect(adapter.port.closeConversation({
      conversationId: conversation.conversationId
    })).rejects.toThrow(/active round/)

    const page = await adapter.port.readConversationPage({
      conversationId: conversation.conversationId,
      limit: 50
    })
    expect(page).not.toHaveProperty("routingDecisions")
    expect(page).not.toHaveProperty("jobs")
    expect(page?.deliveries).toHaveLength(2)
  })

  it("maps coordinated groups to canonical lead CAS and one lead route", async () => {
    const { storage, runtime, adapter } = await createHarness()
    const conversation = await adapter.port.createConversation({
      mode: "coordinated",
      title: "Coordinated review",
      idempotencyKey: "team-adapter-coordinated-conversation"
    })
    await storage.createSession({ id: "ses_team_coordinator", kind: "agent" })
    await storage.createSession({ id: "ses_team_specialist", kind: "agent" })
    const coordinator = await adapter.port.addParticipant({
      conversationId: conversation.conversationId,
      agentSessionId: "ses_team_coordinator",
      displayName: "Coordinator",
      idempotencyKey: "team-adapter-coordinator"
    })
    const specialist = await adapter.port.addParticipant({
      conversationId: conversation.conversationId,
      agentSessionId: "ses_team_specialist",
      displayName: "Specialist",
      idempotencyKey: "team-adapter-specialist"
    })

    const assigned = await adapter.port.setCoordinator({
      conversationId: conversation.conversationId,
      expectedCoordinatorParticipantId: null,
      coordinatorParticipantId: coordinator.participantId
    })
    expect(assigned).toMatchObject({
      mode: "coordinated",
      coordinatorParticipantId: coordinator.participantId
    })
    await expect(adapter.port.setCoordinator({
      conversationId: conversation.conversationId,
      expectedCoordinatorParticipantId: null,
      coordinatorParticipantId: specialist.participantId
    })).rejects.toThrow()
    await expect(runtime.getConversation(conversation.conversationId)).resolves
      .toMatchObject({ leadParticipantId: coordinator.participantId })

    const submitted = await adapter.port.submitRound({
      conversationId: conversation.conversationId,
      text: "Coordinate the review and return one answer.",
      idempotencyKey: "team-adapter-coordinated-round"
    })
    expect(submitted).toMatchObject({
      kind: "assistant.team-round.submitted",
      conversation: {
        mode: "coordinated",
        coordinatorParticipantId: coordinator.participantId
      },
      round: { expected: 1, status: "running" },
      deliveries: [{
        participantId: coordinator.participantId,
        status: "waiting"
      }]
    })
    const decision = await runtime.getRoutingDecisionByMessage(
      submitted.message.messageId
    )
    expect(decision).toMatchObject({
      mode: "orchestrated",
      leadParticipantId: coordinator.participantId
    })
    expect(decision).not.toHaveProperty("targetSessionId")
  })
})

async function createHarness() {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-local-team-adapter-"))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  stores.push(storage)
  const runtime = new TeamConversationRuntime({ storage })
  const adapter = createLocalTeamConversationAdapter({ runtime })
  disposers.push(() => adapter.dispose())
  return { storage, runtime, adapter }
}

function stableDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}
