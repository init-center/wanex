import type {
  PluginManagementPort,
  PluginManagementReadResult,
  PluginManagementRejectedResult,
  AssistantPluginManagementCommands,
  AssistantPluginManagementEvents,
} from "./model.js"

export interface AssistantPluginManagementService {
  readonly commands: AssistantPluginManagementCommands
  readonly events: AssistantPluginManagementEvents
  dispose(): void
}

export function createAssistantPluginManagementService(options: {
  readonly port?: PluginManagementPort
}): AssistantPluginManagementService {
  const listeners = new Set<
    Parameters<
      AssistantPluginManagementEvents["subscribePluginManagementEvents"]
    >[0]
  >()
  let sequence = 0
  let disposed = false
  const unsubscribe = options.port?.subscribe((event) => {
    if (disposed) return
    const projected = {
      kind: "assistant.plugin-management.invalidated" as const,
      sequence: ++sequence,
      at: event.at,
      revision: event.revision,
    }
    for (const listener of listeners) {
      try {
        listener(projected)
      } catch {
        // Presentation listeners cannot affect trusted Plugin management.
      }
    }
  })

  return {
    commands: {
      async read(): Promise<PluginManagementReadResult> {
        return options.port === undefined
          ? unavailablePluginManagement()
          : await options.port.read()
      },
      async requestLocalReview() {
        return options.port === undefined
          ? notConfigured()
          : await options.port.requestLocalReview()
      },
      async approveLocalReview(request) {
        return options.port === undefined
          ? notConfigured()
          : await options.port.approveLocalReview(request)
      },
      async cancelLocalReview(request) {
        return options.port === undefined
          ? notConfigured()
          : await options.port.cancelLocalReview(request)
      },
      async setInstallState(request) {
        return options.port === undefined
          ? notConfigured()
          : await options.port.setInstallState(request)
      },
      async retryRefresh() {
        return options.port === undefined
          ? notConfigured()
          : await options.port.retryRefresh()
      },
    },
    events: {
      subscribePluginManagementEvents(listener) {
        if (disposed) return () => undefined
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribe?.()
      listeners.clear()
    },
  }
}

export function unavailablePluginManagement(): PluginManagementReadResult {
  return Object.freeze({
    kind: "assistant.plugin-management.unavailable",
    reason: "not_configured",
    message: "Plugin management is not configured.",
  })
}

function notConfigured(): PluginManagementRejectedResult {
  return {
    kind: "plugin.management.rejected",
    reason: "not_configured",
    message: "Plugin management is not configured.",
  }
}
