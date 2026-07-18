import { ChannelStoreMethods } from "./store-channel.js"
import { bindStoreFacet } from "./store-facet.js"
import type { StorageTransport } from "./transport.js"
import type { ChannelStore } from "./types-channel.js"

export type { ChannelStore } from "./types-channel.js"

export const createChannelStore = (transport: StorageTransport): ChannelStore =>
  bindStoreFacet(new ChannelStoreMethods({ transport }))
