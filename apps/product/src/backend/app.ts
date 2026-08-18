import { createWanexApp } from "@wanex/app";
import { readBackendCapabilities } from "./readiness.js";
import { readBackendDiagnosticsDetail } from "./read-model/diagnostics.js";
import {
  routeBackendInput,
  routeBackendWorkflowEnvelope,
} from "./router/index.js";
import { readBackendOverview } from "./read-model/overview.js";
import { readBackendWorkbench } from "./read-model/workbench.js";
import { createBackendCommandRegistry } from "./commands/registry.js";
import { runBackendSafeCommand } from "./result.js";
import type {
  BackendApp,
  BackendAppOptions,
  BackendInputRouterCommands,
  BackendStatus,
} from "./model/index.js";

export async function createBackendApp(
  options: BackendAppOptions,
): Promise<BackendApp> {
  const app = await createWanexApp(options);

  const status = (): BackendStatus => app.status();
  const commandRegistry = createBackendCommandRegistry({
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
      shutdown: app.commands.shutdown,
    },
    ...(options.extensions?.source === undefined
      ? {}
      : { extensionCatalog: options.extensions.source }),
    ...(options.productCommands?.extensionExecutor === undefined
      ? {}
      : {
          extensionCommandExecutor: options.productCommands.extensionExecutor,
        }),
    status,
  });

  const routerCommands: BackendInputRouterCommands = {
    submitConversationOperation: app.commands.submitConversationOperation,
    readConversationOperation: app.commands.readConversationOperation,
    cancelConversationOperation: app.commands.cancelConversationOperation,
    listConversationOperationApprovals:
      app.commands.listConversationOperationApprovals,
    readConversationOperationApproval:
      app.commands.readConversationOperationApproval,
    resolveConversationOperationApproval:
      app.commands.resolveConversationOperationApproval,
    resolveConversationOperationRecovery:
      app.commands.resolveConversationOperationRecovery,
    setAgentContextProfile: app.commands.setAgentContextProfile,
    refreshAgentContextProfile: app.commands.refreshAgentContextProfile,
    startAgentContextMonitor: app.commands.startAgentContextMonitor,
    stopAgentContextMonitor: app.commands.stopAgentContextMonitor,
    readDiagnostics: app.commands.readDiagnostics,
    buildSupportBundle: app.commands.buildSupportBundle,
    readRecentSessions: app.commands.readRecentSessions,
    readSession: app.commands.readSession,
    renameSession: app.commands.renameSession,
    archiveSession: app.commands.archiveSession,
    restoreSession: app.commands.restoreSession,
    readSessionInputProvenance: app.commands.readSessionInputProvenance,
    readSessionTranscript: app.commands.readSessionTranscript,
    ingestResource: app.commands.ingestResource,
    readResource: app.commands.readResource,
    readResourceContent: app.commands.readResourceContent,
    readExecutionReference: app.commands.readExecutionReference,
    async readProductWorkbench(request) {
      return await readBackendWorkbench(routerCommands, request);
    },
    readExtensionContributions: app.commands.readExtensionContributions,
    readProductCapabilities: () =>
      readBackendCapabilities(status(), {
        extensionCommandExecutorConfigured:
          options.productCommands?.extensionExecutor !== undefined,
      }),
    async readProductOverview(options) {
      return await readBackendOverview(
        {
          status,
          readProductCapabilities: routerCommands.readProductCapabilities,
          readProductCommands: routerCommands.readProductCommands,
          readDiagnostics: routerCommands.readDiagnostics,
          readRecentSessions: routerCommands.readRecentSessions,
        },
        options,
      );
    },
    async readProductDiagnosticsDetail(options) {
      return await readBackendDiagnosticsDetail(
        {
          readDiagnostics: routerCommands.readDiagnostics,
        },
        options,
      );
    },
    readProductCommands: commandRegistry.readProductCommands,
    explainProductCommandContribution:
      commandRegistry.explainProductCommandContribution,
    previewProductCommandInvocation:
      commandRegistry.previewProductCommandInvocation,
    executeProductCommand: commandRegistry.executeProductCommand,
    readActiveModelEndpoint: app.commands.readActiveModelEndpoint,
    setActiveModelEndpoint: app.commands.setActiveModelEndpoint,
    upsertModelEndpoint: app.commands.upsertModelEndpoint,
    replaceConnectedModelEndpoints: app.commands.replaceConnectedModelEndpoints,
    removeModelEndpointConnection: app.commands.removeModelEndpointConnection,
    upsertSiblingModelEndpoint: app.commands.upsertSiblingModelEndpoint,
    readModelEndpoint: app.commands.readModelEndpoint,
    listModelEndpoints: app.commands.listModelEndpoints,
    listModelCapabilityRoutes: app.commands.listModelCapabilityRoutes,
    setModelCapabilityRoute: app.commands.setModelCapabilityRoute,
    clearModelCapabilityRoute: app.commands.clearModelCapabilityRoute,
    readModelCapabilityReadiness: app.commands.readModelCapabilityReadiness,
    shutdown: app.commands.shutdown,
    queueGuidedFollowUp: app.commands.queueGuidedFollowUp,
    steerConversationOperation: app.commands.steerConversationOperation,
    askSideQuery: app.commands.askSideQuery,
    startGoal: app.commands.startGoal,
    readGoal: app.commands.readGoal,
    listGoals: app.commands.listGoals,
    pauseGoal: app.commands.pauseGoal,
    resumeGoal: app.commands.resumeGoal,
    cancelGoal: app.commands.cancelGoal,
    generatePlanProposal: app.commands.generatePlanProposal,
    revisePlanProposal: app.commands.revisePlanProposal,
    approvePlanProposal: app.commands.approvePlanProposal,
    rejectPlanProposal: app.commands.rejectPlanProposal,
    withdrawPlanProposal: app.commands.withdrawPlanProposal,
    executePlanProposal: app.commands.executePlanProposal,
    readPlanProposal: app.commands.readPlanProposal,
    listPlanProposals: app.commands.listPlanProposals,
    readPlanProposalHistory: app.commands.readPlanProposalHistory,
    routeAppWorkflowEnvelope: app.commands.routeWorkflowEnvelope,
    async routeInput(request) {
      return await routeBackendInput(
        { commands: routerCommands, status },
        request,
      );
    },
    async routeWorkflowEnvelope(request) {
      return await routeBackendWorkflowEnvelope(
        { commands: routerCommands, status },
        request,
      );
    },
    async safeCommand(request) {
      return await runBackendSafeCommand(request);
    },
  };

  return {
    commands: routerCommands,
    events: app.events,
    trustedExecution: app.trustedExecution,
    status,
    async dispose() {
      await app.dispose();
    },
  };
}
