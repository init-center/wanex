import {
  projectBackendSafeError
} from "../result.js"
import {
  BackendCommandPortValidationError
} from "./input/core.js"
import type {
  BackendCommandPortEnvelope
} from "./contract.js"
import type {
  BackendCommandEnvelope,
  BackendSafeError
} from "../model/index.js"

export async function runBackendCommandPortSafe<T>(request: {
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
    if (error instanceof BackendCommandPortValidationError) {
      return portError({
        command: request.command,
        code: "validation_error",
        category: "validation",
        message: error.message
      }) as BackendCommandEnvelope<T>
    }
    return {
      ok: false,
      command: request.command,
      error: projectBackendSafeError(error)
    }
  }
}

export function portError(options: {
  readonly command: string
  readonly code: BackendSafeError["code"]
  readonly category: BackendSafeError["category"]
  readonly message: string
}): BackendCommandPortEnvelope {
  return {
    ok: false,
    command: options.command,
    error: {
      code: options.code,
      category: options.category,
      message: options.message
    }
  }
}

export function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function unreachableBackendPortCommand(command: string): never {
  throw new Error(`unreachable backend port command: ${command}`)
}
