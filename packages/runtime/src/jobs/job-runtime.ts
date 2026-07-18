import { WanexConfigCore } from "../config/index.js"
import { WanexEventCore } from "../events/index.js"
import type { SchedulerJobKind } from "@wanex/protocol"
import { WanexSessionCore } from "../sessions/index.js"
import type { CoreStore } from "@wanex/storage"
import {
  registerResourceCleanupHandler
} from "./handlers.js"
import { WanexWorker } from "./worker.js"
import type {
  WorkerHandler,
  WorkerLoop,
  WorkerLoopOptions,
  WorkerRunOnceResult
} from "./types.js"

export const WANEX_JOB_RUNTIME = "wanex-job-runtime" as const

export interface WanexJobRuntimeOptions {
  readonly storage: CoreStore
  readonly workerId: string
  readonly leaseMs?: number
  readonly heartbeatIntervalMs?: number
  readonly timeoutMs?: number
  readonly kinds?: readonly SchedulerJobKind[]
  readonly registerMaintenanceHandlers?: boolean
}

export type RuntimeWorkerLoop = WorkerLoop

const DEFAULT_LEASE_MS = 60_000
const DEFAULT_IDLE_INTERVAL_MS = 250
const DEFAULT_ERROR_INTERVAL_MS = 1_000

export class WanexJobRuntime {
  readonly storage: CoreStore
  readonly session: WanexSessionCore
  readonly events: WanexEventCore
  readonly config: WanexConfigCore
  readonly worker: WanexWorker

  private readonly loops = new Set<WorkerLoop>()

  constructor(options: WanexJobRuntimeOptions) {
    this.storage = options.storage
    this.session = new WanexSessionCore({ storage: options.storage })
    this.events = new WanexEventCore({ storage: options.storage })
    this.config = new WanexConfigCore({ storage: options.storage })
    this.worker = new WanexWorker({
      session: this.session,
      workerId: options.workerId,
      leaseMs: options.leaseMs ?? DEFAULT_LEASE_MS,
      ...(options.heartbeatIntervalMs === undefined
        ? {}
        : { heartbeatIntervalMs: options.heartbeatIntervalMs }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      ...(options.kinds === undefined ? {} : { kinds: options.kinds })
    })

    if (options.registerMaintenanceHandlers === true) {
      registerResourceCleanupHandler(this.worker, this.session)
    }
  }

  register(kind: SchedulerJobKind, handler: WorkerHandler): void {
    this.worker.register(kind, handler)
  }

  async runWorkerOnce(): Promise<WorkerRunOnceResult> {
    return await this.worker.runOnce()
  }

  startWorkerLoop(options: WorkerLoopOptions = {}): RuntimeWorkerLoop {
    for (const tracked of this.loops) {
      if (tracked.stopped) {
        this.loops.delete(tracked)
      }
    }
    const loop = this.worker.start({
      idleIntervalMs: options.idleIntervalMs ?? DEFAULT_IDLE_INTERVAL_MS,
      errorIntervalMs: options.errorIntervalMs ?? DEFAULT_ERROR_INTERVAL_MS,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.onResult === undefined ? {} : { onResult: options.onResult }),
      ...(options.onError === undefined ? {} : { onError: options.onError })
    })
    this.loops.add(loop)
    return loop
  }

  async stop(): Promise<void> {
    const loops = [...this.loops]
    for (const loop of loops) {
      loop.stop()
    }
    await Promise.all(loops.map(async (loop) => loop.waitForIdle()))
    this.loops.clear()
  }
}
