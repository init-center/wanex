import { bindStoreFacet } from "./store-facet.js"
import { PlanStoreMethods } from "./store-plan.js"
import type { StorageTransport } from "./transport.js"
import type { PlanStore } from "./types-plan.js"

export type { PlanStore } from "./types-plan.js"

export const createPlanStore = (transport: StorageTransport): PlanStore =>
  bindStoreFacet(new PlanStoreMethods({ transport }))
