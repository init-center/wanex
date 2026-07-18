export class HeartbeatLoop {
  private timer: NodeJS.Timeout | undefined

  constructor(
    private readonly beatFn: () => Promise<void>,
    private readonly intervalMs: number
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      void this.beatFn()
    }, this.intervalMs)
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  async beat(): Promise<void> {
    await this.beatFn()
  }
}
