export interface WanexAppShellResultEnvelopeCommands {
  safeCommand<T>(
    request: WanexAppShellSafeCommandRequest<T>
  ): Promise<WanexAppShellCommandEnvelope<T>>
}

export interface WanexAppShellSafeCommandRequest<T> {
  readonly command: string
  run(): Promise<T> | T
}

export type WanexAppShellCommandEnvelope<T> =
  | WanexAppShellCommandSuccessEnvelope<T>
  | WanexAppShellCommandErrorEnvelope

export interface WanexAppShellCommandSuccessEnvelope<T> {
  readonly ok: true
  readonly command: string
  readonly value: T
}

export interface WanexAppShellCommandErrorEnvelope {
  readonly ok: false
  readonly command: string
  readonly error: WanexAppShellSafeError
}

export interface WanexAppShellSafeError {
  readonly code: WanexAppShellSafeErrorCode
  readonly category: WanexAppShellSafeErrorCategory
  readonly message: string
}

export type WanexAppShellSafeErrorCode =
  | "validation_error"
  | "lifecycle_error"
  | "runtime_error"
  | "unknown_error"

export type WanexAppShellSafeErrorCategory =
  | "validation"
  | "lifecycle"
  | "runtime"
  | "unknown"
