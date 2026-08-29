import type { SurfaceEvent } from "@wanex/assistant/surface"

const MAX_STARTUP_SURFACE_EVENTS = 256

export function createTuiStartupEventBuffer(): {
  readonly push: (event: SurfaceEvent) => void
  readonly drain: () => {
    readonly gap: boolean
    readonly events: readonly SurfaceEvent[]
  }
} {
  const events: SurfaceEvent[] = []
  let gap = false
  return {
    push(event) {
      if (events.length === MAX_STARTUP_SURFACE_EVENTS) {
        events.shift()
        gap = true
      }
      events.push(event)
    },
    drain() {
      const snapshot = { gap, events: events.splice(0) }
      gap = false
      return snapshot
    }
  }
}
