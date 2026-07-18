import { projectWanexAppShellSafeError } from "@wanex/app/backend"
import type {
  ProductAppBackendCommandEnvelope,
  ProductAppBackendRouteErrorResult,
  ProductAppBackendSafeError
} from "./types.js"

export async function runProductAppBackendSafeCommand<T>(request: {
  readonly command: string
  run(): Promise<T> | T
}): Promise<ProductAppBackendCommandEnvelope<T>> {
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
      error: projectProductAppBackendSafeError(error)
    }
  }
}

export function envelopeProductAppBackendRouteResult<T>(
  command: string,
  result: T | ProductAppBackendRouteErrorResult
): ProductAppBackendCommandEnvelope<T> {
  if (isProductAppBackendRouteError(result)) {
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

export function projectProductAppBackendSafeError(
  error: unknown
): ProductAppBackendSafeError {
  const message = error instanceof Error ? error.message : String(error)
  const projected = projectWanexAppShellSafeError(error)
  return projected.message === "app shell is disposed"
    ? {
        ...projected,
        message: "product app backend is disposed"
      }
    : {
        ...projected,
        message: projected.message.replace(
          "app diagnostics",
          "product diagnostics"
        ) || (message.length === 0 ? "command failed" : message)
      }
}

function isProductAppBackendRouteError(
  value: unknown
): value is ProductAppBackendRouteErrorResult {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { readonly kind?: unknown }).kind === "error" &&
    typeof (value as { readonly code?: unknown }).code === "string" &&
    typeof (value as { readonly message?: unknown }).message === "string"
  )
}
