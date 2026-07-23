import { agentStarterContextContractScenario } from "./agent-context-scenarios.js"
import {
  delegationGraphTerminalPolicyScenario,
  delegationGraphProductSmokeScenario,
  delegationRuntimeHostProductScenario
} from "./delegation-scenarios.js"
import {
  distributionColdFootprintPolicyScenario,
  distributionHotPathCapabilityScenario,
  distributionPackagePacklistPolicyScenario
} from "./distribution-scenarios.js"
import { extensionPluginActionProductPathScenario } from "./product-app/plugin-action-scenario.js"
import { declarativeCommandInputProductScenario } from "./product-app/declarative-input-scenario.js"
import {
  memoryCompactionDurableProjectionScenario,
  memoryReplayProductPathScenario
} from "./memory-scenarios.js"
import { mediaGenerationAppPathScenario } from "./media-generation-scenario.js"
import { optionalCapabilityTurnBindingScenario } from "./optional-capability-scenario.js"
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
  productAppBackendCommandPortScenario,
  productAppBackendJsonMappingScenario
} from "./product-capability-scenarios.js"
import {
  productAppHostEndpointContractScenario,
  productAppContractScenario,
  productAppSurfaceClientContractScenario,
  productAppSurfaceContractScenario,
  productAppSurfaceMessageTransportScenario,
  productAppConversationLifecycleScenario,
  productAppFeedbackMatrixScenario,
  productAppLocalDesktopHostContractScenario,
  productAppLocalHostContractScenario,
  productAppWebSurfaceContractScenario
} from "./product-app-scenarios.js"
import {
  productAppTuiCliScenario,
  productAppTuiHostMessageTransportScenario,
  productAppTuiLineSessionScenario,
  productAppTuiSurfaceScenario
} from "./product-app-tui-scenarios.js"
import { productAppBackendBackendShellScenario } from "./product-app-backend-backend-shell-scenarios.js"
import { productAppBackendDiagnosticsDetailScenario } from "./product-app-backend-diagnostics-detail-scenarios.js"
import { productAppBackendIntegrationContractScenario } from "./product-app-backend-integration-contract-scenarios.js"
import { productAppBackendOverviewScenario } from "./product-app-backend-overview-scenarios.js"
import { productAppBackendWorkbenchScenario } from "./product-app-backend-workbench-scenarios.js"
import { productSmokeMatrixScenario } from "./product-smoke-matrix-scenarios.js"
import { remoteStorageControlPlaneIsolationScenario } from "./remote-storage-scenarios.js"
import {
  providerDeepSeekThinkingFidelityScenario,
  resourceTicketExpiryCleanupScenario,
  teamRoundBoundScenario
} from "./resource-provider-team-scenarios.js"
import {
  runtimeHostFailureIsolationScenario,
  runtimeHostRemoteMultiOwnerScenario
} from "./runtime-host-scenarios.js"
import { tuiProductControllerPathScenario } from "./tui-product-scenarios.js"
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
  delegationRuntimeHostProductScenario
} from "./delegation-scenarios.js"
export {
  distributionColdFootprintPolicyScenario,
  distributionHotPathCapabilityScenario,
  distributionPackagePacklistPolicyScenario
} from "./distribution-scenarios.js"
export { extensionPluginActionProductPathScenario } from "./product-app/plugin-action-scenario.js"
export { declarativeCommandInputProductScenario } from "./product-app/declarative-input-scenario.js"
export {
  memoryCompactionDurableProjectionScenario,
  memoryReplayProductPathScenario
} from "./memory-scenarios.js"
export { mediaGenerationAppPathScenario } from "./media-generation-scenario.js"
export { optionalCapabilityTurnBindingScenario } from "./optional-capability-scenario.js"
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
  productAppBackendCommandPortScenario,
  productAppBackendJsonMappingScenario
} from "./product-capability-scenarios.js"
export {
  productAppHostEndpointContractScenario,
  productAppContractScenario,
  productAppSurfaceClientContractScenario,
  productAppSurfaceContractScenario,
  productAppSurfaceMessageTransportScenario,
  productAppConversationLifecycleScenario,
  productAppFeedbackMatrixScenario,
  productAppLocalDesktopHostContractScenario,
  productAppLocalHostContractScenario,
  productAppWebSurfaceContractScenario
} from "./product-app-scenarios.js"
export {
  productAppTuiCliScenario,
  productAppTuiHostMessageTransportScenario,
  productAppTuiLineSessionScenario,
  productAppTuiSurfaceScenario
} from "./product-app-tui-scenarios.js"
export { productAppBackendBackendShellScenario } from "./product-app-backend-backend-shell-scenarios.js"
export { productAppBackendDiagnosticsDetailScenario } from "./product-app-backend-diagnostics-detail-scenarios.js"
export { productAppBackendIntegrationContractScenario } from "./product-app-backend-integration-contract-scenarios.js"
export { productAppBackendOverviewScenario } from "./product-app-backend-overview-scenarios.js"
export { productAppBackendWorkbenchScenario } from "./product-app-backend-workbench-scenarios.js"
export { productSmokeMatrixScenario } from "./product-smoke-matrix-scenarios.js"
export { remoteStorageControlPlaneIsolationScenario } from "./remote-storage-scenarios.js"
export {
  providerDeepSeekThinkingFidelityScenario,
  resourceTicketExpiryCleanupScenario,
  teamRoundBoundScenario
} from "./resource-provider-team-scenarios.js"
export {
  runtimeHostFailureIsolationScenario,
  runtimeHostRemoteMultiOwnerScenario
} from "./runtime-host-scenarios.js"
export { tuiProductControllerPathScenario } from "./tui-product-scenarios.js"
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
    productAppBackendCommandPortScenario,
    productAppBackendJsonMappingScenario,
    productAppBackendBackendShellScenario,
    productAppBackendIntegrationContractScenario,
    productAppContractScenario,
    productAppSurfaceContractScenario,
    productAppSurfaceClientContractScenario,
    productAppSurfaceMessageTransportScenario,
    productAppConversationLifecycleScenario,
    productAppHostEndpointContractScenario,
    productAppWebSurfaceContractScenario,
    productAppFeedbackMatrixScenario,
    productAppLocalDesktopHostContractScenario,
    productAppLocalHostContractScenario,
    productAppTuiSurfaceScenario,
    productAppTuiLineSessionScenario,
    productAppTuiCliScenario,
    productAppTuiHostMessageTransportScenario,
    productAppBackendOverviewScenario,
    productAppBackendWorkbenchScenario,
    productAppBackendDiagnosticsDetailScenario,
    extensionPluginActionProductPathScenario,
    declarativeCommandInputProductScenario,
    tuiProductControllerPathScenario,
    memoryCompactionDurableProjectionScenario,
    memoryReplayProductPathScenario,
    mediaGenerationAppPathScenario,
    optionalCapabilityTurnBindingScenario,
    resourceTicketExpiryCleanupScenario,
    workspaceApplyUndoReapplyScenario,
    workspaceControlledToolsScenario,
    workspaceConflictScenario,
    workspaceTaskMultiAgentConflictScenario,
    providerDeepSeekThinkingFidelityScenario,
    teamRoundBoundScenario,
    remoteStorageControlPlaneIsolationScenario,
    runtimeHostRemoteMultiOwnerScenario,
    runtimeHostFailureIsolationScenario,
    delegationRuntimeHostProductScenario,
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
