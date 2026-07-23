import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { WanexSessionCore } from "@wanex/runtime/sessions"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { WanexWorker } from "@wanex/runtime/jobs"
import {
  registerTeamRoundJobHandler,
  submitTeamRoundJob,
  TeamConversationRuntime
} from "../../src/conversation/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const clients: StorageTestStore[] = []

afterEach(async () => {
  while (clients.length > 0) {
    await clients.pop()?.dispose()
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/team/conversation", () => {
  it("records a bounded team conversation history", async () => {
    const { runtime } = await createRuntime()
    const conversation = await runtime.createConversation({
      title: "Runtime team",
      mode: "hybrid",
      metadata: { graphId: "graph_runtime" },
      idempotencyKey: "runtime-team-conversation"
    })
    const duplicate = await runtime.createConversation({
      title: "Runtime team",
      mode: "hybrid",
      metadata: { graphId: "graph_runtime" },
      idempotencyKey: "runtime-team-conversation"
    })
    expect(duplicate.id).toBe(conversation.id)

    const user = await runtime.addParticipant({
      id: "runtime_team_user",
      conversationId: conversation.id,
      principalId: "user_runtime",
      kind: "user",
      displayName: "User",
      role: "requester"
    })
    const agent = await runtime.addParticipant({
      id: "runtime_team_agent",
      conversationId: conversation.id,
      principalId: "agent_runtime",
      kind: "agent",
      displayName: "Agent",
      role: "reviewer",
      metadata: { profile: "coder" }
    })

    await expect(
      runtime.appendTurn({
        id: "runtime_team_turn",
        conversationId: conversation.id,
        speakerParticipantId: user.id,
        audienceParticipantIds: [agent.id],
        content: [
          {
            type: "text",
            id: "part_runtime_team",
            text: "Please review this."
          }
        ],
        metadata: { source: "runtime-test" }
      })
    ).resolves.toMatchObject({
      id: "runtime_team_turn",
      speakerParticipantId: user.id,
      audienceParticipantIds: [agent.id]
    })

    await expect(
      runtime.listConversations({ state: "open", mode: "hybrid" })
    ).resolves.toMatchObject([{ id: conversation.id }])
    await expect(
      runtime.listParticipants(conversation.id, "active")
    ).resolves.toHaveLength(2)
    await expect(runtime.listTurns(conversation.id)).resolves.toMatchObject([
      {
        id: "runtime_team_turn",
        content: [{ text: "Please review this." }]
      }
    ])

    await runtime.updateParticipantState(agent.id, "muted")
    await expect(
      runtime.appendTurn({
        conversationId: conversation.id,
        speakerParticipantId: agent.id,
        content: [{ type: "text", id: "part_muted", text: "Muted." }]
      })
    ).rejects.toThrow(/speaker must be active/)

    await expect(
      runtime.updateConversationState(conversation.id, "closed")
    ).resolves.toMatchObject({
      state: "closed",
      closedAt: expect.any(Number)
    })
    await expect(runtime.getConversation(conversation.id)).resolves.toMatchObject(
      {
        state: "closed"
      }
    )
  })

  it("orchestrates hybrid team rounds through the TL participant", async () => {
    const { runtime } = await createRuntime()
    const conversation = await runtime.createConversation({
      title: "Hybrid team",
      mode: "hybrid"
    })
    const tl = await runtime.addParticipant({
      id: "hybrid_tl",
      conversationId: conversation.id,
      principalId: "agent_tl",
      kind: "agent",
      role: "tl",
      displayName: "TL"
    })
    await runtime.addParticipant({
      id: "hybrid_worker",
      conversationId: conversation.id,
      principalId: "agent_worker",
      kind: "agent",
      role: "worker"
    })

    const result = await runtime.orchestrateRound({
      conversationId: conversation.id,
      policy: { maxTurns: 2 },
      speakers: {
        [tl.id]: ({ turnIndex }) => ({
          content: [
            {
              type: "text",
              id: `hybrid_tl_${turnIndex}`,
              text: `TL turn ${turnIndex}`
            }
          ]
        })
      }
    })

    expect(result.stopReason).toBe("max_turns")
    expect(result.turns).toHaveLength(2)
    expect(result.turns.map((turn) => turn.speakerParticipantId)).toEqual([
      tl.id,
      tl.id
    ])
  })

  it("orchestrates free team rounds with deterministic round-robin speakers", async () => {
    const { runtime } = await createRuntime()
    const conversation = await runtime.createConversation({
      title: "Free team",
      mode: "free"
    })
    const first = await runtime.addParticipant({
      id: "free_agent_a",
      conversationId: conversation.id,
      principalId: "agent_a",
      kind: "agent"
    })
    const second = await runtime.addParticipant({
      id: "free_agent_b",
      conversationId: conversation.id,
      principalId: "agent_b",
      kind: "agent"
    })

    const result = await runtime.orchestrateRound({
      conversationId: conversation.id,
      policy: { maxTurns: 3 },
      speakers: {
        [first.id]: ({ speaker, turnIndex }) => ({
          content: [
            {
              type: "text",
              id: `${speaker.id}_${turnIndex}`,
              text: `${speaker.id} turn ${turnIndex}`
            }
          ]
        }),
        [second.id]: ({ speaker, turnIndex }) => ({
          content: [
            {
              type: "text",
              id: `${speaker.id}_${turnIndex}`,
              text: `${speaker.id} turn ${turnIndex}`
            }
          ]
        })
      }
    })

    expect(result.stopReason).toBe("max_turns")
    expect(result.turns.map((turn) => turn.speakerParticipantId)).toEqual([
      first.id,
      second.id,
      first.id
    ])
  })

  it("stops team rounds when the selected speaker handler is missing", async () => {
    const { runtime } = await createRuntime()
    const conversation = await runtime.createConversation({
      title: "Missing handler",
      mode: "free"
    })
    await runtime.addParticipant({
      id: "missing_handler_agent",
      conversationId: conversation.id,
      principalId: "agent_missing",
      kind: "agent"
    })

    const result = await runtime.orchestrateRound({
      conversationId: conversation.id,
      policy: { maxTurns: 1 },
      speakers: {}
    })

    expect(result).toMatchObject({
      stopReason: "speaker_not_registered",
      turns: []
    })
  })

  it("stops team rounds without appending empty speaker responses", async () => {
    const { runtime } = await createRuntime()
    const conversation = await runtime.createConversation({
      title: "Empty response",
      mode: "free"
    })
    const agent = await runtime.addParticipant({
      id: "empty_response_agent",
      conversationId: conversation.id,
      principalId: "agent_empty",
      kind: "agent"
    })

    const result = await runtime.orchestrateRound({
      conversationId: conversation.id,
      policy: { maxTurns: 3 },
      speakers: {
        [agent.id]: () => ({ content: [] })
      }
    })

    expect(result).toMatchObject({
      stopReason: "empty_response",
      turns: []
    })
    await expect(runtime.listTurns(conversation.id)).resolves.toEqual([])
  })

  it("requires positive bounded team round limits", async () => {
    const { runtime } = await createRuntime()
    const conversation = await runtime.createConversation({
      title: "Bad policy",
      mode: "free"
    })

    await expect(
      runtime.orchestrateRound({
        conversationId: conversation.id,
        policy: { maxTurns: 0 },
        speakers: {}
      })
    ).rejects.toThrow(/maxTurns must be a positive integer/)
  })

  it("submits and executes scheduler-backed bounded team round jobs", async () => {
    const { runtime, storage } = await createRuntime()
    const conversation = await runtime.createConversation({
      title: "Scheduled team",
      mode: "free"
    })
    const first = await runtime.addParticipant({
      id: "scheduled_agent_a",
      conversationId: conversation.id,
      principalId: "agent_a",
      kind: "agent"
    })
    const second = await runtime.addParticipant({
      id: "scheduled_agent_b",
      conversationId: conversation.id,
      principalId: "agent_b",
      kind: "agent"
    })
    const job = await submitTeamRoundJob(storage, {
      id: "job_team_round_scheduled",
      principalId: "principal_team_round",
      conversationId: conversation.id,
      policy: {
        maxTurns: 2,
        mode: "free"
      },
      metadata: {
        source: "team-test"
      },
      budgetGrantId: "budget_team_round"
    })
    expect(job).toMatchObject({
      id: "job_team_round_scheduled",
      kind: "team.round.close",
      budgetGrantId: "budget_team_round",
      payload: {
        conversationId: conversation.id,
        policy: {
          maxTurns: 2,
          mode: "free"
        }
      }
    })
    const worker = createTeamWorker(storage)
    registerTeamRoundJobHandler(worker, {
      runtime,
      speakers: {
        [first.id]: ({ speaker, turnIndex }) => ({
          content: [
            {
              type: "text",
              id: `${speaker.id}_${turnIndex}`,
              text: `${speaker.id} turn ${turnIndex}`
            }
          ]
        }),
        [second.id]: ({ speaker, turnIndex }) => ({
          content: [
            {
              type: "text",
              id: `${speaker.id}_${turnIndex}`,
              text: `${speaker.id} turn ${turnIndex}`
            }
          ]
        })
      }
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed team round job")
    }
    expect(result.job.result).toMatchObject({
      conversationId: conversation.id,
      stopReason: "max_turns",
      metadata: {
        source: "team-test"
      }
    })
    expect(
      (result.job.result as { readonly turnIds?: readonly unknown[] }).turnIds
    ).toHaveLength(2)
    await expect(runtime.listTurns(conversation.id)).resolves.toHaveLength(2)
  })

  it("fails scheduler-backed team round jobs with invalid payloads", async () => {
    const { storage } = await createRuntime()
    await storage.enqueueJob({
      id: "job_team_round_invalid_payload",
      kind: "team.round.close",
      principalId: "principal_team_round",
      payload: {
        conversationId: "team_missing_policy"
      }
    })
    const worker = createTeamWorker(storage)
    registerTeamRoundJobHandler(worker, {
      runtime: new TeamConversationRuntime({ storage }),
      speakers: {}
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    if (result.status !== "failed") {
      throw new Error("expected failed team round job")
    }
    expect(JSON.stringify(result.job?.lastError)).toContain(
      "team round policy must be an object"
    )
  })
})

async function createRuntime(): Promise<{
  readonly storeDir: string
  readonly storage: StorageTestStore
  readonly runtime: TeamConversationRuntime
}> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-team-conversation-"))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({ kind: "local-system-service", mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  const runtime = new TeamConversationRuntime({
    storage,
    principalId: "team_runtime"
  })
  return { storeDir, storage, runtime }
}

function createTeamWorker(storage: StorageTestStore): WanexWorker {
  return new WanexWorker({
    session: new WanexSessionCore({ storage }),
    workerId: `worker_team_round_${Math.random().toString(36).slice(2)}`,
    leaseMs: 60_000,
    kinds: ["team.round.close"]
  })
}
