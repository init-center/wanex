export const WORKER_TIMEOUT_ERROR_NAME = "WanexWorkerTimeoutError"

export async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number | undefined,
  label: string
): Promise<T> {
  if (timeoutMs === undefined) {
    return await work
  }
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${label} timed out after ${timeoutMs}ms`)
          error.name = WORKER_TIMEOUT_ERROR_NAME
          reject(error)
        }, timeoutMs)
      })
    ])
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}
