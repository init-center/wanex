import type {
  ProductAppTuiConversationOperation,
  ProductAppTuiRenderedConversationOperation
} from "./types.js"
import { singleLine } from "./line-session-text.js"

export function renderProductAppTuiConversationOperation(
  value: ProductAppTuiConversationOperation
): ProductAppTuiRenderedConversationOperation {
  if (value.kind === "product-app.conversation-operation.cancel") {
    const rendered = renderProductAppTuiConversationOperation(value.operation)
    const lines = [
      "Wanex Product App Conversation",
      `cancel:${value.status}`,
      ...rendered.lines.slice(1)
    ]
    return {
      ...rendered,
      sourceKind: value.kind,
      lines,
      text: lines.join("\n")
    }
  }
  if (value.kind === "product-app.conversation-operation.found") {
    return renderFoundOperation(value.operation, value.kind)
  }
  const sessionId = value.sessionId
  const rejectedOperation =
    value.kind === "product-app.conversation-operation.rejected"
      ? value.operation
      : undefined
  const operationId =
    value.kind === "product-app.conversation-operation.missing"
      ? value.operationId
      : rejectedOperation?.operationId
  const state =
    value.kind === "product-app.conversation-operation.rejected"
      ? "rejected"
      : value.kind === "product-app.conversation-operation.missing"
        ? "missing"
        : "untracked"
  const message = value.message
  const lines = [
    "Wanex Product App Conversation",
    `state:${state} | session:${sessionId ?? "none"}`,
    ...(operationId === undefined ? [] : [`operation:${operationId}`]),
    "",
    `message:${singleLine(message)}`
  ]
  return {
    kind: "product-app-tui.conversation-operation",
    sourceKind: value.kind,
    state,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(operationId === undefined ? {} : { operationId }),
    rowCount: rejectedOperation?.transcript.totalRows ?? 0,
    cancellable: rejectedOperation?.capabilities.cancellable ?? false,
    regeneratable: rejectedOperation?.capabilities.regeneratable ?? false,
    terminal: rejectedOperation?.capabilities.terminal ?? false,
    lines,
    text: lines.join("\n")
  }
}

function renderFoundOperation(
  operation: Parameters<typeof renderFoundOperationModel>[0],
  sourceKind: ProductAppTuiConversationOperation["kind"]
): ProductAppTuiRenderedConversationOperation {
  return renderFoundOperationModel(operation, sourceKind)
}

function renderFoundOperationModel(
  operation: Extract<
    ProductAppTuiConversationOperation,
    { readonly kind: "product-app.conversation-operation.found" }
  >["operation"],
  sourceKind: ProductAppTuiConversationOperation["kind"]
): ProductAppTuiRenderedConversationOperation {
  const latestAssistant = [...operation.transcript.rows]
    .reverse()
    .find((row) => row.role === "assistant" && row.text.trim().length > 0)
  const lines = [
    "Wanex Product App Conversation",
    [
      `state:${operation.state}`,
      `session:${operation.sessionId}`,
      `rows:${operation.transcript.totalRows}`,
      `terminal:${operation.capabilities.terminal ? "yes" : "no"}`
    ].join(" | "),
    `operation:${operation.operationId}`,
    [
      `cancel:${operation.capabilities.cancellable ? "enabled" : "disabled"}`,
      `regenerate:${operation.capabilities.regeneratable ? "enabled" : "disabled"}`
    ].join(" | "),
    ...(latestAssistant === undefined
      ? []
      : ["", `assistant:${singleLine(latestAssistant.text)}`]),
    ...(operation.error === undefined
      ? []
      : ["", `error:${singleLine(operation.error.message)}`])
  ]
  return {
    kind: "product-app-tui.conversation-operation",
    sourceKind,
    state: operation.state,
    sessionId: operation.sessionId,
    operationId: operation.operationId,
    rowCount: operation.transcript.totalRows,
    cancellable: operation.capabilities.cancellable,
    regeneratable: operation.capabilities.regeneratable,
    terminal: operation.capabilities.terminal,
    lines,
    text: lines.join("\n")
  }
}
