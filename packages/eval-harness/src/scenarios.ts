import { agentStarterContextContractScenario } from "./agent-context-scenarios.js"
import {
  delegationGraphTerminalPolicyScenario,
  delegationGraphAssistantSmokeScenario,
  teamLeadDelegationDurableScenario
} from "./delegation-scenarios.js"
import {
  distributionColdFootprintPolicyScenario,
  distributionHotPathCapabilityScenario,
  distributionPackagePacklistPolicyScenario
} from "./distribution-scenarios.js"
import { extensionPluginActionAssistantPathScenario } from "./assistant/plugin-action-scenario.js"
import { declarativeCommandInputAssistantScenario } from "./assistant/declarative-input-scenario.js"
import {
  memoryCompactionDurableProjectionScenario,
  memoryReplayAssistantPathScenario
} from "./memory-scenarios.js"
import {
  imageGenerationConversationScenario,
  mediaGenerationAppPathScenario
} from "./media-generation-scenario.js"
import { optionalCapabilityTurnBindingScenario } from "./optional-capability-scenario.js"
import { durableToolApprovalScenario } from "./tool-approval-scenario.js"
import {
  cliDiagnosticsOperationalScenario,
  cliMemorySweepOperationalScenario,
  supportBundleOperationalScenario
} from "./operational-scenarios.js"
import {
  agentSideQueryContractScenario,
  agentStarterContractScenario,
  appDefaultEntryContractScenario,
  bootstrapLocalRuntimeOperationalScenario,
  cliSupportBundleOperationalScenario
} from "./assistant-bootstrap-scenarios.js"
import {
  assistantCapabilityReadinessScenario,
  backendCommandPortScenario,
  backendJsonMappingScenario
} from "./assistant-capability-scenarios.js"
import {
  hostEndpointContractScenario,
  contractScenario,
  surfaceClientContractScenario,
  surfaceContractScenario,
  surfaceMessageTransportScenario,
  conversationLifecycleScenario,
  recoveryReviewScenario,
  toolApprovalJourneyScenario,
  guidedFollowUpScenario,
  sameTurnSteeringScenario,
  sideQueryScenario,
  planJourneyScenario,
  goalJourneyScenario,
  capabilitySetupContinuationScenario,
  longSessionContinuityScenario,
  feedbackMatrixScenario,
  assistantDesktopHostContractScenario,
  assistantHostContractScenario,
  webSurfaceContractScenario
} from "./assistant-scenarios.js"
import {
  tuiCliScenario,
  tuiHostMessageTransportScenario,
  tuiLineSessionScenario,
  tuiSurfaceScenario
} from "./tui-scenarios.js"
import { backendBackendShellScenario } from "./assistant-backend-shell-scenarios.js"
import { backendDiagnosticsDetailScenario } from "./assistant-backend-diagnostics-scenarios.js"
import { backendIntegrationContractScenario } from "./assistant-backend-integration-scenarios.js"
import { backendOverviewScenario } from "./assistant-backend-overview-scenarios.js"
import { backendWorkbenchScenario } from "./assistant-backend-workbench-scenarios.js"
import { assistantSmokeMatrixScenario } from "./assistant-smoke-matrix-scenarios.js"
import { remoteStorageControlPlaneIsolationScenario } from "./remote-storage-scenarios.js"
import {
  providerDeepSeekThinkingFidelityScenario,
  resourceTicketExpiryCleanupScenario
} from "./resource-provider-team-scenarios.js"
import {
  runtimeHostFailureIsolationScenario,
  runtimeHostRemoteMultiOwnerScenario
} from "./runtime-host-scenarios.js"
import type { EvalScenario } from "./types.js"
import {
  workspaceApplyUndoReapplyScenario,
  workspaceControlledToolsScenario,
  workspaceConflictScenario,
  workspaceTaskMultiAgentConflictScenario
} from "./workspace-scenarios.js"

export { agentStarterContextContractScenario } from "./agent-context-scenarios.js"
export {
  delegationGraphTerminalPolicyScenario,
  delegationGraphAssistantSmokeScenario,
  teamLeadDelegationDurableScenario
} from "./delegation-scenarios.js"
export {
  distributionColdFootprintPolicyScenario,
  distributionHotPathCapabilityScenario,
  distributionPackagePacklistPolicyScenario
} from "./distribution-scenarios.js"
export { extensionPluginActionAssistantPathScenario } from "./assistant/plugin-action-scenario.js"
export { declarativeCommandInputAssistantScenario } from "./assistant/declarative-input-scenario.js"
export {
  memoryCompactionDurableProjectionScenario,
  memoryReplayAssistantPathScenario
} from "./memory-scenarios.js"
export {
  imageGenerationConversationScenario,
  mediaGenerationAppPathScenario
} from "./media-generation-scenario.js"
export { optionalCapabilityTurnBindingScenario } from "./optional-capability-scenario.js"
export { durableToolApprovalScenario } from "./tool-approval-scenario.js"
export {
  cliDiagnosticsOperationalScenario,
  cliMemorySweepOperationalScenario,
  supportBundleOperationalScenario
} from "./operational-scenarios.js"
export {
  agentSideQueryContractScenario,
  agentStarterContractScenario,
  appDefaultEntryContractScenario,
  bootstrapLocalRuntimeOperationalScenario,
  cliSupportBundleOperationalScenario
} from "./assistant-bootstrap-scenarios.js"
export {
  assistantCapabilityReadinessScenario,
  backendCommandPortScenario,
  backendJsonMappingScenario
} from "./assistant-capability-scenarios.js"
export {
  hostEndpointContractScenario,
  contractScenario,
  surfaceClientContractScenario,
  surfaceContractScenario,
  surfaceMessageTransportScenario,
  conversationLifecycleScenario,
  recoveryReviewScenario,
  guidedFollowUpScenario,
  sameTurnSteeringScenario,
  sideQueryScenario,
  planJourneyScenario,
  goalJourneyScenario,
  capabilitySetupContinuationScenario,
  longSessionContinuityScenario,
  feedbackMatrixScenario,
  assistantDesktopHostContractScenario,
  assistantHostContractScenario,
  webSurfaceContractScenario
} from "./assistant-scenarios.js"
export {
  tuiCliScenario,
  tuiHostMessageTransportScenario,
  tuiLineSessionScenario,
  tuiSurfaceScenario
} from "./tui-scenarios.js"
export { backendBackendShellScenario } from "./assistant-backend-shell-scenarios.js"
export { backendDiagnosticsDetailScenario } from "./assistant-backend-diagnostics-scenarios.js"
export { backendIntegrationContractScenario } from "./assistant-backend-integration-scenarios.js"
export { backendOverviewScenario } from "./assistant-backend-overview-scenarios.js"
export { backendWorkbenchScenario } from "./assistant-backend-workbench-scenarios.js"
export { assistantSmokeMatrixScenario } from "./assistant-smoke-matrix-scenarios.js"
export { remoteStorageControlPlaneIsolationScenario } from "./remote-storage-scenarios.js"
export {
  providerDeepSeekThinkingFidelityScenario,
  resourceTicketExpiryCleanupScenario
} from "./resource-provider-team-scenarios.js"
export {
  runtimeHostFailureIsolationScenario,
  runtimeHostRemoteMultiOwnerScenario
} from "./runtime-host-scenarios.js"
export {
  workspaceApplyUndoReapplyScenario,
  workspaceControlledToolsScenario,
  workspaceConflictScenario,
  workspaceTaskMultiAgentConflictScenario
} from "./workspace-scenarios.js"

export function createWanexRegressionScenarios(): readonly EvalScenario[] {
  return [
    assistantSmokeMatrixScenario,
    assistantCapabilityReadinessScenario,
    backendCommandPortScenario,
    backendJsonMappingScenario,
    backendBackendShellScenario,
    backendIntegrationContractScenario,
    contractScenario,
    surfaceContractScenario,
    surfaceClientContractScenario,
    surfaceMessageTransportScenario,
    conversationLifecycleScenario,
    recoveryReviewScenario,
    toolApprovalJourneyScenario,
    guidedFollowUpScenario,
    sameTurnSteeringScenario,
    sideQueryScenario,
    planJourneyScenario,
    goalJourneyScenario,
    capabilitySetupContinuationScenario,
    longSessionContinuityScenario,
    hostEndpointContractScenario,
    webSurfaceContractScenario,
    feedbackMatrixScenario,
    assistantDesktopHostContractScenario,
    assistantHostContractScenario,
    tuiSurfaceScenario,
    tuiLineSessionScenario,
    tuiCliScenario,
    tuiHostMessageTransportScenario,
    backendOverviewScenario,
    backendWorkbenchScenario,
    backendDiagnosticsDetailScenario,
    extensionPluginActionAssistantPathScenario,
    declarativeCommandInputAssistantScenario,
    memoryCompactionDurableProjectionScenario,
    memoryReplayAssistantPathScenario,
    mediaGenerationAppPathScenario,
    imageGenerationConversationScenario,
    optionalCapabilityTurnBindingScenario,
    durableToolApprovalScenario,
    resourceTicketExpiryCleanupScenario,
    workspaceApplyUndoReapplyScenario,
    workspaceControlledToolsScenario,
    workspaceConflictScenario,
    workspaceTaskMultiAgentConflictScenario,
    providerDeepSeekThinkingFidelityScenario,
    remoteStorageControlPlaneIsolationScenario,
    runtimeHostRemoteMultiOwnerScenario,
    runtimeHostFailureIsolationScenario,
    teamLeadDelegationDurableScenario,
    delegationGraphAssistantSmokeScenario,
    delegationGraphTerminalPolicyScenario,
    appDefaultEntryContractScenario,
    bootstrapLocalRuntimeOperationalScenario,
    agentStarterContractScenario,
    agentStarterContextContractScenario,
    agentSideQueryContractScenario,
    distributionColdFootprintPolicyScenario,
    distributionPackagePacklistPolicyScenario,
    distributionHotPathCapabilityScenario,
    cliMemorySweepOperationalScenario,
    cliDiagnosticsOperationalScenario,
    cliSupportBundleOperationalScenario,
    supportBundleOperationalScenario
  ]
}
