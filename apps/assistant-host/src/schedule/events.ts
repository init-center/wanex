import type { SchedulePortInvalidation } from "@wanex/assistant/schedule"

export interface LocalScheduleInvalidationHub {
  publish(event: SchedulePortInvalidation): void
  subscribe(listener: (event: SchedulePortInvalidation) => void): () => void
  dispose(): void
}

export function createLocalScheduleInvalidationHub(): LocalScheduleInvalidationHub {
  const listeners = new Set<(event: SchedulePortInvalidation) => void>()
  let disposed = false
  return {
    publish(event) {
      if (disposed) return
      const projected: SchedulePortInvalidation = {
        at: event.at,
        revision: event.revision,
      }
      for (const listener of listeners) {
        try {
          listener(projected)
        } catch {
          // Advisory listeners cannot affect durable Schedule mutations.
        }
      }
    },
    subscribe(listener) {
      if (disposed) return () => undefined
      listeners.add(listener)
      let subscribed = true
      return () => {
        if (!subscribed) return
        subscribed = false
        listeners.delete(listener)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      listeners.clear()
    },
  }
}
