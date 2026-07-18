import type {
  WanexAppShell,
  WanexAppShellAgentContextCommands,
  WanexAppShellAgentContextMonitorStatus,
  WanexAppShellAgentContextProfileReloadResult,
  WanexAppShellAgentContextProfileSetResult,
  WanexAppShellAgentContextStatus,
  WanexAppShellAgentContextSummary,
  WanexAppShellDiagnosticsOptions,
  WanexAppShellExtensionStatus,
  WanexAppShellOptions,
  WanexAppShellProviderProfileCommands,
  WanexAppShellProviderProfileListReadModel,
  WanexAppShellProviderProfileReadModel,
  WanexAppShellRunAgentTurnRequest,
  WanexAppShellRunAgentTurnResult,
  WanexAppShellShutdownResult,
  WanexAppShellSupportBundleOptions
} from "@wanex/app/backend"
import type {
  AppDiagnosticsSnapshot,
  SupportBundle
} from "@wanex/app/diagnostics"
import type {
  ProductAppBackendCapabilityCommands
} from "./types-capability.js"
import type {
  ProductAppBackendCommandRegistryCommands
} from "./types-command-registry.js"
import type { ProductAppBackendExtensionCommandExecutor } from "./product-command-runtime.js"
import type {
  ProductAppBackendDiagnosticsDetailCommands
} from "./types-diagnostics-detail.js"
import type {
  ProductAppBackendInputCommands
} from "./types-input-router.js"
import type {
  ProductAppBackendOverviewCommands
} from "./types-overview.js"
import type {
  ProductAppBackendWorkbenchCommands
} from "./types-workbench.js"
import type {
  ProductAppBackendReadModelCommands
} from "./types-read-model.js"
import type {
  ProductAppBackendResultEnvelopeCommands
} from "./types-command-port.js"

export interface ProductAppBackendAppOptions extends WanexAppShellOptions {
  readonly productCommands?: {
    readonly extensionExecutor?: ProductAppBackendExtensionCommandExecutor
  }
}

export interface ProductAppBackendApp {
  readonly commands: ProductAppBackendCommands
  status(): ProductAppBackendStatus
  dispose(): Promise<void>
}

export interface ProductAppBackendCommands
  extends ProductAppBackendAgentCommands,
    ProductAppBackendAgentContextCommands,
    ProductAppBackendCapabilityCommands,
    ProductAppBackendCommandRegistryCommands,
    ProductAppBackendDiagnosticsDetailCommands,
    ProductAppBackendDiagnosticsCommands,
    ProductAppBackendLifecycleCommands,
    ProductAppBackendOverviewCommands,
    ProductAppBackendProviderProfileCommands,
    ProductAppBackendWorkbenchCommands,
    ProductAppBackendReadModelCommands,
    ProductAppBackendResultEnvelopeCommands,
    ProductAppBackendInputCommands {}

export interface ProductAppBackendStatus {
  readonly disposed: boolean
  readonly providerProfileId: string
  readonly activeProviderProfileId: string
  readonly agentContext: ProductAppBackendAgentContextStatus
  readonly agentContextMonitor: ProductAppBackendAgentContextMonitorStatus
  readonly extensions: ProductAppBackendExtensionStatus
}

export type ProductAppBackendAgentCommands = Pick<
  WanexAppShell["commands"],
  "runAgentTurn"
>
export type ProductAppBackendRunAgentTurnRequest =
  WanexAppShellRunAgentTurnRequest
export type ProductAppBackendRunAgentTurnResult =
  WanexAppShellRunAgentTurnResult
export type ProductAppBackendAgentContextCommands =
  WanexAppShellAgentContextCommands
export type ProductAppBackendAgentContextSummary =
  WanexAppShellAgentContextSummary
export type ProductAppBackendAgentContextStatus =
  WanexAppShellAgentContextStatus
export type ProductAppBackendAgentContextProfileReloadResult =
  WanexAppShellAgentContextProfileReloadResult
export type ProductAppBackendAgentContextProfileSetResult =
  WanexAppShellAgentContextProfileSetResult
export type ProductAppBackendAgentContextMonitorOptions =
  Parameters<WanexAppShellAgentContextCommands["startAgentContextMonitor"]>[0]
export type ProductAppBackendAgentContextMonitorStatus =
  WanexAppShellAgentContextMonitorStatus
export type ProductAppBackendExtensionStatus = WanexAppShellExtensionStatus
export type ProductAppBackendProviderProfileCommands =
  WanexAppShellProviderProfileCommands
export type ProductAppBackendProviderProfileReadModel =
  WanexAppShellProviderProfileReadModel
export type ProductAppBackendProviderProfileListReadModel =
  WanexAppShellProviderProfileListReadModel

export interface ProductAppBackendDiagnosticsCommands {
  readDiagnostics(
    options?: ProductAppBackendDiagnosticsOptions
  ): Promise<AppDiagnosticsSnapshot>
  buildSupportBundle(
    options?: ProductAppBackendSupportBundleOptions
  ): Promise<SupportBundle>
}

export type ProductAppBackendDiagnosticsOptions =
  WanexAppShellDiagnosticsOptions
export type ProductAppBackendSupportBundleOptions =
  WanexAppShellSupportBundleOptions

export type ProductAppBackendLifecycleCommands = Pick<
  WanexAppShell["commands"],
  "shutdown"
>
export type ProductAppBackendShutdownResult = WanexAppShellShutdownResult
