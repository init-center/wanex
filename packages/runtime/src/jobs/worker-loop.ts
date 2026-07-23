import type {
  WorkerLoop,
  WorkerLoopOptions,
  WorkerRunOnceResult
} from "./types.js"

export interface WorkerLoopTarget {
  runOnce(): Promise<WorkerRunOnceResult>
}

export function startWorkerLoop(
  worker: WorkerLoopTarget,
  options: WorkerLoopOptions = {}
): WorkerLoop {
  const controller = new WorkerLoopController()
  if (options.signal?.aborted === true) {
    controller.stop()
    return controller
  }
  const idleIntervalMs = normalizeInterval(
    options.idleIntervalMs,
    250,
    "worker idle interval"
  )
  const errorIntervalMs = normalizeInterval(
    options.errorIntervalMs,
    1_000,
    "worker error interval"
  )
  options.signal?.addEventListener("abort", () => controller.stop(), {
    once: true
  })

  const tick = (): void => {
    if (controller.stopped) {
      return
    }
    controller.run(
      worker
        .runOnce()
        .then((result) => {
          options.onResult?.(result)
          controller.schedule(
            tick,
            controller.consumeWakeRequest()
              ? 0
              : result.status === "idle"
                ? idleIntervalMs
                : 0
          )
        })
        .catch((error: unknown) => {
          options.onError?.(error)
          controller.schedule(
            tick,
            controller.consumeWakeRequest() ? 0 : errorIntervalMs
          )
        })
    )
  }
  controller.attach(tick)
  controller.schedule(tick, 0)
  return controller
}

class WorkerLoopController implements WorkerLoop {
  private timer: ReturnType<typeof setTimeout> | undefined
  private active: Promise<void> | undefined
  private tick: (() => void) | undefined
  private wakeRequested = false
  private isStopped = false

  get stopped(): boolean {
    return this.isStopped
  }

  attach(tick: () => void): void {
    this.tick = tick
  }

  wake(): void {
    if (this.isStopped || this.tick === undefined) {
      return
    }
    if (this.active !== undefined) {
      this.wakeRequested = true
      return
    }
    this.wakeRequested = false
    this.schedule(this.tick, 0)
  }

  consumeWakeRequest(): boolean {
    const requested = this.wakeRequested
    this.wakeRequested = false
    return requested
  }

  stop(): void {
    if (this.isStopped) {
      return
    }
    this.isStopped = true
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
  }

  schedule(callback: () => void, delayMs: number): void {
    if (this.isStopped) {
      return
    }
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => {
      this.timer = undefined
      callback()
    }, delayMs)
  }

  run(work: Promise<void>): void {
    if (this.isStopped) {
      return
    }
    const active = work.finally(() => {
      if (this.active === active) {
        this.active = undefined
      }
    })
    this.active = active
  }

  async waitForIdle(): Promise<void> {
    await this.active
  }
}

function normalizeInterval(
  value: number | undefined,
  fallback: number,
  label: string
): number {
  const resolved = value ?? fallback
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw new Error(`${label} must be a non-negative finite number`)
  }
  return resolved
}
