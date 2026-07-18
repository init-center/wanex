import type { RuntimeAbortSignal } from "@wanex/protocol"

export interface CancellableOperationOptions {
  readonly signal: RuntimeAbortSignal | undefined
  readonly timeoutMs: number | undefined
  readonly label: string
}

export async function runCancellable<T>(
  work: (signal: RuntimeAbortSignal | undefined) => Promise<T>,
  options: CancellableOperationOptions
): Promise<T> {
  if (options.timeoutMs !== undefined && options.timeoutMs <= 0) {
    throw new Error("timeoutMs must be positive")
  }
  throwIfAborted(options.signal, options.label)

  if (options.signal === undefined && options.timeoutMs === undefined) {
    return await work(undefined)
  }

  const controller =
    options.timeoutMs === undefined ? undefined : new AbortController()
  const operationSignal: RuntimeAbortSignal | undefined =
    controller?.signal ?? options.signal
  let timedOut = false
  let timeout: NodeJS.Timeout | undefined
  let removeParentAbort: (() => void) | undefined
  let removeOperationAbort: (() => void) | undefined

  if (controller !== undefined && options.signal !== undefined) {
    const abortFromParent = (): void => {
      controller.abort()
    }
    options.signal.addEventListener("abort", abortFromParent, { once: true })
    removeParentAbort = (): void => {
      options.signal?.removeEventListener("abort", abortFromParent)
    }
  }

  const candidates: Array<Promise<T> | Promise<never>> = [
    Promise.resolve().then(() => work(operationSignal))
  ]

  if (operationSignal !== undefined) {
    candidates.push(
      new Promise<never>((_, reject) => {
        const onAbort = (): void => {
          if (!timedOut) {
            reject(createAbortError(options.label))
          }
        }
        if (operationSignal.aborted) {
          onAbort()
          return
        }
        operationSignal.addEventListener("abort", onAbort, { once: true })
        removeOperationAbort = (): void => {
          operationSignal.removeEventListener("abort", onAbort)
        }
      })
    )
  }

  if (options.timeoutMs !== undefined) {
    candidates.push(
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          timedOut = true
          const error = new Error(
            `${options.label} timed out after ${options.timeoutMs}ms`
          )
          error.name = "WanexTimeoutError"
          controller?.abort()
          reject(error)
        }, options.timeoutMs)
      })
    )
  }

  try {
    return await Promise.race(candidates)
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout)
    }
    removeParentAbort?.()
    removeOperationAbort?.()
  }
}

export function throwIfAborted(
  signal: RuntimeAbortSignal | undefined,
  label: string
): void {
  if (signal?.aborted !== true) {
    return
  }
  throw createAbortError(label)
}

function createAbortError(label: string): Error {
  const error = new Error(`${label} aborted`)
  error.name = "WanexAbortError"
  return error
}
