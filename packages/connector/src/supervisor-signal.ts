export function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error("connector supervisor stopped"))
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

export function waitForAbort(
  hostSignal: AbortSignal,
  supervisorSignal: AbortSignal
): Promise<void> {
  if (hostSignal.aborted || supervisorSignal.aborted) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const cleanup = () => {
      hostSignal.removeEventListener("abort", onAbort)
      supervisorSignal.removeEventListener("abort", onAbort)
    }
    const onAbort = () => {
      cleanup()
      resolve()
    }
    hostSignal.addEventListener("abort", onAbort, { once: true })
    supervisorSignal.addEventListener("abort", onAbort, { once: true })
  })
}
