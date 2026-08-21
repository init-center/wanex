import type { WorkspaceTaskStore } from "./storage.js"

export interface WorkspaceTaskClaimIdentity {
  readonly runId: string
  readonly attemptId: string
  readonly claimToken: string
}

export class WorkspaceTaskLeaseRenewal {
  private timer: NodeJS.Timeout | undefined
  private renewal: Promise<void> | undefined
  private failure: unknown
  private stopped = false

  constructor(
    private readonly options: {
      readonly storage: WorkspaceTaskStore
      readonly identity: WorkspaceTaskClaimIdentity
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
      throw this.failure
    }
  }

  private schedule(): void {
    if (this.stopped || this.failure !== undefined) return
    this.timer = setTimeout(() => {
      this.renewal = this.renew()
    }, Math.max(10, Math.floor(this.options.leaseMs / 3)))
    this.timer.unref()
  }

  private async renew(): Promise<void> {
    try {
      await this.options.storage.renewWorkspaceTaskRun({
        ...this.options.identity,
        leaseMs: this.options.leaseMs
      })
      this.schedule()
    } catch (error: unknown) {
      this.failure = error
      this.timer = undefined
    }
  }
}
