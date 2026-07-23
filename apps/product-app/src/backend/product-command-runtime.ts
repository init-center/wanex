import type {
  AppExtensionCommandExecutionRequest,
  AppExtensionCommandExecutor,
  AppExtensionCommandPreviewResult,
  AppExtensionResolvedSnapshot
} from "@wanex/extension"
import type {
  ProductAppBackendAgentContextCommands,
  ProductAppBackendConversationCommands,
  ProductAppBackendDiagnosticsCommands,
  ProductAppBackendDiagnosticsDetailCommands,
  ProductAppBackendLifecycleCommands,
  ProductAppBackendOverviewCommands,
  ProductAppBackendReadModelCommands,
  ProductAppBackendStatus,
  ProductAppBackendWorkbenchCommands
} from "./types.js"

export interface CreateProductAppBackendCommandRegistryOptions {
  readonly commands: ProductAppBackendCommandRegistryRuntimeCommands
  readonly extensionSnapshot?: AppExtensionResolvedSnapshot
  readonly extensionCommandExecutor?: ProductAppBackendExtensionCommandExecutor
  status(): ProductAppBackendStatus
}

export type ProductAppBackendExtensionCommandExecutor = AppExtensionCommandExecutor
export type ProductAppBackendExtensionCommandExecutionRequest =
  AppExtensionCommandExecutionRequest
export type ProductAppBackendExtensionCommandPreviewResult =
  AppExtensionCommandPreviewResult

export interface ProductAppBackendCommandRegistryRuntimeCommands
  extends Pick<
      ProductAppBackendConversationCommands,
      "submitConversationOperation"
    >,
    ProductAppBackendAgentContextCommands,
    ProductAppBackendDiagnosticsCommands,
    ProductAppBackendDiagnosticsDetailCommands,
    ProductAppBackendLifecycleCommands,
    ProductAppBackendOverviewCommands,
    ProductAppBackendWorkbenchCommands,
    Pick<
      ProductAppBackendReadModelCommands,
      | "readRecentSessions"
      | "readSessionInputProvenance"
      | "readSessionTranscript"
    > {}
