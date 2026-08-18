import { agentStarterContextContractScenario } from "./agent-context-scenarios.js"
import {
  delegationGraphTerminalPolicyScenario,
  delegationGraphProductSmokeScenario,
  teamLeadDelegationDurableScenario
} from "./delegation-scenarios.js"
import {
  distributionColdFootprintPolicyScenario,
  distributionHotPathCapabilityScenario,
  distributionPackagePacklistPolicyScenario
} from "./distribution-scenarios.js"
import { extensionPluginActionProductPathScenario } from "./product/plugin-action-scenario.js"
import { declarativeCommandInputProductScenario } from "./product/declarative-input-scenario.js"
import {
  memoryCompactionDurableProjectionScenario,
  memoryReplayProductPathScenario
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
} from "./product-bootstrap-scenarios.js"
import {
  productCapabilityReadinessScenario,
  backendCommandPortScenario,
  backendJsonMappingScenario
} from "./product-capability-scenarios.js"
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
  localDesktopHostContractScenario,
  localHostContractScenario,
  webSurfaceContractScenario
} from "./product-scenarios.js"
import {
  tuiCliScenario,
  tuiHostMessageTransportScenario,
  tuiLineSessionScenario,
  tuiSurfaceScenario
} from "./tui-scenarios.js"
import { backendBackendShellScenario } from "./product-backend-shell-scenarios.js"
import { backendDiagnosticsDetailScenario } from "./product-backend-diagnostics-scenarios.js"
import { backendIntegrationContractScenario } from "./product-backend-integration-scenarios.js"
import { backendOverviewScenario } from "./product-backend-overview-scenarios.js"
import { backendWorkbenchScenario } from "./product-backend-workbench-scenarios.js"
import { productSmokeMatrixScenario } from "./product-smoke-matrix-scenarios.js"
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
  delegationGraphProductSmokeScenario,
  teamLeadDelegationDurableScenario
} from "./delegation-scenarios.js"
export {
  distributionColdFootprintPolicyScenario,
  distributionHotPathCapabilityScenario,
  distributionPackagePacklistPolicyScenario
} from "./distribution-scenarios.js"
export { extensionPluginActionProductPathScenario } from "./product/plugin-action-scenario.js"
export { declarativeCommandInputProductScenario } from "./product/declarative-input-scenario.js"
export {
  memoryCompactionDurableProjectionScenario,
  memoryReplayProductPathScenario
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
} from "./product-bootstrap-scenarios.js"
export {
  productCapabilityReadinessScenario,
  backendCommandPortScenario,
  backendJsonMappingScenario
} from "./product-capability-scenarios.js"
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
  localDesktopHostContractScenario,
  localHostContractScenario,
  webSurfaceContractScenario
} from "./product-scenarios.js"
export {
  tuiCliScenario,
  tuiHostMessageTransportScenario,
  tuiLineSessionScenario,
  tuiSurfaceScenario
} from "./tui-scenarios.js"
export { backendBackendShellScenario } from "./product-backend-shell-scenarios.js"
export { backendDiagnosticsDetailScenario } from "./product-backend-diagnostics-scenarios.js"
export { backendIntegrationContractScenario } from "./product-backend-integration-scenarios.js"
export { backendOverviewScenario } from "./product-backend-overview-scenarios.js"
export { backendWorkbenchScenario } from "./product-backend-workbench-scenarios.js"
export { productSmokeMatrixScenario } from "./product-smoke-matrix-scenarios.js"
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
    productSmokeMatrixScenario,
    productCapabilityReadinessScenario,
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
    localDesktopHostContractScenario,
    localHostContractScenario,
    tuiSurfaceScenario,
    tuiLineSessionScenario,
    tuiCliScenario,
    tuiHostMessageTransportScenario,
    backendOverviewScenario,
    backendWorkbenchScenario,
    backendDiagnosticsDetailScenario,
    extensionPluginActionProductPathScenario,
    declarativeCommandInputProductScenario,
    memoryCompactionDurableProjectionScenario,
    memoryReplayProductPathScenario,
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
    delegationGraphProductSmokeScenario,
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
