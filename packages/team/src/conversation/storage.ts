import type { SchedulerStore } from "@wanex/storage"
import type { TeamStore } from "@wanex/storage/team"

export type TeamConversationStorage = TeamStore
export type TeamRoundJobStorage = SchedulerStore
export type TeamConversationRuntimeStorage =
  TeamConversationStorage & TeamRoundJobStorage
