import { DelegationStoreMethods } from "./store-delegation.js"
import { bindStoreFacet } from "./store-facet.js"
import type { StorageTransport } from "./transport.js"
import type { DelegationStore } from "./types-delegation.js"

export type { DelegationStore } from "./types-delegation.js"

export const createDelegationStore = (
  transport: StorageTransport
): DelegationStore => bindStoreFacet(new DelegationStoreMethods({ transport }))
