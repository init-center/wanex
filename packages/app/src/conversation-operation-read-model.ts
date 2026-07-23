import type {
  SchedulerJobRecord,
  SchedulerJobState,
  SessionInputRecord,
  SessionMessageRecord,
  SessionTurnRecord,
  SessionTurnState
} from "@wanex/protocol"
import { projectWanexAppSessionTranscriptReadModel } from "./read-model.js"
import type {
  WanexAppConversationOperationFoundResult,
  WanexAppConversationOperationReference,
  WanexAppConversationOperationState,
  WanexAppConversationOperationTranscript,
  WanexAppConversationOperationTranscriptRow
} from "./types-conversation-operation.js"

const DEFAULT_TRANSCRIPT_LIMIT = 50
const MAX_TRANSCRIPT_LIMIT = 200
const MAX_TRANSCRIPT_ROW_TEXT_CHARS = 8_192
const MAX_RESULT_TEXT_CHARS = 32_768

export function matchesWanexAppConversationJob(
  job: SchedulerJobRecord | null,
  reference: WanexAppConversationOperationReference
): job is SchedulerJobRecord {
  if (job === null || job.kind !== "session.turn") {
    return false
  }
  const payload = job.payload as
    | Readonly<Record<string, unknown>>
    | readonly unknown[]
    | null
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return false
  }
  const record = payload as Readonly<Record<string, unknown>>
  return (
    record.sessionId === reference.sessionId &&
    record.turnId === reference.turnId &&
    record.inputId === reference.inputId
  )
}

export function normalizeWanexAppConversationOperationState(
  state: SchedulerJobState,
  turnState?: SessionTurnState
): WanexAppConversationOperationState {
  if (turnState !== undefined) {
    switch (turnState) {
      case "queued":
        return "queued"
      case "running":
      case "cancel_requested":
      case "succeeded":
      case "failed":
      case "cancelled":
      case "interrupted":
      case "recovery_required":
        return turnState
    }
  }
  switch (state) {
    case "pending":
    case "ready":
    case "retry_scheduled":
      return "queued"
    case "running":
    case "succeeded":
    case "failed":
    case "cancelled":
      return state
  }
}

export function projectWanexAppConversationOperation(request: {
  readonly job: SchedulerJobRecord
  readonly turn: SessionTurnRecord
  readonly reference: WanexAppConversationOperationReference
  readonly input: SessionInputRecord
  readonly messages: readonly SessionMessageRecord[]
  readonly transcriptLimit?: number
}): WanexAppConversationOperationFoundResult {
  const state = normalizeWanexAppConversationOperationState(
    request.job.state,
    request.turn.state
  )
  const projectedRows = projectWanexAppSessionTranscriptReadModel(
    request.reference.sessionId,
    {
      inputs: [request.input],
      messages: request.messages
    }
  ).rows
  return {
    kind: "found",
    reference: request.reference,
    operation: {
      ...request.reference,
      state,
      createdAt: request.job.createdAt,
      updatedAt: request.job.updatedAt,
      ...(request.job.finishedAt === undefined
        ? {}
        : { finishedAt: request.job.finishedAt }),
      ...(request.turn.currentAttemptId === undefined
        ? {}
        : { activeAttemptId: request.turn.currentAttemptId }),
      transcript: projectBoundedTranscript(
        projectedRows,
        normalizeTranscriptLimit(request.transcriptLimit),
        request.reference.inputId
      ),
      ...(state === "succeeded"
        ? {
            result: projectOperationResult(
              projectedRows,
              request.messages.length
            )
          }
        : {}),
      ...(state === "failed"
        ? {
            error: {
              code: "conversation_operation_failed",
              category: "runtime",
              message:
                "conversation operation failed; see app diagnostics for details"
            } as const
          }
        : {}),
      ...(state === "recovery_required"
        ? {
            error: {
              code: "conversation_operation_recovery_required",
              category: "runtime",
              message:
                "conversation operation requires recovery review; see app diagnostics for details"
            } as const
          }
        : {})
    }
  }
}

export function projectWanexAppConversationOperationProgress(request: {
  readonly job: SchedulerJobRecord
  readonly turn: SessionTurnRecord
  readonly reference: WanexAppConversationOperationReference
}): WanexAppConversationOperationFoundResult {
  return {
    kind: "found",
    reference: request.reference,
    operation: {
      ...request.reference,
      state: normalizeWanexAppConversationOperationState(
        request.job.state,
        request.turn.state
      ),
      createdAt: request.job.createdAt,
      updatedAt: request.job.updatedAt,
      ...(request.turn.currentAttemptId === undefined
        ? {}
        : { activeAttemptId: request.turn.currentAttemptId }),
      transcript: {
        rows: [],
        totalRows: 0,
        truncated: false
      }
    }
  }
}

function projectBoundedTranscript(
  projectedRows: ReturnType<
    typeof projectWanexAppSessionTranscriptReadModel
  >["rows"],
  limit: number,
  sourceInputId: string
): WanexAppConversationOperationTranscript {
  const rows = projectedRows.map(projectBoundedTranscriptRow)
  const boundedRows = preserveSourceInput(rows, limit, sourceInputId)
  return {
    rows: boundedRows,
    totalRows: rows.length,
    truncated: rows.length > boundedRows.length || rows.some((row) => row.textTruncated)
  }
}

function preserveSourceInput(
  rows: readonly WanexAppConversationOperationTranscriptRow[],
  limit: number,
  sourceInputId: string
): readonly WanexAppConversationOperationTranscriptRow[] {
  if (rows.length <= limit) {
    return rows
  }
  const sourceInput = rows.find(
    (row) => row.role === "user" && row.inputId === sourceInputId
  )
  if (sourceInput === undefined) {
    return rows.slice(-limit)
  }
  if (limit === 1) {
    return [sourceInput]
  }
  return [
    sourceInput,
    ...rows.filter((row) => row.id !== sourceInput.id).slice(-(limit - 1))
  ]
}

function projectBoundedTranscriptRow(
  row: ReturnType<
    typeof projectWanexAppSessionTranscriptReadModel
  >["rows"][number]
): WanexAppConversationOperationTranscriptRow {
  const text = truncateText(row.text, MAX_TRANSCRIPT_ROW_TEXT_CHARS)
  return {
    id: row.id,
    kind: row.kind,
    role: row.role,
    status: row.status,
    text: text.value,
    textTruncated: text.truncated,
    parts: row.parts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.inputId === undefined ? {} : { inputId: row.inputId }),
    ...(row.turnId === undefined ? {} : { turnId: row.turnId }),
    ...(row.attemptId === undefined ? {} : { attemptId: row.attemptId })
  }
}

function projectOperationResult(
  rows: ReturnType<
    typeof projectWanexAppSessionTranscriptReadModel
  >["rows"],
  messageCount: number
) {
  const source = rows
    .filter((row) => row.kind === "message" && row.role === "assistant")
    .map((row) => row.text)
    .join("\n")
  const assistantText = truncateText(source, MAX_RESULT_TEXT_CHARS)
  return {
    assistantText: assistantText.value,
    assistantTextTruncated: assistantText.truncated,
    messageCount
  }
}

function normalizeTranscriptLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_TRANSCRIPT_LIMIT
  }
  if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_TRANSCRIPT_LIMIT) {
    throw new Error(
      `conversation operation transcriptLimit must be an integer between 1 and ${MAX_TRANSCRIPT_LIMIT}`
    )
  }
  return limit
}

function truncateText(
  value: string,
  maxChars: number
): { readonly value: string; readonly truncated: boolean } {
  if (value.length <= maxChars) {
    return { value, truncated: false }
  }
  return {
    value: value.slice(0, maxChars),
    truncated: true
  }
}
