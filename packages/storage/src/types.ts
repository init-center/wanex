import type { ContextStore } from "./types-context.js"
import type { RuntimeStore } from "./types-runtime-core.js"
import type { MediaGenerationStore } from "./types-media-generation.js"
import type { SchedulerStore } from "./types-scheduler.js"
import type { SessionStore } from "./types-session.js"
import type { ToolExecutionStore } from "./types-tools.js"

export interface CoreStore
  extends RuntimeStore,
    MediaGenerationStore,
    SessionStore,
    ContextStore,
    SchedulerStore,
    ToolExecutionStore {}

export type { ContextStore } from "./types-context.js"
export type {
  ConditionalConfigMutationRequest,
  ConfigCompareAndApplyResult,
  ConfigConditionConflict,
  ConfigEntryRecord,
  ConfigMutationRequest,
  ConfigMutationCondition,
  ConfigPut,
  ListConfigEntriesRequest,
  RuntimeStore
} from "./types-runtime-core.js"
export type { MediaGenerationStore } from "./types-media-generation.js"
export type { SchedulerStore } from "./types-scheduler.js"
export type { SessionStore } from "./types-session.js"
export type { ToolExecutionStore } from "./types-tools.js"
