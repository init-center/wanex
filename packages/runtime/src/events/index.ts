import type {
  EventCursor,
  EventFamily,
  QueryEventsInput,
  RuntimeEvent
} from "@wanex/protocol"
import {
  eventHasFamily,
  isKnownRuntimeEventType
} from "@wanex/protocol"
import type { RuntimeStore } from "@wanex/storage"

export const WANEX_RUNTIME_EVENTS = "wanex-runtime-events" as const

export interface WanexEventCoreOptions {
  readonly storage: RuntimeStore
}

export interface ReconcileEventsRequest extends QueryEventsInput {
  readonly cursor?: EventCursor
}

export interface ReconcileEventsResult {
  readonly events: readonly RuntimeEvent[]
  readonly cursor?: EventCursor
}

export class WanexEventCore {
  private readonly storage: RuntimeStore

  constructor(options: WanexEventCoreOptions) {
    this.storage = options.storage
  }

  async query(request: QueryEventsInput): Promise<RuntimeEvent[]> {
    return await this.storage.queryEvents(request)
  }

  async reconcile(request: ReconcileEventsRequest): Promise<ReconcileEventsResult> {
    const cursor = request.cursor ?? request.after
    const events = await this.storage.queryEvents({
      ...request,
      ...(cursor === undefined ? {} : { after: cursor })
    })
    const nextCursor = nextEventCursor(events) ?? cursor
    return {
      events,
      ...(nextCursor === undefined ? {} : { cursor: nextCursor })
    }
  }
}

export function nextEventCursor(
  events: readonly RuntimeEvent[]
): EventCursor | undefined {
  const last = events.at(-1)
  if (last === undefined) {
    return undefined
  }
  return {
    occurredAt: last.occurredAt,
    eventId: last.id
  }
}

export function filterEventsByFamily(
  events: readonly RuntimeEvent[],
  family: EventFamily
): RuntimeEvent[] {
  return events.filter((event) => eventHasFamily(event, family))
}

export function filterKnownEvents(
  events: readonly RuntimeEvent[]
): RuntimeEvent[] {
  return events.filter((event) => isKnownRuntimeEventType(event.type))
}
