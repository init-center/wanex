import type {
  MessagePart,
  SessionRecord,
  SessionInputOriginKind,
  SessionInputRecord,
  SessionMessageRecord
} from "@wanex/protocol"
import type {
  WanexAppRecentSessionRow,
  WanexAppRecentSessionsReadModel,
  WanexAppSessionTranscriptPart,
  WanexAppSessionTranscriptReadModel,
  WanexAppSessionTranscriptRow,
  WanexAppSessionInputProvenanceReadModel,
  WanexAppSessionInputProvenanceRow
} from "./types-read-model.js"

const provenanceLabels: Record<string, string> = {
  interactive: "Interactive",
  scheduler: "Scheduled",
  connector: "Channel",
  agent: "Agent",
  system: "System",
  objective: "Objective",
  plan: "Plan"
}

export function projectWanexAppSessionInputProvenance(
  input: SessionInputRecord
): WanexAppSessionInputProvenanceRow {
  const origin = input.origin
  const kind = origin?.kind ?? "interactive"
  return {
    inputId: input.id,
    sessionId: input.sessionId,
    kind,
    label: provenanceLabels[kind] ?? kind,
    ...(origin?.sourceRef === undefined ? {} : { sourceRef: origin.sourceRef }),
    ...(origin?.parentRef === undefined ? {} : { parentRef: origin.parentRef }),
    ...(input.intent === undefined ? {} : { intent: input.intent }),
    ...(input.runControlPolicy === undefined
      ? {}
      : { runControlPolicy: input.runControlPolicy }),
    ...(input.expectedTurnId === undefined
      ? {}
      : { expectedTurnId: input.expectedTurnId }),
    metadataKeys: Object.keys(origin?.metadata ?? {}).sort()
  }
}

export function projectWanexAppSessionInputProvenanceReadModel(
  sessionId: string,
  inputs: readonly SessionInputRecord[]
): WanexAppSessionInputProvenanceReadModel {
  return {
    sessionId,
    rows: inputs.map(projectWanexAppSessionInputProvenance),
    hasProductClientField: JSON.stringify(inputs).includes("\"client\"")
  }
}

export function projectWanexAppRecentSessionsReadModel(
  sessions: readonly SessionRecord[],
  limit: number
): WanexAppRecentSessionsReadModel {
  return {
    kind: "wanex-app.recent_sessions",
    limit,
    rows: sessions.map(projectWanexAppRecentSession)
  }
}

function projectWanexAppRecentSession(
  session: SessionRecord
): WanexAppRecentSessionRow {
  return {
    sessionId: session.id,
    ...(session.title === undefined ? {} : { title: session.title }),
    kind: session.kind,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...(session.archivedAt === undefined
      ? {}
      : { archivedAt: session.archivedAt })
  }
}

export function projectWanexAppSessionTranscriptReadModel(
  sessionId: string,
  records: {
    readonly inputs: readonly SessionInputRecord[]
    readonly messages: readonly SessionMessageRecord[]
  }
): WanexAppSessionTranscriptReadModel {
  return {
    sessionId,
    rows: [
      ...records.inputs
        .filter((input) => input.status !== "promoted" && input.status !== "completed")
        .map(projectSessionInputTranscriptRow),
      ...records.messages.map(projectSessionMessageTranscriptRow)
    ].sort(compareTranscriptRows)
  }
}

function projectSessionInputTranscriptRow(
  input: SessionInputRecord
): WanexAppSessionTranscriptRow {
  const parts = input.content.map(projectTranscriptPart)
  return {
    id: `input:${input.id}`,
    kind: "input",
    recordId: input.id,
    sessionId: input.sessionId,
    role: input.inputType,
    status: input.status,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    text: transcriptText(parts),
    parts,
    inputId: input.id
  }
}

function projectSessionMessageTranscriptRow(
  message: SessionMessageRecord
): WanexAppSessionTranscriptRow {
  const parts = message.content.map(projectTranscriptPart)
  return {
    id: `message:${message.id}`,
    kind: "message",
    recordId: message.id,
    sessionId: message.sessionId,
    role: message.role,
    status: message.status,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    text: transcriptText(parts),
    parts,
    sequence: message.sequence,
    turnId: message.turnId,
    ...(message.inputId === undefined ? {} : { inputId: message.inputId }),
    ...(message.attemptId === undefined ? {} : { attemptId: message.attemptId })
  }
}

function projectTranscriptPart(
  part: MessagePart
): WanexAppSessionTranscriptPart {
  const visibility = part.visibility ?? "default"
  if (visibility === "internal" || visibility === "provider_replay_only") {
    return {
      partId: part.id,
      type: "hidden",
      sourceType: part.type,
      visibility,
      hidden: true
    }
  }

  switch (part.type) {
    case "text":
      return {
        partId: part.id,
        type: "text",
        visibility,
        text: part.text
      }
    case "reasoning":
      return {
        partId: part.id,
        type: "reasoning",
        visibility,
        ...(part.text === undefined ? {} : { text: part.text }),
        hidden: false
      }
    case "tool_call":
      return {
        partId: part.id,
        type: "tool_call",
        visibility,
        toolCallId: part.toolCallId,
        toolName: part.toolName
      }
    case "tool_result":
      return {
        partId: part.id,
        type: "tool_result",
        visibility,
        toolCallId: part.toolCallId,
        isError: part.isError
      }
    case "resource":
      return {
        partId: part.id,
        type: "resource",
        visibility,
        resourceId: part.resourceId,
        sha256: part.sha256,
        sizeBytes: part.sizeBytes,
        kind: part.kind,
        ...(part.mediaType === undefined ? {} : { mediaType: part.mediaType })
      }
  }
}

function transcriptText(
  parts: readonly WanexAppSessionTranscriptPart[]
): string {
  return parts.map(transcriptPartText).filter(Boolean).join("\n")
}

function transcriptPartText(
  part: WanexAppSessionTranscriptPart
): string {
  switch (part.type) {
    case "text":
      return part.text
    case "reasoning":
      return part.hidden ? "" : part.text ?? ""
    case "resource":
      return `[resource:${part.resourceId}]`
    case "tool_call":
      return `[tool_call:${part.toolName}]`
    case "tool_result":
      return part.isError ? "[tool_result:error]" : "[tool_result]"
    case "hidden":
      return ""
  }
}

function compareTranscriptRows(
  left: WanexAppSessionTranscriptRow,
  right: WanexAppSessionTranscriptRow
): number {
  return (
    (left.sequence ?? Number.MAX_SAFE_INTEGER) -
      (right.sequence ?? Number.MAX_SAFE_INTEGER) ||
    left.createdAt - right.createdAt ||
    rowKindOrder(left.kind) - rowKindOrder(right.kind) ||
    left.recordId.localeCompare(right.recordId)
  )
}

function rowKindOrder(kind: WanexAppSessionTranscriptRow["kind"]): number {
  return kind === "input" ? 0 : 1
}
