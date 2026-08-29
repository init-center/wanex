import type {
  TuiConversationOperation,
  TuiRenderedConversationOperation
} from "../model.js"
import { singleLine } from "../line-session/text.js"

export function renderTuiConversationOperation(
  value: TuiConversationOperation
): TuiRenderedConversationOperation {
  if (value.kind === "assistant.conversation-operation.cancel") {
    const rendered = renderTuiConversationOperation(value.operation)
    const lines = [
      "Conversation",
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
  if (value.kind === "assistant.conversation-operation.found") {
    return renderFoundOperation(value.operation, value.kind)
  }
  const sessionId = value.sessionId
  const rejectedOperation =
    value.kind === "assistant.conversation-operation.rejected"
      ? value.operation
      : undefined
  const operationId =
    value.kind === "assistant.conversation-operation.missing"
      ? value.operationId
      : rejectedOperation?.operationId
  const state =
    value.kind === "assistant.conversation-operation.rejected"
      ? "rejected"
      : value.kind === "assistant.conversation-operation.missing"
        ? "missing"
        : "untracked"
  const message = value.message
  const lines = [
    "Conversation",
    `state:${state} | session:${sessionId ?? "none"}`,
    ...(operationId === undefined ? [] : [`operation:${operationId}`]),
    "",
    `message:${singleLine(message)}`
  ]
  return {
    kind: "tui.conversation-operation",
    sourceKind: value.kind,
    state,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(operationId === undefined ? {} : { operationId }),
    rowCount: rejectedOperation?.transcript.totalRows ?? 0,
    steerable: rejectedOperation?.capabilities.steerable ?? false,
    cancellable: rejectedOperation?.capabilities.cancellable ?? false,
    regeneratable: rejectedOperation?.capabilities.regeneratable ?? false,
    terminal: rejectedOperation?.capabilities.terminal ?? false,
    lines,
    text: lines.join("\n")
  }
}

function renderFoundOperation(
  operation: Parameters<typeof renderFoundOperationModel>[0],
  sourceKind: TuiConversationOperation["kind"]
): TuiRenderedConversationOperation {
  return renderFoundOperationModel(operation, sourceKind)
}

function renderFoundOperationModel(
  operation: Extract<
    TuiConversationOperation,
    { readonly kind: "assistant.conversation-operation.found" }
  >["operation"],
  sourceKind: TuiConversationOperation["kind"]
): TuiRenderedConversationOperation {
  const latestAssistant = [...operation.transcript.rows]
    .reverse()
    .map((row) => ({ role: row.role, text: conversationRowText(row) }))
    .find((row) => row.role === "assistant" && row.text.trim().length > 0)
  const latestUser = [...operation.transcript.rows]
    .reverse()
    .map((row) => ({ role: row.role, text: conversationRowText(row) }))
    .find((row) => row.role === "user" && row.text.trim().length > 0)
  const timelineLines = operation.transcript.rows.flatMap((row) =>
    row.parts.flatMap((part) => {
      switch (part.type) {
        case "reasoning":
          return [`reasoning:${singleLine(part.text)}`]
        case "tool":
          return renderToolLines(part)
        case "resource":
          return [`resource:${part.kind}:${singleLine(part.resourceId)}`]
        case "text":
          return []
      }
    })
  )
  const capabilityLines = [
    ...new Set(
      operation.transcript.rows
        .flatMap((row) => row.capabilityRequests)
        .filter((request) => request.setupRequired)
        .map((request) => `capability:${request.operation}:setup-required`)
    )
  ]
  const approvalLines = operation.approvals?.items.flatMap((approval) => [
    `approval:${approval.approvalId} | tool:${singleLine(approval.tool.title)} | risk:${approval.tool.risk}`,
    `approval-summary:${singleLine(approval.presentation.summary)}`,
    ...approval.presentation.details.map(
      (detail) =>
        `approval-detail:${singleLine(detail.label)}=${singleLine(detail.value)}`
    ),
    `approval-actions:${approval.availableDecisions.join(",")}`
  ]) ?? []
  const capacityLines = operation.error?.category === "capacity"
    ? capacityErrorLines(operation.error, latestUser?.text)
    : []
  const steeringLines = operation.steering?.pending.map(
    (steering) => `steering-pending:${singleLine(steering.text)}`
  ) ?? []
  const lines = [
    "Conversation",
    [
      `state:${operation.state}`,
      `session:${operation.sessionId}`,
      `rows:${operation.transcript.totalRows}`,
      `terminal:${operation.capabilities.terminal ? "yes" : "no"}`
    ].join(" | "),
    `operation:${operation.operationId}`,
    [
      `cancel:${operation.capabilities.cancellable ? "enabled" : "disabled"}`,
      `steer:${operation.capabilities.steerable ? "enabled" : "disabled"}`,
      `regenerate:${operation.capabilities.regeneratable ? "enabled" : "disabled"}`
    ].join(" | "),
    ...capabilityLines,
    ...timelineLines,
    ...approvalLines,
    ...steeringLines,
    ...capacityLines,
    ...(latestAssistant === undefined
      ? []
      : ["", `assistant:${singleLine(latestAssistant.text)}`]),
    ...(operation.error === undefined
      ? []
      : ["", `error:${singleLine(operation.error.message)}`])
  ]
  return {
    kind: "tui.conversation-operation",
    sourceKind,
    state: operation.state,
    sessionId: operation.sessionId,
    operationId: operation.operationId,
    rowCount: operation.transcript.totalRows,
    steerable: operation.capabilities.steerable,
    cancellable: operation.capabilities.cancellable,
    regeneratable: operation.capabilities.regeneratable,
    terminal: operation.capabilities.terminal,
    lines,
    text: lines.join("\n")
  }
}

function renderToolLines(
  part: Extract<
    Extract<
      TuiConversationOperation,
      { readonly kind: "assistant.conversation-operation.found" }
    >["operation"]["transcript"]["rows"][number]["parts"][number],
    { readonly type: "tool" }
  >
): readonly string[] {
  const summary = part.presentation?.summary ?? part.name
  const details = part.presentation?.details ?? []
  return [
    `tool:${singleLine(summary)}:${part.state}`,
    ...details.map(
      (detail) =>
        `tool-detail:${singleLine(detail.label)}=${singleLine(detail.value)}`
    )
  ]
}

function conversationRowText(row: {
  readonly parts: Extract<
    TuiConversationOperation,
    { readonly kind: "assistant.conversation-operation.found" }
  >["operation"]["transcript"]["rows"][number]["parts"]
}): string {
  return row.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
}

function capacityErrorLines(
  error: Extract<
    NonNullable<
      import("@wanex/assistant").ConversationOperationReadModel["error"]
    >,
    { readonly category: "capacity" }
  >,
  userText: string | undefined
): readonly string[] {
  const capacity = error.capacity
  return [
    `capacity-model:${singleLine(error.modelEndpointId)}`,
    ...(capacity.reasons.includes("input_tokens_exceeded")
      ? [
          `capacity-tokens:${capacity.inputTokens}/${capacity.inputTokenCeiling ?? "unknown"}`
        ]
      : []),
    ...(capacity.reasons.includes("input_resources_exceeded")
      ? [
          `capacity-resources:${capacity.inputResources}/${capacity.maxInputResources ?? "unknown"}`
        ]
      : []),
    `capacity-output-reserve:${capacity.requestedOutputTokens}`,
    `capacity-compaction:${capacity.compactionAttempted ? "attempted" : "not-attempted"}`,
    ...(userText === undefined
      ? []
      : [`request:${singleLine(userText).slice(0, 4_096)}`]),
    "capacity-actions:model <endpoint-id>, regenerate [session-id]"
  ]
}
