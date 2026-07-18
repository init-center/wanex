import type {
  RuntimeAbortSignal,
  ToolCallMessagePart,
  ToolResultMessagePart
} from "@wanex/protocol"
import type { ToolExecutionStore } from "@wanex/storage"
import type {
  ToolPermissionPolicy,
  ToolRecoveryPolicy,
  ToolRegistry
} from "../../tools/index.js"

export interface RunToolBatchRequest {
  readonly calls: readonly ToolCallMessagePart[]
  readonly principalId: string
  readonly sessionId: string
  readonly inputId: string
  readonly runId: string
  readonly permissionPolicy: ToolPermissionPolicy | undefined
  readonly recoveryPolicy: ToolRecoveryPolicy | undefined
  readonly storage: ToolExecutionStore
  readonly signal: RuntimeAbortSignal | undefined
  readonly timeoutMs: number | undefined
  readonly maxConcurrency: number
  readonly budgetGrantId: string | undefined
}

export async function runToolBatch(
  tools: ToolRegistry,
  request: RunToolBatchRequest
): Promise<ToolResultMessagePart[]> {
  if (!Number.isInteger(request.maxConcurrency) || request.maxConcurrency <= 0) {
    throw new Error("tool maxConcurrency must be a positive integer")
  }
  return await mapConcurrentOrdered(
    request.calls,
    request.maxConcurrency,
    async (call) => {
      const outcome = await tools.execute({
        principalId: request.principalId,
        sessionId: request.sessionId,
        inputId: request.inputId,
        runId: request.runId,
        call,
        idempotencyKey: `tool:${request.runId}:${call.toolCallId}`,
        storage: request.storage,
        ...(request.permissionPolicy === undefined
          ? {}
          : { permissionPolicy: request.permissionPolicy }),
        ...(request.recoveryPolicy === undefined
          ? {}
          : { recoveryPolicy: request.recoveryPolicy }),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
        ...(request.budgetGrantId === undefined
          ? {}
          : {
              budget: {
                grantId: request.budgetGrantId,
                storage: request.storage as ToolExecutionStore &
                  import("@wanex/storage").SchedulerStore
              }
            })
      })
      return outcome.result
    }
  )
}

async function mapConcurrentOrdered<T, R>(
  values: readonly T[],
  concurrency: number,
  work: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length)
  const errors = new Array<unknown>(values.length)
  let next = 0
  const workerCount = Math.min(concurrency, values.length)
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = next
        next += 1
        if (index >= values.length) return
        try {
          results[index] = await work(values[index]!, index)
        } catch (error) {
          errors[index] = error
          return
        }
      }
    })
  )
  const firstError = errors.find((error) => error !== undefined)
  if (firstError !== undefined) throw firstError
  return results
}
