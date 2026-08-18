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
  ConfigRefreshResult,
  ConfigReloadReadyCandidate,
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
  private generation = 0
  private refreshQueue: Promise<void> = Promise.resolve()

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

  refreshKey(
    key: string,
    event?: RuntimeEvent
  ): Promise<ConfigRefreshResult> {
    assertConfigReloadKey(key, this.label)
    const operation = this.refreshQueue.then(
      async () => await this.performRefresh(key, event)
    )
    this.refreshQueue = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  private async performRefresh(
    key: string,
    event?: RuntimeEvent
  ): Promise<ConfigRefreshResult> {
    this.config.deleteLocal(key)
    const subscriptions = this.matchingSubscriptions(key)
    if (subscriptions.length === 0) {
      return {
        generation: this.generation,
        committed: true,
        reloads: [],
        errors: []
      }
    }

    const prepared: Array<{
      readonly subscription: ConfigReloadSubscription
      readonly candidate: ConfigReloadReadyCandidate
    }> = []
    const errors: ConfigReloadError[] = []
    for (const subscription of subscriptions) {
      try {
        const candidate = await subscription.prepare({
          key,
          config: this.config,
          ...(event === undefined ? {} : { event })
        })
        if (candidate.kind === "rejected") {
          await this.rollbackPrepared(key, event, prepared, errors)
          const rejected = normalizeConfigReloadResult({
            key,
            subscriptionId: subscription.id,
            generation: this.generation,
            committed: false,
            ...(event === undefined ? {} : { event }),
            result: candidate.result
          })
          this.onReload?.(rejected)
          return {
            generation: this.generation,
            committed: false,
            reloads: [rejected],
            errors
          }
        }
        prepared.push({ subscription, candidate })
      } catch (error) {
        this.recordError(errors, {
          key,
          subscriptionId: subscription.id,
          stage: "prepare",
          event,
          error
        })
        await this.rollbackPrepared(key, event, prepared, errors)
        return {
          generation: this.generation,
          committed: false,
          reloads: [],
          errors
        }
      }
    }

    const committed: typeof prepared = []
    for (const entry of prepared) {
      try {
        await entry.candidate.commit()
        committed.push(entry)
      } catch (error) {
        this.recordError(errors, {
          key,
          subscriptionId: entry.subscription.id,
          stage: "commit",
          event,
          error
        })
        await this.rollbackPrepared(
          key,
          event,
          [...committed, entry],
          errors
        )
        return {
          generation: this.generation,
          committed: false,
          reloads: [],
          errors
        }
      }
    }

    this.generation += 1
    const reloads = prepared.map(({ subscription, candidate }) =>
      normalizeConfigReloadResult({
        key,
        subscriptionId: subscription.id,
        generation: this.generation,
        committed: true,
        ...(event === undefined ? {} : { event }),
        result: candidate.result
      })
    )
    for (const result of reloads) {
      this.onReload?.(result)
    }
    return {
      generation: this.generation,
      committed: true,
      reloads,
      errors
    }
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
    let committed = true
    for (const event of polled.events) {
      const payload = configUpdatedPayload(event)
      if (payload === null) {
        continue
      }
      const result = await this.refreshKey(payload.key, event)
      committed &&= result.committed
      reloads.push(...result.reloads)
      errors.push(...result.errors)
    }
    return {
      generation: this.generation,
      committed,
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
          stage: "watch",
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

  private async rollbackPrepared(
    key: string,
    event: RuntimeEvent | undefined,
    prepared: readonly {
      readonly subscription: ConfigReloadSubscription
      readonly candidate: ConfigReloadReadyCandidate
    }[],
    errors: ConfigReloadError[]
  ): Promise<void> {
    for (const entry of [...prepared].reverse()) {
      try {
        await entry.candidate.rollback()
      } catch (error) {
        this.recordError(errors, {
          key,
          subscriptionId: entry.subscription.id,
          stage: "rollback",
          event,
          error
        })
      }
    }
  }

  private recordError(
    errors: ConfigReloadError[],
    options: {
      readonly key: string
      readonly subscriptionId: string
      readonly stage: ConfigReloadError["stage"]
      readonly event: RuntimeEvent | undefined
      readonly error: unknown
    }
  ): void {
    const normalized = normalizeConfigReloadError({
      key: options.key,
      subscriptionId: options.subscriptionId,
      stage: options.stage,
      ...(options.event === undefined ? {} : { event: options.event }),
      error: options.error
    })
    errors.push(normalized)
    this.onError?.(normalized)
  }
}
