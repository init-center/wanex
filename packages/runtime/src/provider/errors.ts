import type { ProviderError, ProviderErrorEvent } from "./types.js"

export class ProviderStreamError extends Error {
  readonly detail: ProviderError & { readonly outputObserved: boolean }

  constructor(error: ProviderError, outputObserved: boolean) {
    super(error.message)
    this.name = "ProviderStreamError"
    this.detail = { ...error, outputObserved }
  }
}

export function providerErrorEvent(options: {
  readonly providerId: string
  readonly modelId: string
  readonly error: unknown
  readonly phase: "request" | "stream"
  readonly signalAborted?: boolean
}): ProviderErrorEvent {
  const aborted = options.signalAborted === true || isAbortError(options.error)
  return {
    type: "error",
    error: {
      category: aborted ? "aborted" : "network",
      message: aborted
        ? "provider request aborted"
        : errorMessage(options.error),
      retryable: !aborted,
      providerId: options.providerId,
      modelId: options.modelId,
      phase: options.phase
    }
  }
}

export function protocolProviderError(options: {
  readonly providerId: string
  readonly modelId: string
  readonly message: string
}): ProviderError {
  return {
    category: "protocol",
    message: options.message,
    retryable: false,
    providerId: options.providerId,
    modelId: options.modelId,
    phase: "stream"
  }
}

export function providerStreamFailureEvent(options: {
  readonly providerId: string
  readonly modelId: string
  readonly error: unknown
  readonly signalAborted?: boolean
}): ProviderErrorEvent {
  if (
    options.signalAborted === true ||
    (options.error instanceof Error && options.error.name === "AbortError") ||
    options.error instanceof TypeError
  ) {
    return providerErrorEvent({
      providerId: options.providerId,
      modelId: options.modelId,
      error: options.error,
      phase: "stream",
      ...(options.signalAborted === undefined
        ? {}
        : { signalAborted: options.signalAborted })
    })
  }
  return {
    type: "error",
    error: {
      ...protocolProviderError({
        providerId: options.providerId,
        modelId: options.modelId,
        message: `invalid provider stream: ${errorMessage(options.error)}`
      })
    }
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "WanexProviderAbortError")
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
