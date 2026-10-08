import type { BackendSessionTranscriptReadModel } from "@wanex/assistant/backend"
import { conversationHistoryRowId } from "./history-row.js"
import type { ConversationHistoryReadModel, ConversationHistoryRow } from "./model.js"
import type {
  WorkspaceChangeSummary,
  WorkspaceChangeToolCall,
  WorkspaceReviewPort,
} from "../workspace-review.js"

const MAX_TOOL_CALLS_PER_PAGE = 64

/**
 * Attach change summaries to the already projected conversation rows.
 * The Host remains the authority: this function only supplies exact transcript
 * coordinates and projects opaque summaries back onto their source row.
 */
export async function attachWorkspaceChanges(
  history: ConversationHistoryReadModel,
  transcript: BackendSessionTranscriptReadModel,
  port: WorkspaceReviewPort | undefined,
): Promise<ConversationHistoryReadModel> {
  if (port === undefined) return history

  const toolCalls: WorkspaceChangeToolCall[] = []
  for (const row of transcript.rows) {
    if (row.role !== "assistant" || row.turnId === undefined) continue
    for (const part of row.parts) {
      if (part.type !== "tool_call") continue
      if (toolCalls.length === MAX_TOOL_CALLS_PER_PAGE) break
      toolCalls.push({
        key: workspaceChangeToolCallKey(row.id, part.toolCallId),
        turnId: row.turnId,
        sourceMessageId: row.recordId,
        toolCallId: part.toolCallId,
        toolName: part.toolName,
      })
    }
    if (toolCalls.length === MAX_TOOL_CALLS_PER_PAGE) break
  }
  if (toolCalls.length === 0) return history

  const entries = await port.listChanges({
    sessionId: transcript.sessionId,
    toolCalls,
  })
  if (entries.length === 0) return history

  const changesByRow = new Map<string, WorkspaceChangeSummary[]>()
  const toolCallRows = new Map(
    transcript.rows.map((row) => [
      workspaceChangeToolCallKey(row.id, ""),
      conversationHistoryRowId(transcript.sessionId, row.id),
    ]),
  )
  const rowIdByToolKey = new Map(
    toolCalls.map((toolCall) => {
      const separator = toolCall.key.lastIndexOf("\u0000")
      const sourceRowId = separator < 0 ? "" : toolCall.key.slice(0, separator)
      return [
        toolCall.key,
        toolCallRows.get(workspaceChangeToolCallKey(sourceRowId, "")),
      ] as const
    }),
  )

  for (const entry of entries) {
    if (entry.changes.length === 0) continue
    const rowId = rowIdByToolKey.get(entry.key)
    if (rowId === undefined) continue
    const current = changesByRow.get(rowId) ?? []
    current.push(...entry.changes)
    changesByRow.set(rowId, current)
  }
  if (changesByRow.size === 0) return history

  return {
    ...history,
    rows: history.rows.map((row) => {
      const changes = changesByRow.get(row.id)
      return changes === undefined
        ? row
        : withWorkspaceChanges(row, changes)
    }),
  }
}

function withWorkspaceChanges(
  row: ConversationHistoryRow,
  changes: readonly WorkspaceChangeSummary[],
): ConversationHistoryRow {
  return {
    ...row,
    ...(changes.length === 0 ? {} : { workspaceChanges: changes }),
  }
}

function workspaceChangeToolCallKey(rowId: string, toolCallId: string): string {
  return `${rowId}\u0000${toolCallId}`
}
