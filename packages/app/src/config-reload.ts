import {
  ConfigHotReloadController,
  type ConfigHotReloadControllerOptions,
  type ConfigPollResult,
  type ConfigReloadError,
  type ConfigReloadCandidate,
  type ConfigReloadCandidateResult,
  type ConfigReloadMatcher,
  type ConfigReloadPrepare,
  type ConfigReloadPrepareContext,
  type ConfigReloadResult,
  type ConfigReloadSubscription,
  type ConfigWatchOptions
} from "@wanex/runtime/config"

export type WanexAppConfigReloadMatcher = ConfigReloadMatcher
export type WanexAppConfigReloadPrepareContext = ConfigReloadPrepareContext
export type WanexAppConfigReloadCandidateResult = ConfigReloadCandidateResult
export type WanexAppConfigReloadCandidate = ConfigReloadCandidate
export type WanexAppConfigReloadPrepare = ConfigReloadPrepare
export type WanexAppConfigReloadSubscription = ConfigReloadSubscription
export type WanexAppConfigReloadResult = ConfigReloadResult
export type WanexAppConfigReloadError = ConfigReloadError
export type WanexAppConfigPollResult = ConfigPollResult
export type WanexAppConfigWatchOptions = ConfigWatchOptions

export interface WanexAppConfigReloadControllerOptions
  extends Omit<ConfigHotReloadControllerOptions, "label"> {}

export class WanexAppConfigReloadController extends ConfigHotReloadController {
  constructor(options: WanexAppConfigReloadControllerOptions) {
    super({
      ...options,
      label: "app config reload"
    })
  }
}
