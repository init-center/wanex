import type { WanexAppShellAgentContextProfileManager } from "./context-profile.js"
import type {
  WanexAppShellAgentContextMonitorOptions,
  WanexAppShellAgentContextMonitorStatus,
  WanexAppShellAgentContextProfileReloadResult
} from "./types-context.js"

const MIN_CONTEXT_MONITOR_INTERVAL_MS = 100

export class WanexAppShellAgentContextRefreshMonitor {
  readonly #manager: WanexAppShellAgentContextProfileManager
  #timer: ReturnType<typeof setTimeout> | undefined
  #active: Promise<void> | undefined
  #intervalMs = 1_000
  #started = false
  #refreshCount = 0
  #lastResult: WanexAppShellAgentContextProfileReloadResult | undefined

  constructor(options: {
    readonly manager: WanexAppShellAgentContextProfileManager
  }) {
    this.#manager = options.manager
  }

  start(
    options: WanexAppShellAgentContextMonitorOptions = {}
  ): WanexAppShellAgentContextMonitorStatus {
    this.#intervalMs = normalizeIntervalMs(options.intervalMs)
    if (!this.#started) {
      this.#started = true
      this.#schedule()
    }
    return this.status()
  }

  async stop(): Promise<WanexAppShellAgentContextMonitorStatus> {
    this.#started = false
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer)
      this.#timer = undefined
    }
    await this.#active
    return this.status()
  }

  status(): WanexAppShellAgentContextMonitorStatus {
    return {
      running: this.#started,
      intervalMs: this.#intervalMs,
      refreshCount: this.#refreshCount,
      ...(this.#lastResult === undefined ? {} : { lastResult: this.#lastResult })
    }
  }

  #schedule(): void {
    if (!this.#started) {
      return
    }
    this.#timer = setTimeout(() => {
      this.#timer = undefined
      this.#active = this.#tick()
    }, this.#intervalMs)
  }

  async #tick(): Promise<void> {
    try {
      this.#lastResult = await this.#manager.refresh()
      this.#refreshCount += 1
    } finally {
      this.#active = undefined
      this.#schedule()
    }
  }
}

function normalizeIntervalMs(value: number | undefined): number {
  const intervalMs = value ?? 1_000
  if (
    !Number.isInteger(intervalMs) ||
    intervalMs < MIN_CONTEXT_MONITOR_INTERVAL_MS
  ) {
    throw new Error(
      `agent context monitor intervalMs must be an integer >= ${MIN_CONTEXT_MONITOR_INTERVAL_MS}`
    )
  }
  return intervalMs
}
