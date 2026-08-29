import { describe, expect, it } from "vitest"
import type {
  SettleSessionTurnReceipt
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import {
  observeConversationSettlementStorage
} from "../src/assistant/conversation-helpers.js"

describe("Eval conversation settlement observer", () => {
  it("matches exact future settlements and retains completed jobs", async () => {
    const receipts = [
      settlementReceipt("ses_first", "job_first"),
      settlementReceipt("ses_second", "job_second")
    ]
    const source = {
      async settleSessionTurn() {
        const receipt = receipts.shift()
        if (receipt === undefined) {
          throw new Error("no settlement receipt configured")
        }
        return receipt
      }
    } as unknown as CoreStore
    const observed = observeConversationSettlementStorage(source)
    const firstSession = observed.waitForNext({ sessionId: "ses_first" })
    const secondJob = observed.waitForNext({ jobId: "job_second" })

    const firstReceipt = await observed.storage.settleSessionTurn({} as never)
    await expect(firstSession).resolves.toBe(firstReceipt)

    let secondResolved = false
    void secondJob.then(() => {
      secondResolved = true
    })
    await Promise.resolve()
    expect(secondResolved).toBe(false)

    const secondReceipt = await observed.storage.settleSessionTurn({} as never)
    await expect(secondJob).resolves.toBe(secondReceipt)
    await expect(observed.waitForJob("job_first")).resolves.toBe(firstReceipt)
  })

  it("rejects empty settlement identities", () => {
    const observed = observeConversationSettlementStorage(
      {} as unknown as CoreStore
    )

    expect(() => observed.waitForJob(" ")).toThrow(
      "conversation settlement jobId must not be empty"
    )
    expect(() => observed.waitForNext({ sessionId: "" })).toThrow(
      "conversation settlement sessionId must not be empty"
    )
  })
})

function settlementReceipt(
  sessionId: string,
  jobId: string
): SettleSessionTurnReceipt {
  return {
    turn: { sessionId },
    job: { id: jobId }
  } as SettleSessionTurnReceipt
}
