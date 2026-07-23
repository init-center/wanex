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
  WanexAppOptions,
  WanexAppProviderProfileCommands,
  WanexAppProviderProfileListReadModel,
  WanexAppProviderProfileReadModel,
  WanexAppShutdownResult,
  WanexAppSupportBundleOptions
} from "@wanex/app"
import type {
  AppDiagnosticsSnapshot,
  SupportBundle
} from "@wanex/app/diagnostics"
import type {
  ProductAppBackendCapabilityCommands
} from "./types-capability.js"
import type {
  ProductAppBackendConversationCommands
} from "./types-conversation.js"
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
  ProductAppBackendResourceCommands
} from "./types-resources.js"
import type {
  ProductAppBackendResultEnvelopeCommands
} from "./types-command-port.js"

export interface ProductAppBackendAppOptions extends WanexAppOptions {
  readonly productCommands?: {
    readonly extensionExecutor?: ProductAppBackendExtensionCommandExecutor
  }
}

export interface ProductAppBackendApp {
  readonly commands: ProductAppBackendCommands
  readonly events: WanexAppEvents
  status(): ProductAppBackendStatus
  dispose(): Promise<void>
}

export interface ProductAppBackendCommands
  extends ProductAppBackendAgentContextCommands,
    ProductAppBackendCapabilityCommands,
    ProductAppBackendCommandRegistryCommands,
    ProductAppBackendDiagnosticsDetailCommands,
    ProductAppBackendDiagnosticsCommands,
    ProductAppBackendLifecycleCommands,
    ProductAppBackendOverviewCommands,
    ProductAppBackendProviderProfileCommands,
    ProductAppBackendWorkbenchCommands,
    ProductAppBackendReadModelCommands,
    ProductAppBackendResourceCommands,
    ProductAppBackendResultEnvelopeCommands,
    ProductAppBackendInputCommands,
    ProductAppBackendConversationCommands {}

export interface ProductAppBackendStatus {
  readonly disposed: boolean
  readonly started: boolean
  readonly workerCount: number
  readonly providerProfileId: string
  readonly activeProviderProfileId: string
  readonly agentContext: ProductAppBackendAgentContextStatus
  readonly agentContextMonitor: ProductAppBackendAgentContextMonitorStatus
  readonly extensions: ProductAppBackendExtensionStatus
}

export type ProductAppBackendAgentContextCommands =
  WanexAppAgentContextCommands
export type ProductAppBackendAgentContextSummary =
  WanexAppAgentContextSummary
export type ProductAppBackendAgentContextStatus =
  WanexAppAgentContextStatus
export type ProductAppBackendAgentContextProfileReloadResult =
  WanexAppAgentContextProfileReloadResult
export type ProductAppBackendAgentContextProfileSetResult =
  WanexAppAgentContextProfileSetResult
export type ProductAppBackendAgentContextMonitorOptions =
  Parameters<WanexAppAgentContextCommands["startAgentContextMonitor"]>[0]
export type ProductAppBackendAgentContextMonitorStatus =
  WanexAppAgentContextMonitorStatus
export type ProductAppBackendExtensionStatus = WanexAppExtensionStatus
export type ProductAppBackendProviderProfileCommands =
  WanexAppProviderProfileCommands
export type ProductAppBackendProviderProfileReadModel =
  WanexAppProviderProfileReadModel
export type ProductAppBackendProviderProfileListReadModel =
  WanexAppProviderProfileListReadModel

export interface ProductAppBackendDiagnosticsCommands {
  readDiagnostics(
    options?: ProductAppBackendDiagnosticsOptions
  ): Promise<AppDiagnosticsSnapshot>
  buildSupportBundle(
    options?: ProductAppBackendSupportBundleOptions
  ): Promise<SupportBundle>
}

export type ProductAppBackendDiagnosticsOptions =
  WanexAppDiagnosticsOptions
export type ProductAppBackendSupportBundleOptions =
  WanexAppSupportBundleOptions

export type ProductAppBackendLifecycleCommands = Pick<
  WanexApp["commands"],
  "shutdown"
>
export type ProductAppBackendShutdownResult = WanexAppShutdownResult
