export class HeartbeatLoop {
  private timer: NodeJS.Timeout | undefined
  private active: Promise<void> | undefined
  private running = false

  constructor(
    private readonly beatFn: () => Promise<void>,
    private readonly intervalMs: number,
    private readonly onError: (error: unknown) => void = () => {}
  ) {}

  start(): void {
    if (this.running) return
    this.running = true
    this.schedule()
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    await this.active
  }

  async beat(): Promise<void> {
    await this.beatFn()
  }

  private schedule(): void {
    if (!this.running) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (!this.running) return
      const active = this.beatFn()
        .catch((error: unknown) => this.onError(error))
        .finally(() => {
          if (this.active === active) {
            this.active = undefined
          }
          this.schedule()
        })
      this.active = active
    }, this.intervalMs)
  }
}
