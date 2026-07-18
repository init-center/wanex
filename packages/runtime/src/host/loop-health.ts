import type { WorkerLoop } from "../jobs/index.js"
import type {
  RuntimeHostLoopHealth,
  RuntimeHostLoopKind,
  RuntimeHostLoopResultStatus
} from "./types.js"

export class RuntimeHostLoopHealthTracker {
  private loop: WorkerLoop | undefined
  private runCount = 0
  private idleCount = 0
  private completedCount = 0
  private failedCount = 0
  private errorCount = 0
  private lastResultStatus: RuntimeHostLoopResultStatus | undefined
  private lastResultAt: number | undefined
  private lastErrorAt: number | undefined

  readonly id: string
  readonly kind: RuntimeHostLoopKind
  readonly index: number
  readonly startedAt: number

  constructor(options: {
    readonly kind: RuntimeHostLoopKind
    readonly index: number
    readonly startedAt: number
  }) {
    this.kind = options.kind
    this.index = options.index
    this.startedAt = options.startedAt
    this.id = `${options.kind}:${options.index}`
  }

  attach(loop: WorkerLoop): void {
    this.loop = loop
  }

  recordResult(
    status: RuntimeHostLoopResultStatus,
    at = Date.now()
  ): void {
    this.runCount += 1
    this.lastResultStatus = status
    this.lastResultAt = at
    switch (status) {
      case "idle":
        this.idleCount += 1
        break
      case "completed":
        this.completedCount += 1
        break
      case "failed":
        this.failedCount += 1
        break
    }
  }

  recordError(at = Date.now()): void {
    this.errorCount += 1
    this.lastErrorAt = at
  }

  snapshot(): RuntimeHostLoopHealth {
    return {
      id: this.id,
      kind: this.kind,
      index: this.index,
      startedAt: this.startedAt,
      stopped: this.loop?.stopped ?? true,
      runCount: this.runCount,
      idleCount: this.idleCount,
      completedCount: this.completedCount,
      failedCount: this.failedCount,
      errorCount: this.errorCount,
      ...(this.lastResultStatus === undefined
        ? {}
        : { lastResultStatus: this.lastResultStatus }),
      ...(this.lastResultAt === undefined
        ? {}
        : { lastResultAt: this.lastResultAt }),
      ...(this.lastErrorAt === undefined ? {} : { lastErrorAt: this.lastErrorAt })
    }
  }
}
