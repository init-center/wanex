import type { WorkspaceStore } from "@wanex/storage/workspace"

export class WorkspaceTransactionLease {
  private timer: NodeJS.Timeout | undefined
  private renewal: Promise<void> | undefined
  private failure: unknown
  private stopped = false

  constructor(
    private readonly storage: WorkspaceStore,
    private readonly identity: {
      readonly transactionId: string
      readonly attemptId: string
      readonly claimToken: string
      readonly leaseMs: number
    }
  ) {}

  start(): void {
    this.schedule()
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer !== undefined) clearTimeout(this.timer)
    await this.renewal
  }

  assertHealthy(): void {
    if (this.failure !== undefined) {
      throw new Error("workspace transaction lease was lost", {
        cause: this.failure
      })
    }
  }

  private schedule(): void {
    if (this.stopped || this.failure !== undefined) return
    const delay = Math.max(5, Math.floor(this.identity.leaseMs / 3))
    this.timer = setTimeout(() => {
      this.renewal = this.renew()
    }, delay)
  }

  private async renew(): Promise<void> {
    try {
      await this.storage.renewWorkspaceChangeTransaction({
        transactionId: this.identity.transactionId,
        attemptId: this.identity.attemptId,
        claimToken: this.identity.claimToken,
        leaseMs: this.identity.leaseMs
      })
      this.schedule()
    } catch (error) {
      this.failure = error
    }
  }
}
