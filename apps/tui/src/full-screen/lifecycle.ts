const DEFAULT_DRAIN_TIMEOUT_MS = 250

export async function drainFullScreenWork(
  work: readonly Promise<unknown>[],
  timeoutMs = DEFAULT_DRAIN_TIMEOUT_MS
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const settled = Promise.allSettled(work)
  const deadline = new Promise<void>((resolve) => {
    timeout = setTimeout(resolve, timeoutMs)
  })

  try {
    await Promise.race([settled, deadline])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}
