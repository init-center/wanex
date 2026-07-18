import type {
  WanexAppShellSafeCommandRequest,
  WanexAppShellSafeError
} from "@wanex/app/backend"

export interface ProductAppBackendResultEnvelopeCommands {
  safeCommand<T>(
    request: ProductAppBackendSafeCommandRequest<T>
  ): Promise<ProductAppBackendCommandEnvelope<T>>
}

export type ProductAppBackendSafeCommandRequest<T> =
  WanexAppShellSafeCommandRequest<T>
export type ProductAppBackendCommandEnvelope<T> =
  | ProductAppBackendCommandSuccessEnvelope<T>
  | ProductAppBackendCommandErrorEnvelope

export interface ProductAppBackendCommandSuccessEnvelope<T> {
  readonly ok: true
  readonly command: string
  readonly value: T
}

export interface ProductAppBackendCommandErrorEnvelope {
  readonly ok: false
  readonly command: string
  readonly error: ProductAppBackendSafeError
}

export interface ProductAppBackendSafeError
  extends Omit<WanexAppShellSafeError, "code"> {
  readonly code: ProductAppBackendSafeErrorCode
}

export type ProductAppBackendSafeErrorCode =
  | WanexAppShellSafeError["code"]
  | "unknown_command"
export type ProductAppBackendSafeErrorCategory =
  WanexAppShellSafeError["category"]

export interface ProductAppBackendCommandPortRequest {
  readonly command: string
  readonly input?: unknown
}
