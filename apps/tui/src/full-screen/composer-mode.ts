import type { ConversationOperationReadModel } from "@wanex/assistant"
import type { TuiComposerMode } from "../application/conversation-actions.js"

export function switchTuiComposerMode(options: {
  readonly current: TuiComposerMode
  readonly requested: Exclude<TuiComposerMode, "submit">
  readonly operation?: ConversationOperationReadModel
}): {
  readonly mode: TuiComposerMode
  readonly errorMessage?: string
} {
  const available =
    options.operation !== undefined &&
    !options.operation.capabilities.terminal &&
    (options.requested === "queue" || options.operation.capabilities.steerable)
  if (!available) {
    return {
      mode: options.current,
      errorMessage:
        options.requested === "queue"
          ? "Queue after current requires active work"
          : "Guide current is unavailable"
    }
  }
  return {
    mode: options.current === options.requested ? "submit" : options.requested
  }
}
