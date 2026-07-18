import type { ConnectorSessionRecord } from "@wanex/protocol"
import type {
  WanexWorker,
  WorkerRunOnceResult
} from "@wanex/runtime/jobs"
import type { ConnectorRuntime } from "./runtime.js"
import type {
  ConnectorAdapter,
  ConnectorHostContext,
  ConnectorHostRun
} from "./host.js"
import {
  isLiveConnectorSession,
  normalizeHostError
} from "./host-errors.js"

export interface ActiveConnectorHostRunOptions {
  readonly runtime: ConnectorRuntime
  readonly adapter: ConnectorAdapter
  readonly context: ConnectorHostContext
  readonly controller: AbortController
  readonly session: () => ConnectorSessionRecord
  readonly setSession: (session: ConnectorSessionRecord) => void
  readonly ownerId: string
  readonly leaseMs: number
  readonly heartbeatIntervalMs: number
  readonly worker: WanexWorker | undefined
  readonly onStopped: () => void
}

export class ActiveConnectorHostRun implements ConnectorHostRun {
  private readonly runtime: ConnectorRuntime
  private readonly adapter: ConnectorAdapter
  private readonly context: ConnectorHostContext
  private readonly controller: AbortController
  private readonly getSession: () => ConnectorSessionRecord
  private readonly setSession: (session: ConnectorSessionRecord) => void
  private readonly ownerId: string
  private readonly leaseMs: number
  private readonly heartbeatIntervalMs: number
  private readonly worker: WanexWorker | undefined
  private readonly onStopped: () => void
  private timer: NodeJS.Timeout | undefined
  private stopping: Promise<ConnectorSessionRecord> | undefined

  constructor(options: ActiveConnectorHostRunOptions) {
    this.runtime = options.runtime
    this.adapter = options.adapter
    this.context = options.context
    this.controller = options.controller
    this.getSession = options.session
    this.setSession = options.setSession
    this.ownerId = options.ownerId
    this.leaseMs = options.leaseMs
    this.heartbeatIntervalMs = options.heartbeatIntervalMs
    this.worker = options.worker
    this.onStopped = options.onStopped
  }

  get session(): ConnectorSessionRecord {
    return this.getSession()
  }

  get signal(): AbortSignal {
    return this.controller.signal
  }

  startHeartbeat(): void {
    this.timer = setInterval(() => {
      void this.context.heartbeat().catch((error) => {
        void this.failFromHeartbeat(error)
      })
    }, this.heartbeatIntervalMs)
  }

  async runDeliveryOnce(): Promise<WorkerRunOnceResult> {
    if (this.worker === undefined) {
      throw new Error("connector host has no delivery worker")
    }
    return await this.worker.runOnce()
  }

  async stop(): Promise<ConnectorSessionRecord> {
    if (this.stopping !== undefined) {
      return await this.stopping
    }
    this.stopping = this.stopOnce()
    return await this.stopping
  }

  private async stopOnce(): Promise<ConnectorSessionRecord> {
    this.controller.abort()
    this.clearHeartbeat()
    try {
      await this.adapter.stop?.(this.context)
    } catch {
      // Stop hooks are best-effort cleanup. The durable session still needs a
      // terminal state so recovery does not see a live lease forever.
    }
    const current = this.getSession()
    if (!isLiveConnectorSession(current)) {
      this.onStopped()
      return current
    }
    const finished = await this.runtime.finishSession({
      sessionId: current.id,
      ownerId: this.ownerId,
      leaseToken: current.leaseToken,
      state: "disconnected"
    })
    this.setSession(finished)
    this.onStopped()
    return finished
  }

  private async failFromHeartbeat(error: unknown): Promise<void> {
    if (this.controller.signal.aborted || this.stopping !== undefined) {
      return
    }
    this.controller.abort()
    this.clearHeartbeat()
    try {
      await this.adapter.stop?.(this.context)
    } catch {
      // Best-effort cleanup only; heartbeat failure is already terminal.
    }
    const current = this.getSession()
    if (!isLiveConnectorSession(current)) {
      this.onStopped()
      return
    }
    try {
      const failed = await this.runtime.finishSession({
        sessionId: current.id,
        ownerId: this.ownerId,
        leaseToken: current.leaseToken,
        state: "failed",
        error: normalizeHostError(error)
      })
      this.setSession(failed)
    } catch {
      // The lease may already be expired or owned by another process. In that
      // case the durable store is the source of truth and the host must stop.
    } finally {
      this.onStopped()
    }
  }

  private clearHeartbeat(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }
}
