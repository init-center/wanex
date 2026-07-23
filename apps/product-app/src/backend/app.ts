import { createWanexApp } from "@wanex/app"
import { readProductAppBackendCapabilities } from "./capability-readiness.js"
import { readProductAppBackendDiagnosticsDetail } from "./product-diagnostics-detail.js"
import {
  routeProductAppBackendInput,
  routeProductAppBackendWorkflowEnvelope
} from "./input-router.js"
import { readProductAppBackendOverview } from "./product-overview.js"
import {
  readProductAppBackendWorkbench
} from "./product-workbench.js"
import { createProductAppBackendCommandRegistry } from "./product-command-registry.js"
import { runProductAppBackendSafeCommand } from "./result-envelope.js"
import type {
  ProductAppBackendApp,
  ProductAppBackendAppOptions,
  ProductAppBackendInputRouterCommands,
  ProductAppBackendStatus
} from "./types.js"

export async function createProductAppBackendApp(
  options: ProductAppBackendAppOptions
): Promise<ProductAppBackendApp> {
  const app = await createWanexApp({
    ...options,
    providerProfile: {
      ...options.providerProfile,
      id: options.providerProfile?.id ?? "product-app.backend-fake",
      modelId: options.providerProfile?.modelId ?? "product-app.backend-model"
    }
  })

  const status = (): ProductAppBackendStatus => app.status()
  const commandRegistry = createProductAppBackendCommandRegistry({
    commands: {
      submitConversationOperation: app.commands.submitConversationOperation,
      setAgentContextProfile: app.commands.setAgentContextProfile,
      refreshAgentContextProfile: app.commands.refreshAgentContextProfile,
      startAgentContextMonitor: app.commands.startAgentContextMonitor,
      stopAgentContextMonitor: app.commands.stopAgentContextMonitor,
      readDiagnostics: app.commands.readDiagnostics,
      buildSupportBundle: app.commands.buildSupportBundle,
      readRecentSessions: app.commands.readRecentSessions,
      readSessionInputProvenance: app.commands.readSessionInputProvenance,
      readSessionTranscript: app.commands.readSessionTranscript,
      readProductWorkbench: async (request) =>
        await routerCommands.readProductWorkbench(request),
      readProductOverview: async (options) =>
        await routerCommands.readProductOverview(options),
      readProductDiagnosticsDetail: async (options) =>
        await routerCommands.readProductDiagnosticsDetail(options),
      shutdown: app.commands.shutdown
    },
    ...(options.extensions?.snapshot === undefined
      ? {}
      : { extensionSnapshot: options.extensions.snapshot }),
    ...(options.productCommands?.extensionExecutor === undefined
      ? {}
      : { extensionCommandExecutor: options.productCommands.extensionExecutor }),
    status
  })

  const routerCommands: ProductAppBackendInputRouterCommands = {
    submitConversationOperation: app.commands.submitConversationOperation,
    readConversationOperation: app.commands.readConversationOperation,
    cancelConversationOperation: app.commands.cancelConversationOperation,
    setAgentContextProfile: app.commands.setAgentContextProfile,
    refreshAgentContextProfile: app.commands.refreshAgentContextProfile,
    startAgentContextMonitor: app.commands.startAgentContextMonitor,
    stopAgentContextMonitor: app.commands.stopAgentContextMonitor,
    readDiagnostics: app.commands.readDiagnostics,
    buildSupportBundle: app.commands.buildSupportBundle,
    readRecentSessions: app.commands.readRecentSessions,
    readSessionInputProvenance: app.commands.readSessionInputProvenance,
    readSessionTranscript: app.commands.readSessionTranscript,
    ingestResource: app.commands.ingestResource,
    readResource: app.commands.readResource,
    readExecutionReference: app.commands.readExecutionReference,
    async readProductWorkbench(request) {
      return await readProductAppBackendWorkbench(routerCommands, request)
    },
    readExtensionContributions: app.commands.readExtensionContributions,
    readProductCapabilities: () =>
      readProductAppBackendCapabilities(status(), {
        extensionCommandExecutorConfigured:
          options.productCommands?.extensionExecutor !== undefined
      }),
    async readProductOverview(options) {
      return await readProductAppBackendOverview(
        {
          status,
          readProductCapabilities: routerCommands.readProductCapabilities,
          readProductCommands: routerCommands.readProductCommands,
          readDiagnostics: routerCommands.readDiagnostics,
          readRecentSessions: routerCommands.readRecentSessions
        },
        options
      )
    },
    async readProductDiagnosticsDetail(options) {
      return await readProductAppBackendDiagnosticsDetail(
        {
          readDiagnostics: routerCommands.readDiagnostics
        },
        options
      )
    },
    readProductCommands: commandRegistry.readProductCommands,
    explainProductCommandContribution:
      commandRegistry.explainProductCommandContribution,
    previewProductCommandInvocation:
      commandRegistry.previewProductCommandInvocation,
    executeProductCommand: commandRegistry.executeProductCommand,
    readActiveProviderProfile: app.commands.readActiveProviderProfile,
    setActiveProviderProfile: app.commands.setActiveProviderProfile,
    upsertProviderProfile: app.commands.upsertProviderProfile,
    readProviderProfile: app.commands.readProviderProfile,
    listProviderProfiles: app.commands.listProviderProfiles,
    shutdown: app.commands.shutdown,
    routeAppWorkflowEnvelope: app.commands.routeWorkflowEnvelope,
    async routeInput(request) {
      return await routeProductAppBackendInput({ commands: routerCommands, status }, request)
    },
    async routeWorkflowEnvelope(request) {
      return await routeProductAppBackendWorkflowEnvelope(
        { commands: routerCommands, status },
        request
      )
    },
    async safeCommand(request) {
      return await runProductAppBackendSafeCommand(request)
    }
  }

  return {
    commands: routerCommands,
    events: app.events,
    status,
    async dispose() {
      await app.dispose()
    }
  }
}
