import type { TeamPortInvalidation } from "@wanex/assistant/team"

export interface LocalTeamInvalidationHub {
  notify(event: TeamPortInvalidation): void
  subscribe(listener: (event: TeamPortInvalidation) => void): () => void
  dispose(): void
}

export function createLocalTeamInvalidationHub(): LocalTeamInvalidationHub {
  const listeners = new Set<(event: TeamPortInvalidation) => void>()
  let disposed = false
  return {
    notify(event) {
      if (disposed) return
      const projected: TeamPortInvalidation = {
        cause: event.cause,
        at: event.at,
        ...(event.conversationId === undefined
          ? {}
          : { conversationId: event.conversationId })
      }
      for (const listener of listeners) {
        try {
          listener(projected)
        } catch {
          // Advisory listeners cannot affect durable Team mutations.
        }
      }
    },
    subscribe(listener) {
      if (disposed) return () => {}
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
    }
  }
}
