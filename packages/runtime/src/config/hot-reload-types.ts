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

export interface ConfigReloadPrepareContext {
  readonly key: string
  readonly config: WanexConfigCore
  readonly event?: RuntimeEvent
}

export interface ConfigReloadCandidateResult {
  readonly reloaded: boolean
  readonly reason?: string
  readonly detail?: JsonValue
}

export interface ConfigReloadReadyCandidate {
  readonly kind: "ready"
  readonly result: ConfigReloadCandidateResult
  commit(): Promise<void> | void
  rollback(): Promise<void> | void
}

export interface ConfigReloadRejectedCandidate {
  readonly kind: "rejected"
  readonly result: ConfigReloadCandidateResult
}

export type ConfigReloadCandidate =
  | ConfigReloadReadyCandidate
  | ConfigReloadRejectedCandidate

export type ConfigReloadPrepare = (
  context: ConfigReloadPrepareContext
) => Promise<ConfigReloadCandidate> | ConfigReloadCandidate

export interface ConfigReloadSubscription {
  readonly id: string
  readonly matcher: ConfigReloadMatcher
  readonly prepare: ConfigReloadPrepare
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
  readonly generation: number
  readonly committed: boolean
  readonly at: number
  readonly eventId?: string
  readonly reason?: string
  readonly detail?: JsonValue
}

export interface ConfigReloadError {
  readonly key: string
  readonly subscriptionId: string
  readonly stage: "prepare" | "commit" | "rollback" | "watch"
  readonly error: {
    readonly name: string
    readonly message: string
  }
  readonly at: number
  readonly eventId?: string
}

export interface ConfigRefreshResult {
  readonly generation: number
  readonly committed: boolean
  readonly reloads: readonly ConfigReloadResult[]
  readonly errors: readonly ConfigReloadError[]
}

export interface ConfigPollResult {
  readonly generation: number
  readonly committed: boolean
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
