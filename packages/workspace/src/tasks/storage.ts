import type { CoreStore } from "@wanex/storage"
import type { WorkspaceStore } from "@wanex/storage/workspace"

export type WorkspaceTaskStore = CoreStore & WorkspaceStore
