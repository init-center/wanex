import {
  ExecutionCleanupRequiredError,
  type ExecutionProcess,
  type ManagedExecutionProcess,
  type ManagedExecutionRequest,
  type ExecutionRequest,
  type ExecutionResult
} from "@wanex/runtime/execution"
import type { RuntimeAbortSignal } from "@wanex/protocol"

export class WorkspaceTaskExecutionGuard implements ExecutionProcess {
  private cleanupFailure: ExecutionCleanupRequiredError | undefined

  constructor(private readonly delegate: ExecutionProcess, private readonly signal?: RuntimeAbortSignal) {}

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    this.assertCleanupProven()
    const cancellation = combineTaskSignals(this.signal, request.signal)
    try {
      const result = await this.delegate.execute({ ...request, signal: cancellation.signal })
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
    } finally {
      cancellation.dispose()
    }
  }

  async start(request: ManagedExecutionRequest): Promise<ManagedExecutionProcess> {
    this.assertCleanupProven()
    const cancellation = combineTaskSignals(this.signal, request.signal)
    let process: ManagedExecutionProcess
    try {
      process = await this.delegate.start({ ...request, signal: cancellation.signal })
    } catch (error) {
      cancellation.dispose()
      throw error
    }
    void process.wait().then((result) => {
      cancellation.dispose()
      if (result.cleanup === "failed") {
        this.cleanupFailure ??= new ExecutionCleanupRequiredError()
      }
    }, (error: unknown) => {
      cancellation.dispose()
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

export function combineTaskSignals(...signals: readonly (RuntimeAbortSignal | undefined)[]) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  for (const signal of signals) {
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) abort()
  }
  return {
    signal: controller.signal,
    dispose: () => { for (const signal of signals) signal?.removeEventListener("abort", abort) }
  }
}

export function assertNotCancelled(signal?: RuntimeAbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error("workspace task cancelled")
  error.name = "AbortError"
  throw error
}
