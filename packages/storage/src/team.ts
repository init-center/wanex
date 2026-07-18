import { bindStoreFacet } from "./store-facet.js"
import { TeamStoreMethods } from "./store-team.js"
import type { StorageTransport } from "./transport.js"
import type { TeamStore } from "./types-team.js"

export type { TeamStore } from "./types-team.js"

export const createTeamStore = (transport: StorageTransport): TeamStore =>
  bindStoreFacet(new TeamStoreMethods({ transport }))
