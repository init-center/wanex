import type { AppExtensionCatalogSource } from "@wanex/extension"
import type {
  CommandCatalogEventListener,
  CommandCatalogEventUnsubscribe,
  CommandCatalogEvents,
  CommandCatalogInvalidatedEvent
} from "./model.js"

export interface CommandCatalogEventHub extends CommandCatalogEvents {
  dispose(): void
}

export function createCommandCatalogEventHub(options: {
  readonly source?: AppExtensionCatalogSource
  readonly now?: () => number
}): CommandCatalogEventHub {
  const listeners = new Set<CommandCatalogEventListener>()
  const now = options.now ?? Date.now
  let sequence = 0
  let lastRevision = options.source?.current().revision
  let disposed = false
  const unsubscribe = options.source?.subscribe((generation) => {
    if (disposed || generation.revision === lastRevision) return
    lastRevision = generation.revision
    sequence += 1
    emit({
      kind: "product.command-catalog.invalidated",
      sequence,
      at: now(),
      revision: generation.revision
    })
  })

  function emit(event: CommandCatalogInvalidatedEvent): void {
    for (const listener of listeners) {
      try {
        listener(event)
      } catch {
        // Presentation listeners cannot affect catalog publication.
      }
    }
  }

  return {
    subscribeCommandCatalogEvents(
      listener: CommandCatalogEventListener
    ): CommandCatalogEventUnsubscribe {
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
      unsubscribe?.()
      listeners.clear()
    }
  }
}
