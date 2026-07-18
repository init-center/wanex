import { bindStoreFacet } from "./store-facet.js"
import { PluginStoreMethods } from "./store-plugin.js"
import type { StorageTransport } from "./transport.js"
import type { PluginStore } from "./types-plugin.js"

export type { PluginStore } from "./types-plugin.js"

export const createPluginStore = (transport: StorageTransport): PluginStore =>
  bindStoreFacet(new PluginStoreMethods({ transport }))
