import {
  ExecutionCleanupRequiredError,
  type ExecutionHost,
  type ExecutionRequest,
  type ExecutionResult
} from "@wanex/runtime/execution"

export class WorkspaceTaskExecutionGuard implements ExecutionHost {
  private cleanupFailure: ExecutionCleanupRequiredError | undefined

  constructor(private readonly delegate: ExecutionHost) {}

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    this.assertCleanupProven()
    try {
      const result = await this.delegate.execute(request)
      if (result.cleanup === "failed") {
        this.cleanupFailure ??= new ExecutionCleanupRequiredError()
        throw this.cleanupFailure
      }
      return result
    } catch (error) {
      if (error instanceof ExecutionCleanupRequiredError) {
        this.cleanupFailure ??= error
      }
      throw error
    }
  }

  assertCleanupProven(): void {
    if (this.cleanupFailure !== undefined) {
      throw this.cleanupFailure
    }
  }
}
