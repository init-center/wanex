import { projectWanexAppSafeError } from "@wanex/app"
import type {
  BackendCommandEnvelope,
  BackendRouteErrorResult,
  BackendSafeError
} from "./model/index.js"

export async function runBackendSafeCommand<T>(request: {
  readonly command: string
  run(): Promise<T> | T
}): Promise<BackendCommandEnvelope<T>> {
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
      error: projectBackendSafeError(error)
    }
  }
}

export function envelopeBackendRouteResult<T>(
  command: string,
  result: T | BackendRouteErrorResult
): BackendCommandEnvelope<T> {
  if (isBackendRouteError(result)) {
    return {
      ok: false,
      command,
      error: {
        code:
          result.code === "unknown_command"
            ? "unknown_command"
            : "validation_error",
        category: "validation",
        message: result.message
      }
    }
  }
  return {
    ok: true,
    command,
    value: result
  }
}

export function projectBackendSafeError(
  error: unknown
): BackendSafeError {
  const message = error instanceof Error ? error.message : String(error)
  const projected = projectWanexAppSafeError(error)
  return projected.message === "app is disposed"
    ? {
        ...projected,
        message: "application backend is disposed"
      }
    : {
        ...projected,
        message: projected.message.replace(
          "app diagnostics",
          "assistant diagnostics"
        ) || (message.length === 0 ? "command failed" : message)
      }
}

function isBackendRouteError(
  value: unknown
): value is BackendRouteErrorResult {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { readonly kind?: unknown }).kind === "error" &&
    typeof (value as { readonly code?: unknown }).code === "string" &&
    typeof (value as { readonly message?: unknown }).message === "string"
  )
}
