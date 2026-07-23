import { describe, expect, it } from "vitest"
import type { ProductAppBackendShell } from "../src/backend/index.js"
import { createProductAppConversationEventHub } from "../src/conversation-events.js"
import type { MutableProductAppState } from "../src/product-state.js"

type ConversationEventBackend = {
  readonly events: ProductAppBackendShell["events"]
  readonly commands: Pick<
    ProductAppBackendShell["commands"],
    "readConversationOperation"
  >
}

describe("Product App conversation event filtering", () => {
  it("emits only the tracked active attempt and isolates presentation listeners", async () => {
    const reference = {
      sessionId: "ses_product_event_filter",
      inputId: "inp_product_event_filter",
      turnId: "turn_product_event_filter",
      jobId: "job_product_event_filter"
    }
    const state: MutableProductAppState = {
      selectedSessionId: reference.sessionId,
      layout: "single",
      mode: "chat",
      preferences: {
        theme: "system",
        density: "comfortable"
      },
    trackedConversationOperations: {
        [reference.sessionId]: reference
    },
    conversationAttachmentDrafts: {}
  }
    let sourceListener: Parameters<
      ConversationEventBackend["events"]["subscribeConversationEvents"]
    >[0] | undefined
    let unsubscribed = false
    let durableReadCount = 0
    const backend: ConversationEventBackend = {
      events: {
        subscribeConversationEvents(listener) {
          sourceListener = listener
          return () => {
            unsubscribed = true
            sourceListener = undefined
          }
        }
      },
      commands: {
        async readConversationOperation() {
          durableReadCount += 1
          return {
            kind: "found",
            reference,
            operation: {
              ...reference,
              state: "running",
              activeAttemptId: "attempt_current",
              createdAt: 1,
              updatedAt: 2,
              transcript: {
                rows: [],
                totalRows: 0,
                truncated: false
              }
            }
          }
        }
      }
    }
    const hub = createProductAppConversationEventHub({ backend, state })
    const observed: Array<
      Parameters<Parameters<typeof hub.subscribeConversationEvents>[0]>[0]
    > = []
    hub.subscribeConversationEvents(() => {
      throw new Error("presentation listener failure")
    })
    hub.subscribeConversationEvents((event) => {
      observed.push(event)
    })

    sourceListener?.({
      kind: "wanex-app.conversation.assistant-text-delta",
      sequence: 1,
      at: 10,
      reference,
      attemptId: "attempt_stale",
      partId: "text_0",
      text: "stale",
      truncated: false
    })
    await settleEventQueue()
    expect(observed).toEqual([])

    sourceListener?.({
      kind: "wanex-app.conversation.assistant-text-delta",
      sequence: 2,
      at: 11,
      reference,
      attemptId: "attempt_current",
      partId: "text_0",
      text: "matching",
      truncated: false
    })
    await settleEventQueue()
    expect(observed).toEqual([
      expect.objectContaining({
        kind: "product-app.conversation.assistant-text-delta",
        sequence: 1,
        sessionId: reference.sessionId,
        partId: "text_0",
        text: "matching"
      })
    ])

    sourceListener?.({
      kind: "wanex-app.conversation.assistant-text-delta",
      sequence: 3,
      at: 12,
      reference,
      attemptId: "attempt_current",
      partId: "text_0",
      text: " cached",
      truncated: false
    })
    await settleEventQueue()
    expect(observed.map((event) => event.text)).toEqual([
      "matching",
      " cached"
    ])
    expect(durableReadCount).toBe(2)

    state.trackedConversationOperations[reference.sessionId] = {
      ...reference,
      inputId: "inp_product_event_replacement",
      turnId: "turn_product_event_replacement",
      jobId: "job_product_event_replacement"
    }
    sourceListener?.({
      kind: "wanex-app.conversation.assistant-text-delta",
      sequence: 4,
      at: 13,
      reference,
      attemptId: "attempt_current",
      partId: "text_0",
      text: "replaced operation",
      truncated: false
    })
    await settleEventQueue()
    expect(observed).toHaveLength(2)

    await hub.dispose()
    await hub.dispose()
    expect(unsubscribed).toBe(true)
  })
})

async function settleEventQueue(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}
