import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createTestTurnExecutionBinding,
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"
import {
  createTeamConversationExecutionHost,
  TeamConversationRuntime,
  type TeamConversationExecutionHost
} from "../../src/conversation/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const stores: StorageTestStore[] = []
const hosts: TeamConversationExecutionHost[] = []

afterEach(async () => {
  while (hosts.length > 0) await hosts.pop()?.dispose()
  while (stores.length > 0) await stores.pop()?.dispose()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("Team conversation execution host", () => {
  it("owns worker loops without taking ownership of borrowed stores", async () => {
    const storage = await createStore()
    const host = createTeamConversationExecutionHost({
      storage,
      teamStorage: storage,
      workerCount: 2,
      async prepareExecutionBinding() {
        throw new Error("no Team delivery should be claimed in this lifecycle test")
      }
    })
    hosts.push(host)

    expect(host.status()).toEqual({
      started: false,
      disposed: false,
      workerCount: 2
    })
    await expect(host.runOnce()).resolves.toMatchObject([
      { status: "idle" },
      { status: "idle" }
    ])

    host.start()
    host.start()
    expect(host.status().started).toBe(true)
    await expect(host.runOnce()).rejects.toThrow(/already running/)
    await Promise.all([host.stop(), host.stop()])
    expect(host.status().started).toBe(false)

    host.start()
    const firstDispose = host.dispose()
    const secondDispose = host.dispose()
    await Promise.all([firstDispose, secondDispose])
    expect(host.status()).toEqual({
      started: false,
      disposed: true,
      workerCount: 2
    })
    expect(() => host.start()).toThrow(/disposed/)
    await expect(host.runOnce()).rejects.toThrow(/disposed/)

    await expect(storage.createSession({
      id: "ses_after_team_host_disposal",
      kind: "agent"
    })).resolves.toMatchObject({ id: "ses_after_team_host_disposal" })
    hosts.pop()
  })

  it("rejects invalid worker counts at composition time", async () => {
    const storage = await createStore()
    expect(() => createTeamConversationExecutionHost({
      storage,
      teamStorage: storage,
      workerCount: 0,
      async prepareExecutionBinding() {
        throw new Error("unreachable")
      }
    })).toThrow(/positive integer/)
  })

  it("isolates post-commit Team notification failures", async () => {
    const storage = await createStore()
    const runtime = new TeamConversationRuntime({ storage })
    await storage.createSession({ id: "ses_team_host_notification", kind: "agent" })
    const conversation = await runtime.createConversation({ mode: "peer" })
    const user = await runtime.addParticipant({
      conversationId: conversation.id,
      principalId: "team_host_notification_user",
      kind: "user"
    })
    const agent = await runtime.addParticipant({
      conversationId: conversation.id,
      principalId: "team_host_notification_agent",
      kind: "agent",
      agentSessionId: "ses_team_host_notification"
    })
    const routed = await runtime.submitRoutedMessage({
      idempotencyKey: "team-host-notification-message",
      message: {
        conversationId: conversation.id,
        authorParticipantId: user.id,
        targets: [{ kind: "participant", participantId: agent.id }],
        content: [{
          type: "text",
          id: "part_team_host_notification",
          text: "Materialize this delivery."
        }]
      },
      route: {
        mode: "peer",
        outcome: "deliver",
        actorPrincipalId: user.principalId,
        reason: "Post-commit notification proof",
        deliveries: [{
          id: "delivery_team_host_notification",
          targetParticipantId: agent.id,
          role: "speaker",
          trigger: "direct"
        }]
      }
    })
    const notifications: Array<Record<string, unknown>> = []
    const host = createTeamConversationExecutionHost({
      storage,
      teamStorage: storage,
      prepareExecutionBinding: async () => createTestTurnExecutionBinding(),
      wakeAgentHost() {
        throw new Error("advisory wake failure")
      },
      notifyTeamChanged(event) {
        notifications.push(event)
        throw new Error("advisory Team notification failure")
      }
    })
    hosts.push(host)

    await expect(host.runOnce()).resolves.toMatchObject([{
      status: "completed",
      job: { kind: "team.delivery", state: "succeeded" }
    }])
    expect(notifications).toMatchObject([{
      conversationId: conversation.id,
      deliveryId: routed.deliveries[0]?.id,
      cause: "delivery_changed",
      at: expect.any(Number)
    }])
    await expect(runtime.listDeliveries({
      messageId: routed.message.id
    })).resolves.toMatchObject([{
      id: routed.deliveries[0]?.id,
      state: "dispatched",
      childTurnId: expect.any(String)
    }])
  })
})

async function createStore(): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-team-host-"))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  stores.push(storage)
  return storage
}
