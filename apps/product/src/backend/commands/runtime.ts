import type {
  AppExtensionCommandExecutionRequest,
  AppExtensionCommandExecutor,
  AppExtensionCommandPreviewResult,
  AppExtensionCatalogSource
} from "@wanex/extension"
import type {
  BackendAgentContextCommands,
  BackendConversationCommands,
  BackendDiagnosticsCommands,
  BackendDiagnosticsDetailCommands,
  BackendLifecycleCommands,
  BackendOverviewCommands,
  BackendReadModelCommands,
  BackendStatus,
  BackendWorkbenchCommands
} from "../model/index.js"

export interface CreateBackendCommandRegistryOptions {
  readonly commands: BackendCommandRegistryRuntimeCommands
  readonly extensionCatalog?: AppExtensionCatalogSource
  readonly extensionCommandExecutor?: BackendExtensionCommandExecutor
  status(): BackendStatus
}

export type BackendExtensionCommandExecutor = AppExtensionCommandExecutor
export type BackendExtensionCommandExecutionRequest =
  AppExtensionCommandExecutionRequest
export type BackendExtensionCommandPreviewResult =
  AppExtensionCommandPreviewResult

export interface BackendCommandRegistryRuntimeCommands
  extends Pick<
      BackendConversationCommands,
      "submitConversationOperation"
    >,
    BackendAgentContextCommands,
    BackendDiagnosticsCommands,
    BackendDiagnosticsDetailCommands,
    BackendLifecycleCommands,
    BackendOverviewCommands,
    BackendWorkbenchCommands,
    Pick<
      BackendReadModelCommands,
      | "readRecentSessions"
      | "readSessionInputProvenance"
      | "readSessionTranscript"
    > {}
