import type {
  WanexAppCommandEnvelope,
  WanexAppSafeError
} from "./types-result-envelope.js"

const pathLikePattern =
  /(?:\/Users\/|\/private\/|\/var\/|[A-Za-z]:\\|\\Users\\|storeDir|serviceBin|apiKey|secret|token)/i

export async function runWanexAppSafeCommand<T>(request: {
  readonly command: string
  run(): Promise<T> | T
}): Promise<WanexAppCommandEnvelope<T>> {
  try {
    return {
      ok: true,
      command: request.command,
      value: await request.run()
    }
  } catch (error) {
    return {
      ok: false,
      command: request.command,
      error: projectWanexAppSafeError(error)
    }
  }
}

export function projectWanexAppSafeError(
  error: unknown
): WanexAppSafeError {
  const message = error instanceof Error ? error.message : String(error)
  if (message === "app is disposed") {
    return {
      code: "lifecycle_error",
      category: "lifecycle",
      message
    }
  }
  if (isValidationMessage(message)) {
    return {
      code: "validation_error",
      category: "validation",
      message
    }
  }
  if (pathLikePattern.test(message)) {
    return {
      code: "runtime_error",
      category: "runtime",
      message: "command failed; see app diagnostics for details"
    }
  }
  if (error instanceof Error) {
    return {
      code: "runtime_error",
      category: "runtime",
      message: message.length === 0 ? "command failed" : message
    }
  }
  return {
    code: "unknown_error",
    category: "unknown",
    message: message.length === 0 ? "command failed" : message
  }
}

function isValidationMessage(message: string): boolean {
  return (
    message.endsWith("must not be empty") ||
    message.startsWith("provider profile not found: ") ||
    message.startsWith("guided follow-up session not found: ") ||
    message.startsWith("objective not found: ") ||
    message.startsWith("plan proposal not found: ") ||
    message === "recent session limit must be a positive integer" ||
    message.startsWith("schedule classifier confidence must be ") ||
    message.startsWith("schedule active job scan limit must be ")
  )
}
