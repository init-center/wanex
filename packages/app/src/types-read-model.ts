import type {
  MessagePartVisibility,
  ResourceKind,
  RunControlPolicy,
  SessionId,
  SessionInputIntent,
  SessionInputOriginKind,
  SessionKind,
  SessionStatus
} from "@wanex/protocol"
import type { WanexAppExtensionReadModel } from "./types-extension.js"

export interface WanexAppReadModelCommands {
  readRecentSessions(
    request?: WanexAppReadRecentSessionsRequest
  ): Promise<WanexAppRecentSessionsReadModel>
  readSessionInputProvenance(
    request: WanexAppReadSessionInputProvenanceRequest
  ): Promise<WanexAppSessionInputProvenanceReadModel>
  readSessionTranscript(
    request: WanexAppReadSessionTranscriptRequest
  ): Promise<WanexAppSessionTranscriptReadModel>
  readExtensionContributions(): Promise<WanexAppExtensionReadModel>
}

export interface WanexAppReadRecentSessionsRequest {
  readonly kind?: SessionKind
  readonly status?: SessionStatus
  readonly limit?: number
}

export interface WanexAppRecentSessionsReadModel {
  readonly kind: "wanex-app.recent_sessions"
  readonly limit: number
  readonly rows: readonly WanexAppRecentSessionRow[]
}

export interface WanexAppRecentSessionRow {
  readonly sessionId: SessionId
  readonly title?: string
  readonly kind: SessionKind
  readonly status: SessionStatus
  readonly createdAt: number
  readonly updatedAt: number
  readonly archivedAt?: number
}

export interface WanexAppReadSessionInputProvenanceRequest {
  readonly sessionId: SessionId
}

export interface WanexAppReadSessionTranscriptRequest {
  readonly sessionId: SessionId
}

export interface WanexAppSessionInputProvenanceReadModel {
  readonly sessionId: SessionId
  readonly rows: readonly WanexAppSessionInputProvenanceRow[]
  readonly hasProductClientField: boolean
}

export type WanexAppSessionInputProvenanceKind =
  SessionInputOriginKind

export interface WanexAppSessionInputProvenanceRow {
  readonly inputId: string
  readonly sessionId: SessionId
  readonly kind: WanexAppSessionInputProvenanceKind
  readonly label: string
  readonly sourceRef?: string
  readonly parentRef?: string
  readonly intent?: SessionInputIntent
  readonly runControlPolicy?: RunControlPolicy
  readonly expectedTurnId?: string
  readonly metadataKeys: readonly string[]
}

export interface WanexAppSessionTranscriptReadModel {
  readonly sessionId: SessionId
  readonly rows: readonly WanexAppSessionTranscriptRow[]
}

export type WanexAppSessionTranscriptRowKind = "input" | "message"

export type WanexAppSessionTranscriptRole =
  | "user"
  | "assistant"
  | "tool"
  | "system"

export interface WanexAppSessionTranscriptRow {
  readonly id: string
  readonly kind: WanexAppSessionTranscriptRowKind
  readonly recordId: string
  readonly sessionId: SessionId
  readonly role: WanexAppSessionTranscriptRole
  readonly status: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly text: string
  readonly parts: readonly WanexAppSessionTranscriptPart[]
  readonly inputId?: string
  readonly sequence?: number
  readonly turnId?: string
  readonly attemptId?: string
}

export type WanexAppSessionTranscriptPart =
  | WanexAppSessionTranscriptTextPart
  | WanexAppSessionTranscriptReasoningPart
  | WanexAppSessionTranscriptToolCallPart
  | WanexAppSessionTranscriptToolResultPart
  | WanexAppSessionTranscriptResourcePart
  | WanexAppSessionTranscriptHiddenPart

export interface WanexAppSessionTranscriptPartBase {
  readonly partId: string
  readonly type: string
  readonly visibility: MessagePartVisibility | "default"
}

export interface WanexAppSessionTranscriptTextPart
  extends WanexAppSessionTranscriptPartBase {
  readonly type: "text"
  readonly text: string
}

export interface WanexAppSessionTranscriptReasoningPart
  extends WanexAppSessionTranscriptPartBase {
  readonly type: "reasoning"
  readonly text?: string
  readonly hidden: boolean
}

export interface WanexAppSessionTranscriptToolCallPart
  extends WanexAppSessionTranscriptPartBase {
  readonly type: "tool_call"
  readonly toolCallId: string
  readonly toolName: string
}

export interface WanexAppSessionTranscriptToolResultPart
  extends WanexAppSessionTranscriptPartBase {
  readonly type: "tool_result"
  readonly toolCallId: string
  readonly isError: boolean
}

export interface WanexAppSessionTranscriptResourcePart
  extends WanexAppSessionTranscriptPartBase {
  readonly type: "resource"
  readonly resourceId: string
  readonly sha256: string
  readonly sizeBytes: number
  readonly kind: ResourceKind
  readonly mediaType?: string
}

export interface WanexAppSessionTranscriptHiddenPart
  extends WanexAppSessionTranscriptPartBase {
  readonly type: "hidden"
  readonly sourceType: string
  readonly hidden: true
}
