import { describe, expect, it } from "vitest"
import type { BackendShell } from "../src/backend/index.js"
import { createConversationEventHub } from "../src/conversation/events.js"

type ConversationEventBackend = {
  readonly events: BackendShell["events"]
  readonly commands: Pick<
    BackendShell["commands"],
    "readConversationOperation"
  >
}

describe("assistant conversation event filtering", () => {
  it("emits durable active foreground and background attempts and isolates presentation listeners", async () => {
    const reference = {
      sessionId: "ses_assistant_event_filter",
      inputId: "inp_assistant_event_filter",
      turnId: "turn_assistant_event_filter",
      jobId: "job_assistant_event_filter"
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
        },
        subscribeGoalEvents() {
          return () => {}
        }
      },
      commands: {
        async readConversationOperation(request) {
          durableReadCount += 1
          const pending = request.inputId === "inp_assistant_event_pending"
          return {
            kind: "found",
            reference: request,
            operation: {
              ...request,
              state: "running",
              activeAttemptId: pending
                ? "attempt_pending"
                : "attempt_current",
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
    const hub = createConversationEventHub({ backend })
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
        kind: "assistant.conversation.assistant-text-delta",
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
    expect(observed
      .filter((event) =>
        event.kind === "assistant.conversation.assistant-text-delta"
      )
      .map((event) => event.text)).toEqual([
      "matching",
      " cached"
    ])
    expect(durableReadCount).toBe(2)

    sourceListener?.({
      kind: "wanex-app.conversation.operation-invalidated",
      sequence: 4,
      at: 13,
      reference,
      cause: "execution_settled"
    })
    await settleEventQueue()
    expect(observed[2]).toEqual({
      kind: "assistant.conversation.operation-invalidated",
      sequence: 3,
      at: 13,
      operationId: expect.stringMatching(/^assistant_conversation_operation_/),
      sessionId: reference.sessionId,
      cause: "execution_settled"
    })

    const pendingReference = {
      ...reference,
      inputId: "inp_assistant_event_pending",
      turnId: "turn_assistant_event_pending",
      jobId: "job_assistant_event_pending"
    }
    sourceListener?.({
      kind: "wanex-app.conversation.assistant-text-delta",
      sequence: 5,
      at: 14,
      reference: pendingReference,
      attemptId: "attempt_pending",
      partId: "text_0",
      text: "pending operation",
      truncated: false
    })
    await settleEventQueue()
    expect(observed[3]).toMatchObject({
      kind: "assistant.conversation.assistant-text-delta",
      sequence: 4,
      sessionId: reference.sessionId,
      text: "pending operation"
    })

    sourceListener?.({
      kind: "wanex-app.conversation.assistant-text-delta",
      sequence: 6,
      at: 15,
      reference,
      attemptId: "attempt_current",
      partId: "text_0",
      text: "replaced operation",
      truncated: false
    })
    await settleEventQueue()
    expect(observed[4]).toMatchObject({
      kind: "assistant.conversation.assistant-text-delta",
      sequence: 5,
      sessionId: reference.sessionId,
      text: "replaced operation"
    })
    expect(durableReadCount).toBe(4)

    await hub.dispose()
    await hub.dispose()
    expect(unsubscribed).toBe(true)
  })
})

async function settleEventQueue(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}
