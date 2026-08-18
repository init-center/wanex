import type {
  ProviderEventObserver,
  ProviderRunEvent
} from "@wanex/runtime/provider"
import type {
  RuntimeHostSessionTurnResultObserver
} from "@wanex/runtime/host"
import type {
  WanexAppConversationEvent,
  WanexAppConversationEventListener,
  WanexAppConversationEventUnsubscribe,
  WanexAppEvents,
  WanexAppGoalEvent,
  WanexAppGoalEventCause,
  WanexAppGoalEventListener,
  WanexAppGoalEventUnsubscribe
} from "./types-events.js"

const MAX_ASSISTANT_DELTA_CHARS = 16_384

export class WanexAppConversationEventHub implements WanexAppEvents {
  private readonly listeners = new Set<WanexAppConversationEventListener>()
  private readonly goalListeners = new Set<WanexAppGoalEventListener>()
  private sequence = 0
  private disposed = false

  readonly observeProviderEvent: ProviderEventObserver = (event) => {
    const projected = this.project(event)
    if (projected === undefined || this.disposed) {
      return
    }
    this.emit(projected)
  }

  readonly observeSessionTurnResult: RuntimeHostSessionTurnResultObserver = (
    signal
  ) => {
    if (this.disposed) {
      return
    }
    this.sequence += 1
    this.emit({
      kind: "wanex-app.conversation.operation-invalidated",
      sequence: this.sequence,
      at: Date.now(),
      reference: signal.reference,
      cause:
        signal.outcome === "completed"
          ? "execution_completed"
          : signal.outcome === "suspended"
            ? "execution_suspended"
            : "execution_failed"
    })
  }

  readonly observeGoalInvalidation = (signal: {
    readonly objectiveId: string
    readonly sessionId: string
    readonly cause: WanexAppGoalEventCause
  }): void => {
    if (this.disposed) {
      return
    }
    this.sequence += 1
    this.emitGoal({
      kind: "wanex-app.goal.invalidated",
      sequence: this.sequence,
      at: Date.now(),
      ...signal
    })
  }

  private emit(event: WanexAppConversationEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // Presentation listeners cannot affect provider execution.
      }
    }
  }

  private emitGoal(event: WanexAppGoalEvent): void {
    for (const listener of this.goalListeners) {
      try {
        listener(event)
      } catch {
        // Presentation listeners cannot affect durable Goal coordination.
      }
    }
  }

  subscribeConversationEvents(
    listener: WanexAppConversationEventListener
  ): WanexAppConversationEventUnsubscribe {
    if (this.disposed) {
      return () => {}
    }
    this.listeners.add(listener)
    let subscribed = true
    return () => {
      if (!subscribed) {
        return
      }
      subscribed = false
      this.listeners.delete(listener)
    }
  }

  subscribeGoalEvents(
    listener: WanexAppGoalEventListener
  ): WanexAppGoalEventUnsubscribe {
    if (this.disposed) {
      return () => {}
    }
    this.goalListeners.add(listener)
    let subscribed = true
    return () => {
      if (!subscribed) {
        return
      }
      subscribed = false
      this.goalListeners.delete(listener)
    }
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.listeners.clear()
    this.goalListeners.clear()
  }

  private project(
    run: ProviderRunEvent
  ): WanexAppConversationEvent | undefined {
    if (run.event.type !== "text_delta" || run.event.delta.length === 0) {
      return undefined
    }
    const text = truncateText(run.event.delta)
    this.sequence += 1
    return {
      kind: "wanex-app.conversation.assistant-text-delta",
      sequence: this.sequence,
      at: Date.now(),
      reference: {
        sessionId: run.sessionId,
        inputId: run.inputId,
        turnId: run.turnId,
        jobId: run.jobId
      },
      attemptId: run.attemptId,
      partId: run.event.partId,
      text: text.value,
      truncated: text.truncated
    }
  }
}

function truncateText(value: string): {
  readonly value: string
  readonly truncated: boolean
} {
  if (value.length <= MAX_ASSISTANT_DELTA_CHARS) {
    return { value, truncated: false }
  }
  return {
    value: value.slice(0, MAX_ASSISTANT_DELTA_CHARS),
    truncated: true
  }
}
