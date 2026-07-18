import { bindStoreFacet } from "./store-facet.js"
import { WorkspaceStoreMethods } from "./store-workspace.js"
import type { StorageTransport } from "./transport.js"
import type { WorkspaceStore } from "./types-workspace.js"

export type { WorkspaceStore } from "./types-workspace.js"

export const createWorkspaceStore = (
  transport: StorageTransport
): WorkspaceStore => bindStoreFacet(new WorkspaceStoreMethods({ transport }))
