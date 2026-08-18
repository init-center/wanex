import { describe, expect, it, vi } from "vitest"
import type {
  RouteTeamMessageReceipt,
  RouteTeamMessageRequest
} from "@wanex/protocol"
import {
  TeamConversationRuntime
} from "../../src/conversation/index.js"
import type { TeamConversationStorage } from "../../src/conversation/storage.js"

describe("Team conversation work notification", () => {
  it("notifies only after durable dispatch work exists", async () => {
    const notify = vi.fn()
    const ready = routeReceipt(1)
    const blocked = routeReceipt(0)
    const routeTeamMessage = vi.fn()
      .mockResolvedValueOnce(ready)
      .mockResolvedValueOnce(blocked)
    const runtime = new TeamConversationRuntime({
      storage: {
        routeTeamMessage
      } as unknown as TeamConversationStorage,
      notifyWorkAvailable: notify
    })

    await expect(runtime.routeMessage(routeRequest())).resolves.toBe(ready)
    await expect(runtime.routeMessage(routeRequest())).resolves.toBe(blocked)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("does not turn a failed best-effort wake into a failed command", async () => {
    const receipt = routeReceipt(1)
    const runtime = new TeamConversationRuntime({
      storage: {
        async routeTeamMessage() {
          return receipt
        }
      } as unknown as TeamConversationStorage,
      notifyWorkAvailable() {
        throw new Error("simulated wake failure")
      }
    })

    await expect(runtime.routeMessage(routeRequest())).resolves.toBe(receipt)
  })
})

function routeRequest(): RouteTeamMessageRequest {
  return {
    messageId: "message_notification",
    expectedRevision: 1,
    mode: "peer",
    outcome: "blocked",
    actorPrincipalId: "principal_notification",
    reason: "notification test",
    idempotencyKey: "notification-test",
    deliveries: []
  }
}

function routeReceipt(dispatchJobCount: number): RouteTeamMessageReceipt {
  return {
    dispatchJobs: Array.from({ length: dispatchJobCount }, (_, index) => ({
      id: `job_notification_${index}`
    }))
  } as unknown as RouteTeamMessageReceipt
}
