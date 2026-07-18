import type {
  MessagePartVisibility,
  RunControlPolicy,
  SessionId,
  SessionInputIntent,
  SessionInputOriginKind,
  SessionKind,
  SessionStatus
} from "@wanex/protocol"
import type { WanexAppShellExtensionReadModel } from "./types-extension.js"

export interface WanexAppShellReadModelCommands {
  readRecentSessions(
    request?: WanexAppShellReadRecentSessionsRequest
  ): Promise<WanexAppShellRecentSessionsReadModel>
  readSessionInputProvenance(
    request: WanexAppShellReadSessionInputProvenanceRequest
  ): Promise<WanexAppShellSessionInputProvenanceReadModel>
  readSessionTranscript(
    request: WanexAppShellReadSessionTranscriptRequest
  ): Promise<WanexAppShellSessionTranscriptReadModel>
  readExtensionContributions(): Promise<WanexAppShellExtensionReadModel>
}

export interface WanexAppShellReadRecentSessionsRequest {
  readonly kind?: SessionKind
  readonly status?: SessionStatus
  readonly limit?: number
}

export interface WanexAppShellRecentSessionsReadModel {
  readonly kind: "app-shell.recent_sessions"
  readonly limit: number
  readonly rows: readonly WanexAppShellRecentSessionRow[]
}

export interface WanexAppShellRecentSessionRow {
  readonly sessionId: SessionId
  readonly title?: string
  readonly kind: SessionKind
  readonly status: SessionStatus
  readonly createdAt: number
  readonly updatedAt: number
  readonly archivedAt?: number
}

export interface WanexAppShellReadSessionInputProvenanceRequest {
  readonly sessionId: SessionId
}

export interface WanexAppShellReadSessionTranscriptRequest {
  readonly sessionId: SessionId
}

export interface WanexAppShellSessionInputProvenanceReadModel {
  readonly sessionId: SessionId
  readonly rows: readonly WanexAppShellSessionInputProvenanceRow[]
  readonly hasProductClientField: boolean
}

export type WanexAppShellSessionInputProvenanceKind =
  SessionInputOriginKind

export interface WanexAppShellSessionInputProvenanceRow {
  readonly inputId: string
  readonly sessionId: SessionId
  readonly kind: WanexAppShellSessionInputProvenanceKind
  readonly label: string
  readonly sourceRef?: string
  readonly parentRef?: string
  readonly intent?: SessionInputIntent
  readonly runControlPolicy?: RunControlPolicy
  readonly expectedRunId?: string
  readonly metadataKeys: readonly string[]
}

export interface WanexAppShellSessionTranscriptReadModel {
  readonly sessionId: SessionId
  readonly rows: readonly WanexAppShellSessionTranscriptRow[]
}

export type WanexAppShellSessionTranscriptRowKind = "input" | "message"

export type WanexAppShellSessionTranscriptRole =
  | "user"
  | "assistant"
  | "tool"
  | "system"

export interface WanexAppShellSessionTranscriptRow {
  readonly id: string
  readonly kind: WanexAppShellSessionTranscriptRowKind
  readonly recordId: string
  readonly sessionId: SessionId
  readonly role: WanexAppShellSessionTranscriptRole
  readonly status: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly text: string
  readonly parts: readonly WanexAppShellSessionTranscriptPart[]
  readonly inputId?: string
  readonly runId?: string
}

export type WanexAppShellSessionTranscriptPart =
  | WanexAppShellSessionTranscriptTextPart
  | WanexAppShellSessionTranscriptReasoningPart
  | WanexAppShellSessionTranscriptToolCallPart
  | WanexAppShellSessionTranscriptToolResultPart
  | WanexAppShellSessionTranscriptResourcePart
  | WanexAppShellSessionTranscriptUiSurfacePart
  | WanexAppShellSessionTranscriptHiddenPart

export interface WanexAppShellSessionTranscriptPartBase {
  readonly partId: string
  readonly type: string
  readonly visibility: MessagePartVisibility | "default"
}

export interface WanexAppShellSessionTranscriptTextPart
  extends WanexAppShellSessionTranscriptPartBase {
  readonly type: "text"
  readonly text: string
}

export interface WanexAppShellSessionTranscriptReasoningPart
  extends WanexAppShellSessionTranscriptPartBase {
  readonly type: "reasoning"
  readonly text?: string
  readonly hidden: boolean
}

export interface WanexAppShellSessionTranscriptToolCallPart
  extends WanexAppShellSessionTranscriptPartBase {
  readonly type: "tool_call"
  readonly toolCallId: string
  readonly toolName: string
}

export interface WanexAppShellSessionTranscriptToolResultPart
  extends WanexAppShellSessionTranscriptPartBase {
  readonly type: "tool_result"
  readonly toolCallId: string
  readonly isError: boolean
}

export interface WanexAppShellSessionTranscriptResourcePart
  extends WanexAppShellSessionTranscriptPartBase {
  readonly type: "resource"
  readonly resourceId: string
  readonly mediaType?: string
}

export interface WanexAppShellSessionTranscriptUiSurfacePart
  extends WanexAppShellSessionTranscriptPartBase {
  readonly type: "ui_surface"
  readonly protocol: string
  readonly surfaceKind: string
  readonly fallbackText?: string
  readonly fallbackResourceId?: string
}

export interface WanexAppShellSessionTranscriptHiddenPart
  extends WanexAppShellSessionTranscriptPartBase {
  readonly type: "hidden"
  readonly sourceType: string
  readonly hidden: true
}
