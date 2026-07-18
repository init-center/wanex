import type { CoreStore } from "@wanex/storage"
import type { PluginStore } from "@wanex/storage/plugin"

export type PluginRuntimeStore = CoreStore & PluginStore
