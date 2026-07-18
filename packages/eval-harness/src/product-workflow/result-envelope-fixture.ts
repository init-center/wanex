export type EvalCommandEnvelope<T> =
  | {
      readonly ok: true
      readonly command: string
      readonly value: T
    }
  | {
      readonly ok: false
      readonly command: string
      readonly error: EvalSafeError
    }

export interface EvalSafeError {
  readonly code:
    | "validation_error"
    | "unknown_command"
    | "lifecycle_error"
    | "runtime_error"
    | "unknown_error"
  readonly category: "validation" | "lifecycle" | "runtime" | "unknown"
  readonly message: string
}

export interface EvalRouteError {
  readonly kind: "error"
  readonly code: "empty_input" | "unknown_command" | "invalid_arguments"
  readonly message: string
}

const evalPathLikePattern =
  /(?:\/Users\/|\/private\/|\/var\/|[A-Za-z]:\\|\\Users\\|storeDir|serviceBin|apiKey|secret)/i

export async function runEvalSafeCommand<T>(request: {
  readonly command: string
  run(): Promise<T> | T
}): Promise<EvalCommandEnvelope<T>> {
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
      error: projectEvalSafeError(error)
    }
  }
}

export function envelopeEvalRouteResult<T>(
  command: string,
  result: T | EvalRouteError
): EvalCommandEnvelope<T> {
  if (isEvalRouteError(result)) {
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

function projectEvalSafeError(error: unknown): EvalSafeError {
  const message = error instanceof Error ? error.message : String(error)
  if (message === "eval app is disposed") {
    return {
      code: "lifecycle_error",
      category: "lifecycle",
      message
    }
  }
  if (evalPathLikePattern.test(message)) {
    return {
      code: "runtime_error",
      category: "runtime",
      message: "command failed; see product diagnostics for details"
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

function isEvalRouteError(value: unknown): value is EvalRouteError {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { readonly kind?: unknown }).kind === "error" &&
    typeof (value as { readonly code?: unknown }).code === "string" &&
    typeof (value as { readonly message?: unknown }).message === "string"
  )
}
