import type { EventCursor, JsonValue, RuntimeEvent } from "@wanex/protocol"
import { WanexEventCore, nextEventCursor } from "../events/index.js"
import type { RuntimeStore } from "@wanex/storage"

export interface ConfigUpdatedPayload {
  readonly key: string
  readonly updatedAt: number
}

export interface WanexConfigCoreOptions {
  readonly storage: RuntimeStore
  readonly cache?: ConfigCacheMode
}

export interface PollConfigInvalidationsRequest {
  readonly cursor?: EventCursor
  readonly limit?: number
}

export interface PollConfigInvalidationsResult {
  readonly events: readonly RuntimeEvent[]
  readonly invalidatedKeys: readonly string[]
  readonly cursor?: EventCursor
}

export interface WatchConfigInvalidationsOptions {
  readonly cursor?: EventCursor
  readonly intervalMs?: number
  readonly limit?: number
  readonly signal?: AbortSignal
  readonly onInvalidate?: (key: string, event: RuntimeEvent) => void
  readonly onError?: (error: unknown) => void
}

export interface ConfigWatcher {
  stop(): void
  waitForIdle(): Promise<void>
}

type ConfigCacheMode = "none" | "memory"

const DEFAULT_WATCH_INTERVAL_MS = 1_000
const DEFAULT_POLL_LIMIT = 100

export class WanexConfigCore {
  private readonly storage: RuntimeStore
  private readonly events: WanexEventCore
  private readonly cacheMode: ConfigCacheMode
  private readonly local = new Map<string, JsonValue | null>()

  constructor(options: WanexConfigCoreOptions) {
    this.storage = options.storage
    this.events = new WanexEventCore({ storage: options.storage })
    this.cacheMode = options.cache ?? "memory"
  }

  async get(key: string): Promise<JsonValue | null> {
    assertConfigKey(key)
    if (this.cacheMode === "memory" && this.local.has(key)) {
      return this.local.get(key) ?? null
    }

    const value = await this.storage.getConfig(key)
    if (this.cacheMode === "memory") {
      this.local.set(key, value)
    }
    return value
  }

  async require(key: string): Promise<JsonValue> {
    const value = await this.get(key)
    if (value === null) {
      throw new Error(`config not found: ${key}`)
    }
    return value
  }

  async put(key: string, value: JsonValue): Promise<void> {
    assertConfigKey(key)
    await this.storage.putConfig(key, value)
    this.deleteLocal(key)
  }

  deleteLocal(key: string): void {
    assertConfigKey(key)
    this.local.delete(key)
  }

  clearLocal(): void {
    this.local.clear()
  }

  applyEvent(event: RuntimeEvent): string | null {
    const payload = configUpdatedPayload(event)
    if (payload === null) {
      return null
    }
    this.local.delete(payload.key)
    return payload.key
  }

  async pollInvalidationsOnce(
    request: PollConfigInvalidationsRequest = {}
  ): Promise<PollConfigInvalidationsResult> {
    const events = await this.events.query({
      ...(request.cursor === undefined ? {} : { after: request.cursor }),
      limit: request.limit ?? DEFAULT_POLL_LIMIT
    })
    const invalidatedKeys = events
      .map((event) => this.applyEvent(event))
      .filter((key): key is string => key !== null)
    const cursor = nextEventCursor(events) ?? request.cursor

    return {
      events,
      invalidatedKeys,
      ...(cursor === undefined ? {} : { cursor })
    }
  }

  watchInvalidations(
    options: WatchConfigInvalidationsOptions = {}
  ): ConfigWatcher {
    let stopped = false
    let cursor = options.cursor
    let timer: ReturnType<typeof setTimeout> | undefined
    let active: Promise<void> | undefined
    const intervalMs = options.intervalMs ?? DEFAULT_WATCH_INTERVAL_MS
    const limit = options.limit ?? DEFAULT_POLL_LIMIT

    const stop = (): void => {
      stopped = true
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
    }

    if (options.signal?.aborted === true) {
      return {
        stop,
        waitForIdle: async () => {}
      }
    }

    const schedule = (): void => {
      if (stopped || options.signal?.aborted === true) {
        stop()
        return
      }
      timer = setTimeout(tick, intervalMs)
    }

    const tick = (): void => {
      active = (async (): Promise<void> => {
        try {
          const result = await this.pollInvalidationsOnce({
            ...(cursor === undefined ? {} : { cursor }),
            limit
          })
          cursor = result.cursor
          for (const event of result.events) {
            const payload = configUpdatedPayload(event)
            if (payload !== null) {
              options.onInvalidate?.(payload.key, event)
            }
          }
        } catch (error) {
          options.onError?.(error)
        } finally {
          active = undefined
          schedule()
        }
      })()
    }

    options.signal?.addEventListener("abort", stop, { once: true })
    schedule()
    return {
      stop,
      waitForIdle: async () => {
        await active
      }
    }
  }
}

export function configUpdatedPayload(
  event: RuntimeEvent
): ConfigUpdatedPayload | null {
  if (event.type !== "config.updated") {
    return null
  }
  const payload = event.payload
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null
  }
  const record = payload as Record<string, JsonValue>
  if (typeof record.key !== "string" || typeof record.updatedAt !== "number") {
    return null
  }
  return {
    key: record.key,
    updatedAt: record.updatedAt
  }
}

function assertConfigKey(key: string): void {
  if (key.length === 0) {
    throw new Error("config key must not be empty")
  }
}
