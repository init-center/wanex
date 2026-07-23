import type {
  ProductAppBackendCapabilityId,
  ProductAppBackendCapabilityReadModel,
  ProductAppBackendCapabilityRow,
  ProductAppBackendStatus
} from "./types.js"

export const PRODUCT_APP_BACKEND_CAPABILITY_IDS = {
  appHost: "wanex-app",
  productCommandRegistry: "product-command-registry",
  agentTurn: "agent-turn",
  diagnosticsSupport: "diagnostics-support",
  contextProfile: "context-profile",
  workflowEnvelope: "workflow-envelope",
  extensionCommandDiscovery: "extension-command-discovery",
  pluginActionExecution: "plugin-action-execution",
  connectorRuntime: "connector-runtime"
} as const satisfies Readonly<Record<string, ProductAppBackendCapabilityId>>

export function readProductAppBackendCapabilities(
  status: ProductAppBackendStatus,
  options?: { readonly extensionCommandExecutorConfigured?: boolean }
): ProductAppBackendCapabilityReadModel {
  const capabilities: ProductAppBackendCapabilityRow[] = [
    enabledCapability({
      id: PRODUCT_APP_BACKEND_CAPABILITY_IDS.appHost,
      title: "App command surface",
      ownerPackage: "@wanex/app",
      commandIds: [
        "submitConversationOperation",
        "readConversationOperation",
        "cancelConversationOperation",
        "readDiagnostics",
        "buildSupportBundle",
        "readRecentSessions",
        "readProductWorkbench",
        "readSessionInputProvenance",
        "readSessionTranscript",
        "routeWorkflowEnvelope",
        "shutdown"
      ]
    }),
    enabledCapability({
      id: PRODUCT_APP_BACKEND_CAPABILITY_IDS.productCommandRegistry,
      title: "Product command registry",
      ownerPackage: "@wanex/app",
      commandIds: [
        "readProductOverview",
        "readRecentSessions",
        "readProductWorkbench",
        "readProductDiagnosticsDetail",
        "readProductCommands",
        "explainProductCommandContribution",
        "previewProductCommandInvocation",
        "executeProductCommand"
      ]
    }),
    enabledCapability({
      id: PRODUCT_APP_BACKEND_CAPABILITY_IDS.agentTurn,
      title: "Agent turn execution",
      ownerPackage: "@wanex/app",
      commandIds: ["product.agent.submit"]
    }),
    enabledCapability({
      id: PRODUCT_APP_BACKEND_CAPABILITY_IDS.diagnosticsSupport,
      title: "Diagnostics and support bundle",
      ownerPackage: "@wanex/app",
      commandIds: [
        "product.diagnostics.read",
        "product.diagnostics.detail.read",
        "product.support.build"
      ]
    }),
    enabledCapability({
      id: PRODUCT_APP_BACKEND_CAPABILITY_IDS.contextProfile,
      title: "Agent context profile reload",
      ownerPackage: "@wanex/app",
      commandIds: [
        "product.context.refresh",
        "product.context.monitor.start",
        "product.context.monitor.stop"
      ]
    }),
    enabledCapability({
      id: PRODUCT_APP_BACKEND_CAPABILITY_IDS.workflowEnvelope,
      title: "Workflow envelope routing",
      ownerPackage: "@wanex/app",
      commandIds: ["routeWorkflowEnvelope"]
    }),
    enabledCapability({
      id: PRODUCT_APP_BACKEND_CAPABILITY_IDS.extensionCommandDiscovery,
      title: "Extension command discovery",
      ownerPackage: "@wanex/extension",
      commandIds: ["readProductCommands", "readExtensionContributions"],
      notes: [
        status.extensions.configured
          ? "extension snapshot configured"
          : "no extension snapshot configured"
      ]
    }),
    options?.extensionCommandExecutorConfigured
      ? enabledCapability({
          id: PRODUCT_APP_BACKEND_CAPABILITY_IDS.pluginActionExecution,
          title: "Plugin action execution",
          ownerPackage: "@wanex/product-app-command-host",
          defaultSelected: false,
          commandIds: ["executeProductCommand"],
          notes: ["extension command executor configured"]
        })
      : notSelectedCapability({
          id: PRODUCT_APP_BACKEND_CAPABILITY_IDS.pluginActionExecution,
          title: "Plugin action execution",
          ownerPackage: "@wanex/product-app-command-host",
          notes: ["add explicitly when product commands should submit plugin.action jobs"]
        }),
    notSelectedCapability({
      id: PRODUCT_APP_BACKEND_CAPABILITY_IDS.connectorRuntime,
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
  readonly id: ProductAppBackendCapabilityId
  readonly title: string
  readonly ownerPackage: string
  readonly commandIds?: readonly string[]
  readonly notes?: readonly string[]
  readonly defaultSelected?: boolean
}): ProductAppBackendCapabilityRow {
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
  readonly id: ProductAppBackendCapabilityId
  readonly title: string
  readonly ownerPackage: string
  readonly notes?: readonly string[]
}): ProductAppBackendCapabilityRow {
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
