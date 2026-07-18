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

export type WanexAppShellConfigReloadMatcher = ConfigReloadMatcher
export type WanexAppShellConfigReloadHandlerContext =
  ConfigReloadHandlerContext
export type WanexAppShellConfigReloadHandlerResult = ConfigReloadHandlerResult
export type WanexAppShellConfigReloadHandler = ConfigReloadHandler
export type WanexAppShellConfigReloadSubscription = ConfigReloadSubscription
export type WanexAppShellConfigReloadResult = ConfigReloadResult
export type WanexAppShellConfigReloadError = ConfigReloadError
export type WanexAppShellConfigPollResult = ConfigPollResult
export type WanexAppShellConfigWatchOptions = ConfigWatchOptions

export interface WanexAppShellConfigReloadControllerOptions
  extends Omit<ConfigHotReloadControllerOptions, "label"> {}

export class WanexAppShellConfigReloadController extends ConfigHotReloadController {
  constructor(options: WanexAppShellConfigReloadControllerOptions) {
    super({
      ...options,
      label: "app shell config reload"
    })
  }
}
