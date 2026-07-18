import type {
  MessagePart,
  SessionRecord,
  SessionInputOriginKind,
  SessionInputRecord,
  SessionMessageRecord
} from "@wanex/protocol"
import type {
  WanexAppShellRecentSessionRow,
  WanexAppShellRecentSessionsReadModel,
  WanexAppShellSessionTranscriptPart,
  WanexAppShellSessionTranscriptReadModel,
  WanexAppShellSessionTranscriptRow,
  WanexAppShellSessionInputProvenanceReadModel,
  WanexAppShellSessionInputProvenanceRow
} from "./types-read-model.js"

const provenanceLabels: Record<SessionInputOriginKind, string> = {
  interactive: "Interactive",
  scheduler: "Scheduled",
  connector: "Channel",
  agent: "Agent",
  system: "System",
  objective: "Objective",
  plan: "Plan"
}

export function projectWanexAppShellSessionInputProvenance(
  input: SessionInputRecord
): WanexAppShellSessionInputProvenanceRow {
  const origin = input.origin
  const kind = origin?.kind ?? "interactive"
  return {
    inputId: input.id,
    sessionId: input.sessionId,
    kind,
    label: provenanceLabels[kind],
    ...(origin?.sourceRef === undefined ? {} : { sourceRef: origin.sourceRef }),
    ...(origin?.parentRef === undefined ? {} : { parentRef: origin.parentRef }),
    ...(input.intent === undefined ? {} : { intent: input.intent }),
    ...(input.runControlPolicy === undefined
      ? {}
      : { runControlPolicy: input.runControlPolicy }),
    ...(input.expectedRunId === undefined
      ? {}
      : { expectedRunId: input.expectedRunId }),
    metadataKeys: Object.keys(origin?.metadata ?? {}).sort()
  }
}

export function projectWanexAppShellSessionInputProvenanceReadModel(
  sessionId: string,
  inputs: readonly SessionInputRecord[]
): WanexAppShellSessionInputProvenanceReadModel {
  return {
    sessionId,
    rows: inputs.map(projectWanexAppShellSessionInputProvenance),
    hasProductClientField: JSON.stringify(inputs).includes("\"client\"")
  }
}

export function projectWanexAppShellRecentSessionsReadModel(
  sessions: readonly SessionRecord[],
  limit: number
): WanexAppShellRecentSessionsReadModel {
  return {
    kind: "app-shell.recent_sessions",
    limit,
    rows: sessions.map(projectWanexAppShellRecentSession)
  }
}

function projectWanexAppShellRecentSession(
  session: SessionRecord
): WanexAppShellRecentSessionRow {
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

export function projectWanexAppShellSessionTranscriptReadModel(
  sessionId: string,
  records: {
    readonly inputs: readonly SessionInputRecord[]
    readonly messages: readonly SessionMessageRecord[]
  }
): WanexAppShellSessionTranscriptReadModel {
  return {
    sessionId,
    rows: [
      ...records.inputs.map(projectSessionInputTranscriptRow),
      ...records.messages.map(projectSessionMessageTranscriptRow)
    ].sort(compareTranscriptRows)
  }
}

function projectSessionInputTranscriptRow(
  input: SessionInputRecord
): WanexAppShellSessionTranscriptRow {
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
): WanexAppShellSessionTranscriptRow {
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
    ...(message.inputId === undefined ? {} : { inputId: message.inputId }),
    ...(message.runId === undefined ? {} : { runId: message.runId })
  }
}

function projectTranscriptPart(
  part: MessagePart
): WanexAppShellSessionTranscriptPart {
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
        ...(part.mediaType === undefined ? {} : { mediaType: part.mediaType })
      }
    case "ui_surface": {
      const fallback = part.surface.fallback
      return {
        partId: part.id,
        type: "ui_surface",
        visibility,
        protocol: part.surface.protocol,
        surfaceKind: part.surface.surfaceKind,
        ...(fallback?.kind === "text" ? { fallbackText: fallback.text } : {}),
        ...(fallback?.kind === "resource"
          ? { fallbackResourceId: fallback.resourceId }
          : {})
      }
    }
  }
}

function transcriptText(
  parts: readonly WanexAppShellSessionTranscriptPart[]
): string {
  return parts.map(transcriptPartText).filter(Boolean).join("\n")
}

function transcriptPartText(
  part: WanexAppShellSessionTranscriptPart
): string {
  switch (part.type) {
    case "text":
      return part.text
    case "reasoning":
      return part.hidden ? "" : part.text ?? ""
    case "resource":
      return `[resource:${part.resourceId}]`
    case "ui_surface":
      return part.fallbackText ?? (
        part.fallbackResourceId === undefined
          ? `[ui:${part.surfaceKind}]`
          : `[resource:${part.fallbackResourceId}]`
      )
    case "tool_call":
      return `[tool_call:${part.toolName}]`
    case "tool_result":
      return part.isError ? "[tool_result:error]" : "[tool_result]"
    case "hidden":
      return ""
  }
}

function compareTranscriptRows(
  left: WanexAppShellSessionTranscriptRow,
  right: WanexAppShellSessionTranscriptRow
): number {
  return (
    left.createdAt - right.createdAt ||
    rowKindOrder(left.kind) - rowKindOrder(right.kind) ||
    left.recordId.localeCompare(right.recordId)
  )
}

function rowKindOrder(kind: WanexAppShellSessionTranscriptRow["kind"]): number {
  return kind === "input" ? 0 : 1
}
