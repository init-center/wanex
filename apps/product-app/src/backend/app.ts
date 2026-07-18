import { createWanexAppShell } from "@wanex/app/backend"
import { readProductAppBackendCapabilities } from "./capability-readiness.js"
import { readProductAppBackendDiagnosticsDetail } from "./product-diagnostics-detail.js"
import {
  routeProductAppBackendInput,
  routeProductAppBackendWorkflowEnvelope
} from "./input-router.js"
import { readProductAppBackendOverview } from "./product-overview.js"
import {
  continueProductAppBackendWorkbenchSession,
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
  const shell = await createWanexAppShell({
    ...options,
    providerProfile: {
      ...options.providerProfile,
      id: options.providerProfile?.id ?? "product-app.backend-fake",
      modelId: options.providerProfile?.modelId ?? "product-app.backend-model"
    }
  })

  const status = (): ProductAppBackendStatus => shell.status()
  const commandRegistry = createProductAppBackendCommandRegistry({
    commands: {
      runAgentTurn: shell.commands.runAgentTurn,
      setAgentContextProfile: shell.commands.setAgentContextProfile,
      refreshAgentContextProfile: shell.commands.refreshAgentContextProfile,
      startAgentContextMonitor: shell.commands.startAgentContextMonitor,
      stopAgentContextMonitor: shell.commands.stopAgentContextMonitor,
      readDiagnostics: shell.commands.readDiagnostics,
      buildSupportBundle: shell.commands.buildSupportBundle,
      readRecentSessions: shell.commands.readRecentSessions,
      readSessionInputProvenance: shell.commands.readSessionInputProvenance,
      readSessionTranscript: shell.commands.readSessionTranscript,
      readProductWorkbench: async (request) =>
        await routerCommands.readProductWorkbench(request),
      continueProductWorkbenchSession: async (request) =>
        await routerCommands.continueProductWorkbenchSession(request),
      readProductOverview: async (options) =>
        await routerCommands.readProductOverview(options),
      readProductDiagnosticsDetail: async (options) =>
        await routerCommands.readProductDiagnosticsDetail(options),
      shutdown: shell.commands.shutdown
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
    runAgentTurn: shell.commands.runAgentTurn,
    setAgentContextProfile: shell.commands.setAgentContextProfile,
    refreshAgentContextProfile: shell.commands.refreshAgentContextProfile,
    startAgentContextMonitor: shell.commands.startAgentContextMonitor,
    stopAgentContextMonitor: shell.commands.stopAgentContextMonitor,
    readDiagnostics: shell.commands.readDiagnostics,
    buildSupportBundle: shell.commands.buildSupportBundle,
    readRecentSessions: shell.commands.readRecentSessions,
    readSessionInputProvenance: shell.commands.readSessionInputProvenance,
    readSessionTranscript: shell.commands.readSessionTranscript,
    readExecutionReference: shell.commands.readExecutionReference,
    async readProductWorkbench(request) {
      return await readProductAppBackendWorkbench(routerCommands, request)
    },
    async continueProductWorkbenchSession(request) {
      return await continueProductAppBackendWorkbenchSession(
        routerCommands,
        request
      )
    },
    readExtensionContributions: shell.commands.readExtensionContributions,
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
    readActiveProviderProfile: shell.commands.readActiveProviderProfile,
    setActiveProviderProfile: shell.commands.setActiveProviderProfile,
    upsertProviderProfile: shell.commands.upsertProviderProfile,
    readProviderProfile: shell.commands.readProviderProfile,
    listProviderProfiles: shell.commands.listProviderProfiles,
    shutdown: shell.commands.shutdown,
    routeAppShellWorkflowEnvelope: shell.commands.routeWorkflowEnvelope,
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
    status,
    async dispose() {
      await shell.dispose()
    }
  }
}
