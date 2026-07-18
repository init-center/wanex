export class TransportRestartBackoff {
  private restartAfterFailure = false
  private restarting: Promise<void> | null = null

  constructor(
    private readonly restartBackoffMs: number,
    private readonly sleep: (ms: number) => Promise<void>
  ) {
    if (restartBackoffMs < 0) {
      throw new Error("persistent storage restartBackoffMs must be non-negative")
    }
  }

  markFailure(): void {
    this.restartAfterFailure = true
  }

  async waitIfNeeded(): Promise<void> {
    if (this.restarting !== null) {
      await this.restarting
      return
    }
    if (!this.restartAfterFailure) {
      return
    }
    this.restartAfterFailure = false
    this.restarting ??= this.sleep(this.restartBackoffMs).finally(() => {
      this.restarting = null
    })
    await this.restarting
  }
}

export function defaultTransportRestartSleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve()
  }
  return new Promise((resolve) => setTimeout(resolve, ms))
}
