import type { WorkspaceTaskStore } from "./storage.js"

export interface WorkspaceTaskClaimIdentity {
  readonly runId: string
  readonly attemptId: string
  readonly claimToken: string
}

export class WorkspaceTaskLeaseRenewal {
  private timer: NodeJS.Timeout | undefined
  private failure: unknown

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

  stop(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
  }

  assertHealthy(): void {
    if (this.failure !== undefined) {
      throw this.failure
    }
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      void this.options.storage
        .renewWorkspaceTaskRun({
          ...this.options.identity,
          leaseMs: this.options.leaseMs
        })
        .then(() => this.schedule())
        .catch((error: unknown) => {
          this.failure = error
          this.timer = undefined
        })
    }, Math.max(10, Math.floor(this.options.leaseMs / 3)))
    this.timer.unref()
  }
}
