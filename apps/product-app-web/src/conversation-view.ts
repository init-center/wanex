import type {
  ProductAppWebConversationSourceResult,
  ProductAppWebConversationViewModel
} from "./types.js"
import type {
  ProductAppSurfaceEvent
} from "@wanex/product-app"

const MAX_TRANSIENT_ASSISTANT_CHARS = 65_536

export function idleProductAppWebConversation(
  selectedSessionId: string | undefined
): ProductAppWebConversationViewModel {
  return {
    kind: "product-app-web.conversation",
    state: "idle",
    ...(selectedSessionId === undefined ? {} : { sessionId: selectedSessionId }),
    canSubmit: true,
    canCancel: false,
    canRegenerate: false
  }
}

export function productAppWebConversationFromResult(
  result: ProductAppWebConversationSourceResult,
  previous?: ProductAppWebConversationViewModel
): ProductAppWebConversationViewModel {
  if (result.kind === "product-app.conversation-operation.cancel") {
    return productAppWebConversationFromResult(result.operation, previous)
  }
  if (result.kind === "product-app.conversation-operation.found") {
    const operation = result.operation
    const preserveTransient =
      !operation.capabilities.terminal &&
      !hasCanonicalAssistantText(operation) &&
      previous?.operationId === operation.operationId
    return {
      kind: "product-app-web.conversation",
      state: operation.state,
      operationId: operation.operationId,
      sessionId: operation.sessionId,
      operation,
      ...(preserveTransient && previous.transientAssistantText !== undefined
        ? { transientAssistantText: previous.transientAssistantText }
        : {}),
      canSubmit: operation.capabilities.terminal,
      canCancel: operation.capabilities.cancellable,
      canRegenerate: operation.capabilities.regeneratable
    }
  }
  if (result.kind === "product-app.conversation-operation.untracked") {
    if (
      result.sessionId === undefined &&
      previous?.state === "rejected" &&
      previous.sessionId === undefined
    ) {
      return previous
    }
    return {
      kind: "product-app-web.conversation",
      state: "untracked",
      ...(result.sessionId === undefined ? {} : { sessionId: result.sessionId }),
      message: result.message,
      canSubmit: true,
      canCancel: false,
      canRegenerate: false
    }
  }
  if (result.kind === "product-app.conversation-operation.missing") {
    return {
      kind: "product-app-web.conversation",
      state: "missing",
      operationId: result.operationId,
      sessionId: result.sessionId,
      message: result.message,
      canSubmit: true,
      canCancel: false,
      canRegenerate: false
    }
  }
  return {
    kind: "product-app-web.conversation",
    state: "rejected",
    ...(result.sessionId === undefined ? {} : { sessionId: result.sessionId }),
    ...(result.operation === undefined
      ? {}
      : {
          operationId: result.operation.operationId,
          operation: result.operation
        }),
    message: result.message,
    canSubmit: result.reason !== "operation_active",
    canCancel: result.operation?.capabilities.cancellable ?? false,
    canRegenerate: result.operation?.capabilities.regeneratable ?? false
  }
}

export function applyProductAppWebConversationEvents(
  conversation: ProductAppWebConversationViewModel,
  events: readonly ProductAppSurfaceEvent[]
): ProductAppWebConversationViewModel {
  if (
    conversation.operationId === undefined ||
    conversation.operation?.capabilities.terminal === true
  ) {
    return conversation
  }
  let text = conversation.transientAssistantText ?? ""
  let matched = false
  for (const event of events) {
    const delta = event.conversation
    if (
      delta === undefined ||
      delta.operationId !== conversation.operationId ||
      delta.sessionId !== conversation.sessionId
    ) {
      continue
    }
    matched = true
    text = `${text}${delta.text}`.slice(-MAX_TRANSIENT_ASSISTANT_CHARS)
  }
  if (!matched) {
    return conversation
  }
  return {
    ...conversation,
    transientAssistantText: text
  }
}

export function normalizeProductAppWebConversationForSelectedSession(
  conversation: ProductAppWebConversationViewModel,
  selectedSessionId: string | undefined
): ProductAppWebConversationViewModel {
  if (selectedSessionId === undefined) {
    return conversation.state === "rejected" && conversation.sessionId === undefined
      ? conversation
      : idleProductAppWebConversation(undefined)
  }
  if (
    conversation.sessionId !== undefined &&
    conversation.sessionId !== selectedSessionId
  ) {
    return idleProductAppWebConversation(selectedSessionId)
  }
  return {
    ...conversation,
    sessionId: conversation.sessionId ?? selectedSessionId
  }
}

function hasCanonicalAssistantText(
  operation: NonNullable<ProductAppWebConversationViewModel["operation"]>
): boolean {
  return operation.transcript.rows.some(
    (row) => row.role === "assistant" && row.text.trim().length > 0
  )
}
