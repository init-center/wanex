import type {
  ConversationSourceResult,
  ConversationHistorySourceResult,
  ConversationHistoryRow,
  ConversationViewModel
} from "../model.js"
import type {
  SurfaceEvent
} from "@wanex/assistant"

const MAX_TRANSIENT_ASSISTANT_CHARS = 65_536

const emptyHistoryPage = {
  limit: 100,
  hasMore: false,
  liveRowsTruncated: false
} as const

export function idleConversation(
  selectedSessionId: string | undefined
): ConversationViewModel {
  return {
    kind: "web.conversation",
    state: "idle",
    ...(selectedSessionId === undefined ? {} : { sessionId: selectedSessionId }),
    historyRows: [],
    historyPage: emptyHistoryPage,
    historyExpanded: false,
    canSubmit: true,
    canQueueFollowUp: false,
    canSteer: false,
    canCancel: false,
    canRegenerate: false
  }
}

export function projectConversationFromResult(
  result: ConversationSourceResult,
  previous?: ConversationViewModel
): ConversationViewModel {
  if (result.kind === "assistant.conversation-operation.cancel") {
    return projectConversationFromResult(result.operation, previous)
  }
  if (result.kind === "assistant.conversation-recovery.resolved") {
    return projectConversationFromResult(result.operation, previous)
  }
  if (result.kind === "assistant.conversation-approval.resolved") {
    return projectConversationFromResult(result.operation, previous)
  }
  if (result.kind === "assistant.conversation-operation.found") {
    const operation = result.operation
    const preserveTransient =
      !operation.capabilities.terminal &&
      !hasCanonicalAssistantText(operation) &&
      previous?.operationId === operation.operationId
    return {
      kind: "web.conversation",
      state: operation.state,
      operationId: operation.operationId,
      sessionId: operation.sessionId,
      operation,
      ...(result.pendingFollowUp === undefined
        ? {}
        : { pendingFollowUp: result.pendingFollowUp }),
      historyRows: previous?.historyRows ?? [],
      historyPage: previous?.historyPage ?? emptyHistoryPage,
      historyExpanded: previous?.historyExpanded ?? false,
      ...(preserveTransient && previous?.transientAssistantText !== undefined
        ? { transientAssistantText: previous.transientAssistantText }
        : {}),
      canSubmit: operation.capabilities.terminal,
      canQueueFollowUp:
        result.pendingFollowUp === undefined &&
        (operation.state === "queued" ||
          operation.state === "running" ||
          operation.state === "waiting" ||
          operation.state === "cancel_requested"),
      canSteer: operation.capabilities.steerable,
      canCancel: operation.capabilities.cancellable,
      canRegenerate: operation.capabilities.regeneratable
    }
  }
  if (result.kind === "assistant.conversation-operation.untracked") {
    if (
      result.sessionId === undefined &&
      previous?.state === "rejected" &&
      previous.sessionId === undefined
    ) {
      return previous
    }
    return {
      kind: "web.conversation",
      state: "untracked",
      ...(result.sessionId === undefined ? {} : { sessionId: result.sessionId }),
      message: result.message,
      historyRows: previous?.historyRows ?? [],
      historyPage: previous?.historyPage ?? emptyHistoryPage,
      historyExpanded: previous?.historyExpanded ?? false,
      canSubmit: true,
      canQueueFollowUp: false,
      canSteer: false,
      canCancel: false,
      canRegenerate: false
    }
  }
  if (result.kind === "assistant.conversation-operation.missing") {
    return {
      kind: "web.conversation",
      state: "missing",
      operationId: result.operationId,
      sessionId: result.sessionId,
      message: result.message,
      historyRows: previous?.historyRows ?? [],
      historyPage: previous?.historyPage ?? emptyHistoryPage,
      historyExpanded: previous?.historyExpanded ?? false,
      canSubmit: true,
      canQueueFollowUp: false,
      canSteer: false,
      canCancel: false,
      canRegenerate: false
    }
  }
  return {
    kind: "web.conversation",
    state: "rejected",
    ...(result.sessionId === undefined ? {} : { sessionId: result.sessionId }),
    ...(result.operation === undefined
      ? {}
      : {
          operationId: result.operation.operationId,
          operation: result.operation
        }),
    ...(previous?.pendingFollowUp === undefined
      ? {}
      : { pendingFollowUp: previous.pendingFollowUp }),
    message: result.message,
    historyRows: previous?.historyRows ?? [],
    historyPage: previous?.historyPage ?? emptyHistoryPage,
    historyExpanded: previous?.historyExpanded ?? false,
    canSubmit:
      result.operation?.capabilities.terminal ??
      result.reason !== "operation_active",
    canQueueFollowUp:
      previous?.pendingFollowUp === undefined &&
      result.reason !== "guided_follow_up_pending" &&
      (result.operation?.state === "queued" ||
        result.operation?.state === "running" ||
        result.operation?.state === "waiting" ||
        result.operation?.state === "cancel_requested"),
    canSteer: result.operation?.capabilities.steerable ?? false,
    canCancel: result.operation?.capabilities.cancellable ?? false,
    canRegenerate: result.operation?.capabilities.regeneratable ?? false
  }
}

export function applyConversationHistory(
  conversation: ConversationViewModel,
  result: ConversationHistorySourceResult
): ConversationViewModel {
  if (result.kind === "assistant.session-transcript.no-session") {
    return conversation.sessionId === undefined
      ? {
          ...conversation,
          historyRows: [],
          historyPage: emptyHistoryPage,
          historyExpanded: false
        }
      : conversation
  }
  if (
    conversation.sessionId !== undefined &&
    conversation.sessionId !== result.sessionId
  ) {
    return conversation
  }
  const candidate: ConversationViewModel = {
    ...conversation,
    sessionId: result.sessionId,
    historyRows: result.transcript.rows,
    historyPage: result.transcript.page,
    historyExpanded: false
  }
  return preserveExpandedConversationHistory(conversation, candidate)
}

export function prependConversationHistory(
  conversation: ConversationViewModel,
  result: ConversationHistorySourceResult
): ConversationViewModel {
  if (result.kind === "assistant.session-transcript.no-session") return conversation
  if (
    conversation.sessionId !== undefined &&
    conversation.sessionId !== result.sessionId
  ) return conversation
  const byId = new Map<string, ConversationHistoryRow>()
  for (const row of result.transcript.rows) byId.set(row.id, row)
  for (const row of conversation.historyRows) byId.set(row.id, row)
  return {
    ...conversation,
    sessionId: result.sessionId,
    historyRows: orderedRows(
      [...result.transcript.rows, ...conversation.historyRows],
      byId
    ),
    historyPage: {
      ...result.transcript.page,
      liveRowsTruncated: conversation.historyPage.liveRowsTruncated
    },
    historyExpanded: true
  }
}

export function preserveExpandedConversationHistory(
  current: ConversationViewModel,
  candidate: ConversationViewModel
): ConversationViewModel {
  if (
    !current.historyExpanded ||
    current.sessionId === undefined ||
    candidate.sessionId !== current.sessionId
  ) return candidate
  const stableRows = current.historyRows.filter(
    (row) =>
      row.kind === "message" ||
      (row.status !== "admitted" && row.status !== "control_pending")
  )
  const byId = new Map<string, ConversationHistoryRow>()
  for (const row of stableRows) byId.set(row.id, row)
  for (const row of candidate.historyRows) byId.set(row.id, row)
  return {
    ...candidate,
    historyRows: orderedRows([...stableRows, ...candidate.historyRows], byId),
    historyPage: {
      limit: current.historyPage.limit,
      hasMore: current.historyPage.hasMore,
      ...(current.historyPage.nextCursor === undefined
        ? {}
        : { nextCursor: current.historyPage.nextCursor }),
      liveRowsTruncated: candidate.historyPage.liveRowsTruncated
    },
    historyExpanded: true
  }
}

export function applyConversationEvents(
  conversation: ConversationViewModel,
  events: readonly SurfaceEvent[]
): ConversationViewModel {
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
      delta.kind !== "assistant.conversation.assistant-text-delta" ||
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

export function normalizeConversationForSelectedSession(
  conversation: ConversationViewModel,
  selectedSessionId: string | undefined
): ConversationViewModel {
  if (selectedSessionId === undefined) {
    return conversation.state === "rejected" && conversation.sessionId === undefined
      ? conversation
      : idleConversation(undefined)
  }
  if (
    conversation.sessionId !== undefined &&
    conversation.sessionId !== selectedSessionId
  ) {
    return idleConversation(selectedSessionId)
  }
  return {
    ...conversation,
    sessionId: conversation.sessionId ?? selectedSessionId
  }
}

function hasCanonicalAssistantText(
  operation: NonNullable<ConversationViewModel["operation"]>
): boolean {
  return operation.transcript.rows.some(
    (row) =>
      row.role === "assistant" &&
      row.parts.some(
        (part) => part.type === "text" && part.text.trim().length > 0
      )
  )
}

function orderedRows(
  source: readonly ConversationHistoryRow[],
  byId: ReadonlyMap<string, ConversationHistoryRow>
): readonly ConversationHistoryRow[] {
  const seen = new Set<string>()
  return source.flatMap((row) => {
    if (seen.has(row.id)) return []
    seen.add(row.id)
    const current = byId.get(row.id)
    return current === undefined ? [] : [current]
  })
}
