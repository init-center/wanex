import type {
  ArchiveSessionRequest,
  RenameSessionRequest,
  RestoreSessionRequest,
  SessionId
} from "@wanex/protocol"
import type { WanexAppRecentSessionRow } from "./types-read-model.js"

export interface WanexAppSessionLifecycleCommands {
  readSession(
    request: WanexAppReadSessionRequest
  ): Promise<WanexAppReadSessionResult>
  renameSession(request: RenameSessionRequest): Promise<WanexAppRecentSessionRow>
  archiveSession(request: ArchiveSessionRequest): Promise<WanexAppRecentSessionRow>
  restoreSession(request: RestoreSessionRequest): Promise<WanexAppRecentSessionRow>
}

export interface WanexAppReadSessionRequest {
  readonly sessionId: SessionId
}

export type WanexAppReadSessionResult =
  | {
      readonly kind: "wanex-app.session.found"
      readonly session: WanexAppRecentSessionRow
    }
  | {
      readonly kind: "wanex-app.session.missing"
      readonly sessionId: SessionId
    }
