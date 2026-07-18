import type { EventCursor, RuntimeEvent } from "@wanex/protocol"
import {
  configUpdatedPayload,
  WanexConfigCore,
  type ConfigWatcher,
  type PollConfigInvalidationsResult
} from "./core.js"
import {
  assertConfigReloadKey,
  assertConfigReloadMatcher,
  matchesConfigReloadMatcher
} from "./hot-reload-match.js"
import {
  normalizeConfigReloadError,
  normalizeConfigReloadResult
} from "./hot-reload-normalize.js"
import type {
  ConfigHotReloadControllerOptions,
  ConfigPollResult,
  ConfigReloadError,
  ConfigReloadResult,
  ConfigReloadSubscription,
  ConfigWatchOptions
} from "./hot-reload-types.js"

export class ConfigHotReloadController {
  readonly config: WanexConfigCore
  private readonly subscriptions = new Map<string, ConfigReloadSubscription>()
  private readonly onReload: ((result: ConfigReloadResult) => void) | undefined
  private readonly onError: ((error: ConfigReloadError) => void) | undefined
  private readonly label: string

  constructor(options: ConfigHotReloadControllerOptions) {
    this.config =
      options.config ?? new WanexConfigCore({ storage: options.storage })
    this.onReload = options.onReload
    this.onError = options.onError
    this.label = options.label ?? "config reload"
    for (const subscription of options.subscriptions ?? []) {
      this.register(subscription)
    }
  }

  register(subscription: ConfigReloadSubscription): void {
    if (subscription.id.length === 0) {
      throw new Error(`${this.label} subscription id must not be empty`)
    }
    assertConfigReloadMatcher(subscription.matcher, this.label)
    if (this.subscriptions.has(subscription.id)) {
      throw new Error(
        `${this.label} subscription already registered: ${subscription.id}`
      )
    }
    this.subscriptions.set(subscription.id, subscription)
  }

  unregister(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId)
  }

  async refreshKey(
    key: string,
    event?: RuntimeEvent
  ): Promise<{
    readonly reloads: readonly ConfigReloadResult[]
    readonly errors: readonly ConfigReloadError[]
  }> {
    assertConfigReloadKey(key, this.label)
    this.config.deleteLocal(key)
    const reloads: ConfigReloadResult[] = []
    const errors: ConfigReloadError[] = []
    for (const subscription of this.matchingSubscriptions(key)) {
      try {
        const handlerResult = await subscription.reload({
          key,
          config: this.config,
          ...(event === undefined ? {} : { event })
        })
        const normalized = normalizeConfigReloadResult({
          key,
          subscriptionId: subscription.id,
          ...(event === undefined ? {} : { event }),
          result: handlerResult
        })
        reloads.push(normalized)
        this.onReload?.(normalized)
      } catch (error) {
        const normalized = normalizeConfigReloadError({
          key,
          subscriptionId: subscription.id,
          ...(event === undefined ? {} : { event }),
          error
        })
        errors.push(normalized)
        this.onError?.(normalized)
      }
    }
    return { reloads, errors }
  }

  async pollOnce(
    request: {
      readonly cursor?: EventCursor
      readonly limit?: number
    } = {}
  ): Promise<ConfigPollResult> {
    const polled: PollConfigInvalidationsResult =
      await this.config.pollInvalidationsOnce(request)
    const reloads: ConfigReloadResult[] = []
    const errors: ConfigReloadError[] = []
    for (const event of polled.events) {
      const payload = configUpdatedPayload(event)
      if (payload === null) {
        continue
      }
      const result = await this.refreshKey(payload.key, event)
      reloads.push(...result.reloads)
      errors.push(...result.errors)
    }
    return {
      invalidatedKeys: polled.invalidatedKeys,
      reloads,
      errors,
      ...(polled.cursor === undefined ? {} : { cursor: polled.cursor })
    }
  }

  watch(options: ConfigWatchOptions = {}): ConfigWatcher {
    return this.config.watchInvalidations({
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
      ...(options.intervalMs === undefined
        ? {}
        : { intervalMs: options.intervalMs }),
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      onInvalidate: (key: string, event: RuntimeEvent) => {
        void this.refreshKey(key, event).then(({ reloads, errors }) => {
          for (const result of reloads) {
            options.onReload?.(result)
          }
          for (const error of errors) {
            options.onError?.(error)
          }
        })
      },
      onError: (error: unknown) => {
        const normalized = normalizeConfigReloadError({
          key: "*",
          subscriptionId: "*",
          error
        })
        this.onError?.(normalized)
        options.onError?.(normalized)
      }
    })
  }

  private matchingSubscriptions(
    key: string
  ): readonly ConfigReloadSubscription[] {
    return [...this.subscriptions.values()].filter((subscription) =>
      matchesConfigReloadMatcher(subscription.matcher, key)
    )
  }
}
