import type {
  BackendCapabilityId,
  BackendCapabilityReadModel,
  BackendCapabilityRow,
  BackendStatus
} from "./model/index.js"

export const BACKEND_CAPABILITY_IDS = {
  appHost: "wanex-app",
  assistantCommandRegistry: "assistant-command-registry",
  agentTurn: "agent-turn",
  diagnosticsSupport: "diagnostics-support",
  contextProfile: "context-profile",
  workflowEnvelope: "workflow-envelope",
  extensionCommandDiscovery: "extension-command-discovery",
  pluginActionExecution: "plugin-action-execution",
  connectorRuntime: "connector-runtime"
} as const satisfies Readonly<Record<string, BackendCapabilityId>>

export function readBackendCapabilities(
  status: BackendStatus,
  options?: { readonly extensionCommandExecutorConfigured?: boolean }
): BackendCapabilityReadModel {
  const capabilities: BackendCapabilityRow[] = [
    enabledCapability({
      id: BACKEND_CAPABILITY_IDS.appHost,
      title: "App command surface",
      ownerPackage: "@wanex/app",
      commandIds: [
        "submitConversationOperation",
        "readConversationOperation",
        "cancelConversationOperation",
        "readDiagnostics",
        "buildSupportBundle",
        "readRecentSessions",
        "readAssistantWorkbench",
        "readSessionInputProvenance",
        "readSessionTranscript",
        "routeWorkflowEnvelope",
        "shutdown"
      ]
    }),
    enabledCapability({
      id: BACKEND_CAPABILITY_IDS.assistantCommandRegistry,
      title: "Assistant command registry",
      ownerPackage: "@wanex/app",
      commandIds: [
        "readAssistantOverview",
        "readRecentSessions",
        "readAssistantWorkbench",
        "readAssistantDiagnosticsDetail",
        "readAssistantCommands",
        "explainAssistantCommandContribution",
        "previewAssistantCommandInvocation",
        "executeAssistantCommand"
      ]
    }),
    enabledCapability({
      id: BACKEND_CAPABILITY_IDS.agentTurn,
      title: "Agent turn execution",
      ownerPackage: "@wanex/app",
      commandIds: ["assistant.agent.submit"]
    }),
    enabledCapability({
      id: BACKEND_CAPABILITY_IDS.diagnosticsSupport,
      title: "Diagnostics and support bundle",
      ownerPackage: "@wanex/app",
      commandIds: [
        "assistant.diagnostics.read",
        "assistant.diagnostics.detail.read",
        "assistant.support.build"
      ]
    }),
    enabledCapability({
      id: BACKEND_CAPABILITY_IDS.contextProfile,
      title: "Agent context profile reload",
      ownerPackage: "@wanex/app",
      commandIds: [
        "assistant.context.refresh",
        "assistant.context.monitor.start",
        "assistant.context.monitor.stop"
      ]
    }),
    enabledCapability({
      id: BACKEND_CAPABILITY_IDS.workflowEnvelope,
      title: "Workflow envelope routing",
      ownerPackage: "@wanex/app",
      commandIds: ["routeWorkflowEnvelope"]
    }),
    enabledCapability({
      id: BACKEND_CAPABILITY_IDS.extensionCommandDiscovery,
      title: "Extension command discovery",
      ownerPackage: "@wanex/extension",
      commandIds: ["readAssistantCommands", "readExtensionContributions"],
      notes: [
        status.extensions.configured
          ? "extension catalog configured"
          : "no extension catalog configured"
      ]
    }),
    options?.extensionCommandExecutorConfigured
      ? enabledCapability({
          id: BACKEND_CAPABILITY_IDS.pluginActionExecution,
          title: "Plugin action execution",
          ownerPackage: "@wanex/assistant-plugin-host",
          defaultSelected: false,
          commandIds: ["executeAssistantCommand"],
          notes: ["extension command executor configured"]
        })
      : notSelectedCapability({
          id: BACKEND_CAPABILITY_IDS.pluginActionExecution,
          title: "Plugin action execution",
          ownerPackage: "@wanex/assistant-plugin-host",
          notes: ["add explicitly when assistant commands should submit plugin.action jobs"]
        }),
    notSelectedCapability({
      id: BACKEND_CAPABILITY_IDS.connectorRuntime,
      title: "Connector runtime",
      ownerPackage: "@wanex/connector",
      notes: ["add explicitly when external channels are enabled"]
    })
  ]

  return {
    capabilities,
    selectedCount: capabilities.filter((item) => item.state === "enabled").length,
    notSelectedCount: capabilities.filter(
      (item) => item.state === "not_selected"
    ).length,
    extensionConfigured: status.extensions.configured
  }
}

function enabledCapability(options: {
  readonly id: BackendCapabilityId
  readonly title: string
  readonly ownerPackage: string
  readonly commandIds?: readonly string[]
  readonly notes?: readonly string[]
  readonly defaultSelected?: boolean
}): BackendCapabilityRow {
  return {
    id: options.id,
    title: options.title,
    state: "enabled",
    ownerPackage: options.ownerPackage,
    defaultSelected: options.defaultSelected ?? true,
    commandIds: options.commandIds ?? [],
    notes: options.notes ?? []
  }
}

function notSelectedCapability(options: {
  readonly id: BackendCapabilityId
  readonly title: string
  readonly ownerPackage: string
  readonly notes?: readonly string[]
}): BackendCapabilityRow {
  return {
    id: options.id,
    title: options.title,
    state: "not_selected",
    ownerPackage: options.ownerPackage,
    defaultSelected: false,
    commandIds: [],
    notes: options.notes ?? []
  }
}
