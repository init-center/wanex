import type {
  WanexAppSafeCommandRequest,
  WanexAppSafeError
} from "@wanex/app"

export interface BackendResultEnvelopeCommands {
  safeCommand<T>(
    request: BackendSafeCommandRequest<T>
  ): Promise<BackendCommandEnvelope<T>>
}

export type BackendSafeCommandRequest<T> =
  WanexAppSafeCommandRequest<T>
export type BackendCommandEnvelope<T> =
  | BackendCommandSuccessEnvelope<T>
  | BackendCommandErrorEnvelope

export interface BackendCommandSuccessEnvelope<T> {
  readonly ok: true
  readonly command: string
  readonly value: T
}

export interface BackendCommandErrorEnvelope {
  readonly ok: false
  readonly command: string
  readonly error: BackendSafeError
}

export interface BackendSafeError
  extends Omit<WanexAppSafeError, "code"> {
  readonly code: BackendSafeErrorCode
}

export type BackendSafeErrorCode =
  | WanexAppSafeError["code"]
  | "unknown_command"
export type BackendSafeErrorCategory =
  WanexAppSafeError["category"]

export interface BackendCommandPortRequest {
  readonly command: string
  readonly input?: unknown
}
