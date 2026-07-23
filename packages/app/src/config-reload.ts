import {
  ConfigHotReloadController,
  type ConfigHotReloadControllerOptions,
  type ConfigPollResult,
  type ConfigReloadError,
  type ConfigReloadHandler,
  type ConfigReloadHandlerContext,
  type ConfigReloadHandlerResult,
  type ConfigReloadMatcher,
  type ConfigReloadResult,
  type ConfigReloadSubscription,
  type ConfigWatchOptions
} from "@wanex/runtime/config"

export type WanexAppConfigReloadMatcher = ConfigReloadMatcher
export type WanexAppConfigReloadHandlerContext =
  ConfigReloadHandlerContext
export type WanexAppConfigReloadHandlerResult = ConfigReloadHandlerResult
export type WanexAppConfigReloadHandler = ConfigReloadHandler
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
