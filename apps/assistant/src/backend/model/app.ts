import type {
  WanexApp,
  WanexAppAgentContextCommands,
  WanexAppAgentContextMonitorStatus,
  WanexAppAgentContextProfileReloadResult,
  WanexAppAgentContextProfileSetResult,
  WanexAppAgentContextStatus,
  WanexAppAgentContextSummary,
  WanexAppDiagnosticsOptions,
  WanexAppExtensionStatus,
  WanexAppEvents,
  WanexAppGoalCommands,
  WanexAppOptions,
  WanexAppModelEndpointCommands,
  WanexAppModelEndpointListReadModel,
  WanexAppModelEndpointReadModel,
  WanexAppModelCapabilityCommands,
  WanexAppSessionLifecycleCommands,
  WanexAppShutdownResult,
  WanexAppSupportBundleOptions,
} from "@wanex/app";
import type {
  AppDiagnosticsSnapshot,
  SupportBundle,
} from "@wanex/app/diagnostics";
import type { BackendCapabilityCommands } from "./capability.js";
import type { BackendConversationCommands } from "./conversation.js";
import type { BackendCommandRegistryCommands } from "./command-registry.js";
import type { BackendExtensionCommandExecutor } from "../commands/runtime.js";
import type { BackendDiagnosticsDetailCommands } from "./diagnostics.js";
import type { BackendInputCommands } from "./input-router.js";
import type { BackendOverviewCommands } from "./overview.js";
import type { BackendWorkbenchCommands } from "./workbench.js";
import type { BackendReadModelCommands } from "./read-model.js";
import type { BackendResourceCommands } from "./resources.js";
import type { BackendResultEnvelopeCommands } from "./command-port.js";
import type { BackendPlanCommands } from "./plan.js";

export interface BackendAppOptions extends WanexAppOptions {
  readonly assistantCommands?: {
    readonly extensionExecutor?: BackendExtensionCommandExecutor;
  };
}

export interface BackendApp {
  readonly commands: BackendCommands;
  readonly events: WanexAppEvents;
  readonly trustedExecution: WanexApp["trustedExecution"];
  status(): BackendStatus;
  dispose(): Promise<void>;
}

export interface BackendCommands
  extends
    BackendAgentContextCommands,
    BackendCapabilityCommands,
    BackendCommandRegistryCommands,
    BackendDiagnosticsDetailCommands,
    BackendDiagnosticsCommands,
    BackendLifecycleCommands,
    BackendOverviewCommands,
    BackendPlanCommands,
    BackendModelEndpointCommands,
    BackendModelCapabilityCommands,
    BackendSessionLifecycleCommands,
    BackendWorkbenchCommands,
    BackendReadModelCommands,
    BackendResourceCommands,
    BackendResultEnvelopeCommands,
    BackendInputCommands,
    BackendGuidedFollowUpCommands,
    BackendGoalCommands,
    BackendSideQueryCommands,
    BackendConversationCommands {}

export type BackendGuidedFollowUpCommands = Pick<
  WanexApp["commands"],
  "queueGuidedFollowUp"
>;

export type BackendSideQueryCommands = Pick<
  WanexApp["commands"],
  "askSideQuery"
>;

export type BackendGoalCommands = WanexAppGoalCommands;

export interface BackendStatus {
  readonly disposed: boolean;
  readonly started: boolean;
  readonly workerCount: number;
  readonly activeModelEndpointId?: string;
  readonly agentContext: BackendAgentContextStatus;
  readonly agentContextMonitor: BackendAgentContextMonitorStatus;
  readonly extensions: BackendExtensionStatus;
}

export type BackendAgentContextCommands =
  WanexAppAgentContextCommands;
export type BackendAgentContextSummary = WanexAppAgentContextSummary;
export type BackendAgentContextStatus = WanexAppAgentContextStatus;
export type BackendAgentContextProfileReloadResult =
  WanexAppAgentContextProfileReloadResult;
export type BackendAgentContextProfileSetResult =
  WanexAppAgentContextProfileSetResult;
export type BackendAgentContextMonitorOptions = Parameters<
  WanexAppAgentContextCommands["startAgentContextMonitor"]
>[0];
export type BackendAgentContextMonitorStatus =
  WanexAppAgentContextMonitorStatus;
export type BackendExtensionStatus = WanexAppExtensionStatus;
export type BackendModelEndpointCommands =
  WanexAppModelEndpointCommands;
export type BackendModelEndpointReadModel =
  WanexAppModelEndpointReadModel;
export type BackendModelEndpointListReadModel =
  WanexAppModelEndpointListReadModel;
export type BackendModelCapabilityCommands =
  WanexAppModelCapabilityCommands;
export type BackendSessionLifecycleCommands =
  WanexAppSessionLifecycleCommands;

export interface BackendDiagnosticsCommands {
  readDiagnostics(
    options?: BackendDiagnosticsOptions,
  ): Promise<AppDiagnosticsSnapshot>;
  buildSupportBundle(
    options?: BackendSupportBundleOptions,
  ): Promise<SupportBundle>;
}

export type BackendDiagnosticsOptions = WanexAppDiagnosticsOptions;
export type BackendSupportBundleOptions =
  WanexAppSupportBundleOptions;

export type BackendLifecycleCommands = Pick<
  WanexApp["commands"],
  "shutdown"
>;
export type BackendShutdownResult = WanexAppShutdownResult;
