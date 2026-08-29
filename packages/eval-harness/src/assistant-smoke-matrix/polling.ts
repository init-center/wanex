export async function eventually(check: () => void): Promise<void> {
  const started = Date.now()
  let lastError: Error | undefined
  while (Date.now() - started < 1_000) {
    try {
      check()
      return
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }
  throw lastError ?? new Error("condition was not met")
}
