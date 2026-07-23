export interface WanexAppResultEnvelopeCommands {
  safeCommand<T>(
    request: WanexAppSafeCommandRequest<T>
  ): Promise<WanexAppCommandEnvelope<T>>
}

export interface WanexAppSafeCommandRequest<T> {
  readonly command: string
  run(): Promise<T> | T
}

export type WanexAppCommandEnvelope<T> =
  | WanexAppCommandSuccessEnvelope<T>
  | WanexAppCommandErrorEnvelope

export interface WanexAppCommandSuccessEnvelope<T> {
  readonly ok: true
  readonly command: string
  readonly value: T
}

export interface WanexAppCommandErrorEnvelope {
  readonly ok: false
  readonly command: string
  readonly error: WanexAppSafeError
}

export interface WanexAppSafeError {
  readonly code: WanexAppSafeErrorCode
  readonly category: WanexAppSafeErrorCategory
  readonly message: string
}

export type WanexAppSafeErrorCode =
  | "validation_error"
  | "lifecycle_error"
  | "runtime_error"
  | "unknown_error"

export type WanexAppSafeErrorCategory =
  | "validation"
  | "lifecycle"
  | "runtime"
  | "unknown"
