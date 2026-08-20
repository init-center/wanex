export class ExecutionSpawnError extends Error {
  readonly cause: unknown

  constructor(program: string, cause: unknown) {
    super(`execution spawn failed for ${program}: ${errorMessage(cause)}`)
    this.name = "ExecutionSpawnError"
    this.cause = cause
  }
}

export class ExecutionAbortedError extends Error {
  constructor() {
    super("execution aborted before spawn")
    this.name = "ExecutionAbortedError"
  }
}

export class ExecutionCleanupRequiredError extends Error {
  constructor() {
    super("execution process tree cleanup could not be proven")
    this.name = "ExecutionCleanupRequiredError"
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
