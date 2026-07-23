import type { ProductAppBackendShell } from "@wanex/product-app/backend"
import { productAppConversationOperationId } from "./conversation-operation.js"
import type { MutableProductAppState } from "./product-state.js"
import type {
  ProductAppConversationAssistantTextDeltaEvent,
  ProductAppConversationEventListener,
  ProductAppConversationEventUnsubscribe,
  ProductAppConversationEvents,
  ProductAppTrustedConversationOperationReference
} from "./types-conversation.js"

export interface ProductAppConversationEventHub
  extends ProductAppConversationEvents {
  dispose(): Promise<void>
}

type ProductAppConversationEventBackend = {
  readonly events: ProductAppBackendShell["events"]
  readonly commands: Pick<
    ProductAppBackendShell["commands"],
    "readConversationOperation"
  >
}

export function createProductAppConversationEventHub(request: {
  readonly backend: ProductAppConversationEventBackend
  readonly state: MutableProductAppState
}): ProductAppConversationEventHub {
  const listeners = new Set<ProductAppConversationEventListener>()
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
        const reference = request.state.trackedConversationOperations[
          event.reference.sessionId
        ]
        if (reference === undefined || !sameReference(reference, event.reference)) {
          return
        }
        const operationId = productAppConversationOperationId(reference)
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
          kind: "product-app.conversation.assistant-text-delta",
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

  function emit(event: ProductAppConversationAssistantTextDeltaEvent): void {
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
      listener: ProductAppConversationEventListener
    ): ProductAppConversationEventUnsubscribe {
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

function sameReference(
  left: ProductAppTrustedConversationOperationReference,
  right: ProductAppTrustedConversationOperationReference
): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.inputId === right.inputId &&
    left.turnId === right.turnId &&
    left.jobId === right.jobId
  )
}
