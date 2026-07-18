import type { EventCursor, JsonValue, RuntimeEvent } from "@wanex/protocol"
import type { RuntimeStore } from "@wanex/storage"
import type {
  WanexConfigCore,
  WatchConfigInvalidationsOptions
} from "./core.js"

export type ConfigReloadMatcher =
  | {
      readonly kind: "exact"
      readonly key: string
    }
  | {
      readonly kind: "prefix"
      readonly prefix: string
    }

export interface ConfigReloadHandlerContext {
  readonly key: string
  readonly config: WanexConfigCore
  readonly event?: RuntimeEvent
}

export interface ConfigReloadHandlerResult {
  readonly key: string
  readonly reloaded: boolean
  readonly reason?: string
  readonly detail?: JsonValue
}

export type ConfigReloadHandler = (
  context: ConfigReloadHandlerContext
) =>
  | Promise<ConfigReloadHandlerResult | void>
  | ConfigReloadHandlerResult
  | void

export interface ConfigReloadSubscription {
  readonly id: string
  readonly matcher: ConfigReloadMatcher
  readonly reload: ConfigReloadHandler
}

export interface ConfigHotReloadControllerOptions {
  readonly storage: RuntimeStore
  readonly config?: WanexConfigCore
  readonly subscriptions?: readonly ConfigReloadSubscription[]
  readonly onReload?: (result: ConfigReloadResult) => void
  readonly onError?: (error: ConfigReloadError) => void
  readonly label?: string
}

export interface ConfigReloadResult {
  readonly key: string
  readonly subscriptionId: string
  readonly reloaded: boolean
  readonly at: number
  readonly eventId?: string
  readonly reason?: string
  readonly detail?: JsonValue
}

export interface ConfigReloadError {
  readonly key: string
  readonly subscriptionId: string
  readonly error: {
    readonly name: string
    readonly message: string
  }
  readonly at: number
  readonly eventId?: string
}

export interface ConfigPollResult {
  readonly invalidatedKeys: readonly string[]
  readonly reloads: readonly ConfigReloadResult[]
  readonly errors: readonly ConfigReloadError[]
  readonly cursor?: EventCursor
}

export interface ConfigWatchOptions
  extends Omit<WatchConfigInvalidationsOptions, "onInvalidate" | "onError"> {
  readonly onReload?: (result: ConfigReloadResult) => void
  readonly onError?: (error: ConfigReloadError) => void
}
