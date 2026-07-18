import type {
  ProductAppStateSnapshot
} from "./types.js"
import type {
  ProductAppReadSurfaceEventsRequest,
  ProductAppSurfaceError,
  ProductAppSurfaceEvent,
  ProductAppSurfaceEventType
} from "./types-surface.js"

export interface ProductAppSurfaceEventRecorder {
  record(request: ProductAppSurfaceEventRecordRequest): ProductAppSurfaceEvent
  read(
    request?: ProductAppReadSurfaceEventsRequest
  ): readonly ProductAppSurfaceEvent[]
}

export interface ProductAppSurfaceEventRecordRequest {
  readonly type: ProductAppSurfaceEventType
  readonly command: string
  readonly requestId?: string
  readonly state?: ProductAppStateSnapshot
  readonly error?: ProductAppSurfaceError
}

export function createProductAppSurfaceEventRecorder(
  now: () => number
): ProductAppSurfaceEventRecorder {
  const events: ProductAppSurfaceEvent[] = []
  let sequence = 0
  return {
    record(request) {
      sequence += 1
      const event: ProductAppSurfaceEvent = {
        id: `product_app_surface_event_${sequence}`,
        sequence,
        type: request.type,
        command: request.command,
        at: now(),
        ...(request.requestId === undefined
          ? {}
          : { requestId: request.requestId }),
        ...(request.state === undefined ? {} : { state: request.state }),
        ...(request.error === undefined ? {} : { error: request.error })
      }
      events.push(event)
      return event
    },
    read(request) {
      const afterSequence = request?.afterSequence
      const matched =
        afterSequence === undefined
          ? events
          : events.filter((event) => event.sequence > afterSequence)
      const limit = request?.limit
      if (limit === undefined) {
        return [...matched]
      }
      return matched.slice(Math.max(0, matched.length - limit))
    }
  }
}
