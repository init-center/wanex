import {
  projectProductAppBackendSafeError
} from "./result-envelope.js"
import {
  ProductAppBackendCommandPortValidationError
} from "./command-port-input-core.js"
import type {
  ProductAppBackendCommandPortEnvelope
} from "./command-port-contract.js"
import type {
  ProductAppBackendCommandEnvelope,
  ProductAppBackendSafeError
} from "./types.js"

export async function runProductAppBackendCommandPortSafe<T>(request: {
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
    if (error instanceof ProductAppBackendCommandPortValidationError) {
      return portError({
        command: request.command,
        code: "validation_error",
        category: "validation",
        message: error.message
      }) as ProductAppBackendCommandEnvelope<T>
    }
    return {
      ok: false,
      command: request.command,
      error: projectProductAppBackendSafeError(error)
    }
  }
}

export function portError(options: {
  readonly command: string
  readonly code: ProductAppBackendSafeError["code"]
  readonly category: ProductAppBackendSafeError["category"]
  readonly message: string
}): ProductAppBackendCommandPortEnvelope {
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

export function unreachableProductAppBackendPortCommand(command: string): never {
  throw new Error(`unreachable product app backend port command: ${command}`)
}
