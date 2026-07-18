import { BudgetStoreMethods } from "./store-budget.js"
import { ContextStoreMethods } from "./store-context.js"
import { bindStoreFacet } from "./store-facet.js"
import { JobStoreMethods } from "./store-job.js"
import { RunnerStoreMethods } from "./store-runner.js"
import { RuntimeStoreMethods } from "./store-runtime-core.js"
import { SessionStoreMethods } from "./store-session.js"
import { ToolExecutionStoreMethods } from "./store-tools.js"
import type { StorageTransport } from "./transport.js"
import type {
  ContextStore,
  CoreStore,
  RuntimeStore,
  SchedulerStore,
  SessionStore
} from "./types.js"

export function createCoreStore(transport: StorageTransport): CoreStore {
  return Object.assign(
    {},
    bindStoreFacet<RuntimeStore>(new RuntimeStoreMethods({ transport })),
    bindStoreFacet<SessionStore>(new SessionStoreMethods({ transport })),
    bindStoreFacet<ContextStore>(new ContextStoreMethods({ transport })),
    bindStoreFacet(new ToolExecutionStoreMethods({ transport })),
    createSchedulerStore(transport)
  )
}

export function createSchedulerStore(transport: StorageTransport): SchedulerStore {
  return Object.assign(
    {},
    bindStoreFacet(new RunnerStoreMethods({ transport })),
    bindStoreFacet(new BudgetStoreMethods({ transport })),
    bindStoreFacet(new JobStoreMethods({ transport }))
  ) as SchedulerStore
}
