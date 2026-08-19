import type { BackendShell } from "@wanex/product/backend"
import { conversationOperationId } from "./operation.js"
import type {
  ConversationEvent,
  ConversationEventListener,
  ConversationEventUnsubscribe,
  ConversationEvents
} from "./model.js"

export interface ConversationEventHub
  extends ConversationEvents {
  dispose(): Promise<void>
}

type ConversationEventBackend = {
  readonly events: BackendShell["events"]
  readonly commands: Pick<
    BackendShell["commands"],
    "readConversationOperation"
  >
}

export function createConversationEventHub(request: {
  readonly backend: ConversationEventBackend
}): ConversationEventHub {
  const listeners = new Set<ConversationEventListener>()
  const activeAttemptByOperation = new Map<string, string>()
  let sequence = 0
  let disposed = false
  let tail: Promise<void> = Promise.resolve()

  const unsubscribe = request.backend.events.subscribeConversationEvents(
    (event) => {
      if (disposed) {
        return
      }
      tail = tail.then(async () => {
        if (disposed) {
          return
        }
        const reference = event.reference
        const operationId = conversationOperationId(reference)
        if (event.kind === "wanex-app.conversation.operation-invalidated") {
          activeAttemptByOperation.delete(operationId)
          sequence += 1
          emit({
            kind: "product.conversation.operation-invalidated",
            sequence,
            at: event.at,
            operationId,
            sessionId: reference.sessionId,
            cause: event.cause
          })
          return
        }
        if (activeAttemptByOperation.get(operationId) !== event.attemptId) {
          const durable = await request.backend.commands.readConversationOperation(
            reference
          )
          if (
            durable.kind !== "found" ||
            durable.operation.activeAttemptId !== event.attemptId ||
            (durable.operation.state !== "running" &&
              durable.operation.state !== "cancel_requested")
          ) {
            return
          }
          activeAttemptByOperation.set(operationId, event.attemptId)
        }
        sequence += 1
        emit({
          kind: "product.conversation.assistant-text-delta",
          sequence,
          at: event.at,
          operationId,
          sessionId: reference.sessionId,
          partId: event.partId,
          text: event.text,
          truncated: event.truncated
        })
      }).catch(() => {
        // Advisory presentation events cannot affect durable execution.
      })
    }
  )

  function emit(event: ConversationEvent): void {
    for (const listener of listeners) {
      try {
        listener(event)
      } catch {
        // One presentation listener cannot block another listener.
      }
    }
  }

  return {
    subscribeConversationEvents(
      listener: ConversationEventListener
    ): ConversationEventUnsubscribe {
      if (disposed) {
        return () => {}
      }
      listeners.add(listener)
      let subscribed = true
      return () => {
        if (!subscribed) {
          return
        }
        subscribed = false
        listeners.delete(listener)
      }
    },
    async dispose() {
      if (disposed) {
        return
      }
      disposed = true
      unsubscribe()
      await tail
      listeners.clear()
      activeAttemptByOperation.clear()
    }
  }
}
