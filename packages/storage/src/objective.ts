import { bindStoreFacet } from "./store-facet.js"
import { ObjectiveStoreMethods } from "./store-objective.js"
import type { StorageTransport } from "./transport.js"
import type { ObjectiveStore } from "./types-objective.js"

export type { ObjectiveStore } from "./types-objective.js"

export const createObjectiveStore = (
  transport: StorageTransport
): ObjectiveStore => bindStoreFacet(new ObjectiveStoreMethods({ transport }))
