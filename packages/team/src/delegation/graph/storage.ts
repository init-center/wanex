import type { SchedulerStore } from "@wanex/storage"
import type { DelegationStore } from "@wanex/storage/delegation"

export type DelegationGraphStorage = DelegationStore
export type DelegationGraphRuntimeStorage =
  DelegationStore & SchedulerStore
