import {
  ExecutionCleanupRequiredError,
  type ExecutionProcess,
  type ManagedExecutionProcess,
  type ManagedExecutionRequest,
  type ExecutionRequest,
  type ExecutionResult
} from "@wanex/runtime/execution"

export class WorkspaceTaskExecutionGuard implements ExecutionProcess {
  private cleanupFailure: ExecutionCleanupRequiredError | undefined

  constructor(private readonly delegate: ExecutionProcess) {}

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

  async start(request: ManagedExecutionRequest): Promise<ManagedExecutionProcess> {
    this.assertCleanupProven()
    const process = await this.delegate.start(request)
    void process.wait().then((result) => {
      if (result.cleanup === "failed") {
        this.cleanupFailure ??= new ExecutionCleanupRequiredError()
      }
    }, (error: unknown) => {
      if (error instanceof ExecutionCleanupRequiredError) {
        this.cleanupFailure ??= error
      }
    })
    return process
  }

  assertCleanupProven(): void {
    if (this.cleanupFailure !== undefined) {
      throw this.cleanupFailure
    }
  }
}
