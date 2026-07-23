export const WORKER_TIMEOUT_ERROR_NAME = "WanexWorkerTimeoutError"

export async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number | undefined,
  label: string,
  onTimeout?: () => void
): Promise<T> {
  if (timeoutMs === undefined) {
    return await work
  }
  let timer: NodeJS.Timeout | undefined
  let timedOut = false
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true
          const error = new Error(`${label} timed out after ${timeoutMs}ms`)
          error.name = WORKER_TIMEOUT_ERROR_NAME
          reject(error)
        }, timeoutMs)
      })
    ])
  } catch (error) {
    if (timedOut) {
      onTimeout?.()
      await work.catch(() => undefined)
    }
    throw error
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}
