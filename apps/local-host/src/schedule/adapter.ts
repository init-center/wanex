import type { CoreStore } from "@wanex/storage"
import { createLocalScheduleDefinitionStore } from "./definition-store.js"
import { createLocalScheduleInvalidationHub } from "./events.js"
import type { LocalScheduleAdapter } from "./model.js"
import { createLocalScheduleOccurrenceStore } from "./occurrence-store.js"

export function createLocalScheduleAdapter(options: {
  readonly storage: CoreStore
  readonly now?: () => number
}): LocalScheduleAdapter {
  const now = options.now ?? Date.now
  const events = createLocalScheduleInvalidationHub()
  const definitions = createLocalScheduleDefinitionStore({
    storage: options.storage,
    events,
    now,
  })
  const occurrences = createLocalScheduleOccurrenceStore({
    storage: options.storage,
    now,
  })
  return {
    port: definitions.port,
    listDefinitionRecords: definitions.listDefinitionRecords,
    claimOccurrence: occurrences.claimOccurrence,
    listOccurrences: occurrences.listOccurrences,
    listPendingOccurrences: occurrences.listPendingOccurrences,
    updateOccurrenceDelivery: occurrences.updateOccurrenceDelivery,
    pruneSettledOccurrences: occurrences.pruneSettledOccurrences,
    dispose: () => events.dispose(),
  }
}
