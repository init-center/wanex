import { randomUUID } from "node:crypto"
import type { CommandCatalogInvalidatedEvent } from "../commands/model.js"
import type {
  ConversationEvent,
  SideQueryInvalidatedEvent,
  PlanInvalidatedEvent,
  GoalInvalidatedEvent,
  StateSnapshot
} from "../model.js"
import type { TeamInvalidatedEvent } from "../team/model.js"
import type { ProductPluginManagementInvalidatedEvent } from "../plugin-management/model.js"
import type {
  ReadSurfaceEventsRequest,
  SurfaceError,
  SurfaceEvent,
  SurfaceEventListener,
  SurfaceEventPage,
  SurfaceEventType,
  SurfaceEventUnsubscribe
} from "./model.js"

const DEFAULT_SURFACE_EVENT_CAPACITY = 256
const MAX_SURFACE_EVENT_CAPACITY = 4_096

export interface SurfaceEventRecorder {
  record(request: SurfaceEventRecordRequest): SurfaceEvent
  read(request?: ReadSurfaceEventsRequest): SurfaceEventPage
  subscribe(
    listener: SurfaceEventListener
  ): SurfaceEventUnsubscribe
  dispose(): void
}

export interface SurfaceEventRecordRequest {
  readonly type: SurfaceEventType
  readonly command: string
  readonly requestId?: string
  readonly state?: StateSnapshot
  readonly commandCatalog?: CommandCatalogInvalidatedEvent
  readonly conversation?: ConversationEvent
  readonly sideQuery?: SideQueryInvalidatedEvent
  readonly plan?: PlanInvalidatedEvent
  readonly goal?: GoalInvalidatedEvent
  readonly team?: TeamInvalidatedEvent
  readonly pluginManagement?: ProductPluginManagementInvalidatedEvent
  readonly error?: SurfaceError
}

export interface SurfaceEventRecorderOptions {
  readonly now: () => number
  readonly capacity?: number
  readonly streamId?: string
}

export function createSurfaceEventRecorder(
  options: SurfaceEventRecorderOptions
): SurfaceEventRecorder {
  const capacity = normalizeCapacity(options.capacity)
  const streamId = normalizeStreamId(
    options.streamId ?? `product_app_surface_stream_${randomUUID()}`
  )
  const events: SurfaceEvent[] = []
  const listeners = new Set<SurfaceEventListener>()
  let sequence = 0
  let disposed = false

  return {
    record(request) {
      if (disposed) {
        throw new Error("surface event recorder is disposed")
      }
      sequence += 1
      const event: SurfaceEvent = {
        id: `${streamId}:${sequence}`,
        sequence,
        type: request.type,
        command: request.command,
        at: options.now(),
        ...(request.requestId === undefined
          ? {}
          : { requestId: request.requestId }),
        ...(request.state === undefined ? {} : { state: request.state }),
        ...(request.commandCatalog === undefined
          ? {}
          : { commandCatalog: request.commandCatalog }),
        ...(request.conversation === undefined
          ? {}
          : { conversation: request.conversation }),
        ...(request.sideQuery === undefined
          ? {}
          : { sideQuery: request.sideQuery }),
        ...(request.plan === undefined ? {} : { plan: request.plan }),
        ...(request.goal === undefined ? {} : { goal: request.goal }),
        ...(request.team === undefined ? {} : { team: request.team }),
        ...(request.pluginManagement === undefined
          ? {}
          : { pluginManagement: request.pluginManagement }),
        ...(request.error === undefined ? {} : { error: request.error })
      }
      events.push(event)
      if (events.length > capacity) {
        events.splice(0, events.length - capacity)
      }
      for (const listener of listeners) {
        try {
          listener(event)
        } catch {
          // One presentation subscriber cannot block another subscriber.
        }
      }
      return event
    },
    read(request) {
      const afterSequence = request?.afterSequence ?? 0
      const earliestSequence = events[0]?.sequence ?? sequence + 1
      const streamMatches =
        request?.streamId === undefined
          ? afterSequence === 0
          : request.streamId === streamId
      const cursorInRange =
        afterSequence <= sequence && afterSequence >= earliestSequence - 1
      const gap = !streamMatches || !cursorInRange
      const unread = gap
        ? []
        : events.filter((event) => event.sequence > afterSequence)
      const limit = normalizeReadLimit(request?.limit, capacity)
      const pageEvents = unread.slice(0, limit)
      return {
        streamId,
        earliestSequence,
        latestSequence: sequence,
        gap,
        hasMore: unread.length > pageEvents.length,
        events: pageEvents
      }
    },
    subscribe(listener) {
      if (disposed) {
        return () => {}
      }
      listeners.add(listener)
      let subscribed = true
      return () => {
        if (!subscribed) {
          return
        }
        subscribed = false
        listeners.delete(listener)
      }
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      events.length = 0
      listeners.clear()
    }
  }
}

function normalizeCapacity(value: number | undefined): number {
  const capacity = value ?? DEFAULT_SURFACE_EVENT_CAPACITY
  if (
    !Number.isSafeInteger(capacity) ||
    capacity <= 0 ||
    capacity > MAX_SURFACE_EVENT_CAPACITY
  ) {
    throw new Error(
      `surface event capacity must be an integer from 1 to ${MAX_SURFACE_EVENT_CAPACITY}`
    )
  }
  return capacity
}

function normalizeReadLimit(
  value: number | undefined,
  capacity: number
): number {
  if (value === undefined) {
    return capacity
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      "surface event limit must be a positive integer"
    )
  }
  return Math.min(value, capacity)
}

function normalizeStreamId(value: string): string {
  const streamId = value.trim()
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(streamId)) {
    throw new Error(
      "surface event streamId must contain 1-200 safe characters"
    )
  }
  return streamId
}
