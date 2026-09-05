import type {
  ConversationOperationFoundResult,
  ConversationOperationRejectedResult,
  InitialState,
  ModelEndpointReadModel,
  ModelEndpointCommands,
  ModelEndpointListReadModel,
  ProviderPresetId,
  ProviderSetupInput,
  ProviderReadinessReadModel,
  SelectSessionRequest,
  SetLayoutRequest,
  SetModeRequest,
  SettingsReadModel,
  Shell,
  ShellOptions,
  SurfaceAdapter,
  StandardProviderPresetId,
  StateSnapshot,
  UpdatePreferencesRequest,
} from "@wanex/assistant";
import type { JsonValue } from "@wanex/protocol";
import type {
  ModelEndpoint,
  ModelFeature,
  ModelInputModality,
} from "@wanex/protocol";
import type {
  SecretResolverPort,
  SecretStorePort,
} from "@wanex/runtime/secrets";
import type { StorageHandle } from "@wanex/storage";
import type { AgentContextProfile } from "@wanex/runtime/context";
import type {
  Controller,
  Snapshot,
} from "@wanex/assistant-ui";
import type {
  WebNodeHostServer,
  WebBrowserAssets,
} from "./web-host/types.js";
import type { WebWindowChrome } from "./web-host/window-chrome.js";
import type { LocalAttachmentUploadPort } from "./resources/attachment.js";
import type { LocalResourceDeliveryPort } from "./resources/delivery.js";
import type { LocalPluginCompositionPort } from "./application/plugin.js";
import type { LocalMcpSettingsPort } from "./mcp/settings/model.js";

export type LocalStorageMode = "oneshot" | "persistent";

export type LocalStorageConfig =
  | LocalStoreDirStorageConfig
  | LocalProfileStorageConfig;

export type AssistantHostStorageConfig =
  | LocalStorageConfig
  | InjectedAssistantHostStorageConfig;

export interface InjectedAssistantHostStorageConfig {
  readonly kind: "injected";
  readonly handle: Pick<StorageHandle, "core" | "transport">;
  readonly credentialNamespace: string;
}

export interface LocalStoreDirStorageConfig {
  readonly kind: "store-dir";
  readonly storeDir: string;
  readonly mode?: LocalStorageMode;
}

export interface LocalProfileStorageConfig {
  readonly kind: "profile";
  readonly rootDir: string;
  readonly profileId?: string;
  readonly mode?: LocalStorageMode;
}

export type LocalModelEndpointOptions = ModelEndpoint;

export interface LocalModelEndpointsOptions {
  readonly endpoints: readonly LocalModelEndpointOptions[];
  readonly activeEndpointId?: string;
}

export interface AssistantWebHostOptions {
  readonly hostname?: string;
  readonly port?: number;
  readonly requestPath?: string;
  readonly maxBodyBytes?: number;
  readonly attachmentPath?: string;
  readonly maxAttachmentBytes?: number;
  readonly resourceDeliveryPreparePath?: string;
  readonly resourceDeliveryPath?: string;
  readonly browserAssets?: WebBrowserAssets;
  readonly windowChrome?: WebWindowChrome;
}

export interface StartAssistantWebAppOptions {
  readonly storage: LocalStorageConfig;
  readonly serviceBin: string;
  readonly modelEndpoints?: LocalModelEndpointsOptions;
  readonly agentContextProfile?: AgentContextProfile;
  readonly secretResolver?: SecretResolverPort;
  /**
   * Trusted-host credential persistence. It is never exposed through Assistant
   * read models, Web snapshots, or a renderer mutation API.
   */
  readonly credentialStore?: SecretStorePort;
  readonly pluginComposition?: LocalPluginCompositionPort;
  readonly initialState?: InitialState;
  readonly web?: AssistantWebHostOptions;
}

/**
 * Trusted host configuration access for product-owned metadata. It does not
 * expose the underlying Storage client or any filesystem location.
 */
export interface LocalConfigurationPort {
  getConfig(key: string): Promise<JsonValue | null>;
  getConfigEntry(key: string): Promise<LocalConfigurationEntry | null>;
  listConfigEntries(
    request: LocalConfigurationListRequest,
  ): Promise<LocalConfigurationEntry[]>;
  compareAndApplyConfigMutations(request: {
    readonly conditions: readonly LocalConfigurationCondition[];
    readonly puts: readonly LocalConfigurationPut[];
    readonly deletes: readonly string[];
  }): Promise<LocalConfigurationMutationResult>;
}

export interface LocalConfigurationEntry {
  readonly key: string;
  readonly value: JsonValue;
  readonly revision: number;
  readonly updatedAt: number;
}

export interface LocalConfigurationListRequest {
  readonly prefix: string;
  readonly afterKey?: string;
  readonly limit?: number;
}

export interface LocalConfigurationCondition {
  readonly key: string;
  readonly expectedRevision: number | null;
}

export interface LocalConfigurationPut {
  readonly key: string;
  readonly value: JsonValue;
}

export type LocalConfigurationMutationResult =
  | LocalConfigurationAppliedResult
  | LocalConfigurationConflictResult;

export interface LocalConfigurationAppliedResult {
  readonly kind: "applied";
  readonly entries: readonly LocalConfigurationEntry[];
}

export interface LocalConfigurationConflictResult {
  readonly kind: "conflict";
  readonly conflicts: readonly LocalConfigurationConflict[];
}

export interface LocalConfigurationConflict {
  readonly key: string;
  readonly expectedRevision: number | null;
  readonly current: LocalConfigurationEntry | null;
}

export interface StartAssistantHostOptions {
  readonly storage: AssistantHostStorageConfig;
  readonly serviceBin?: string;
  readonly modelEndpoint?: LocalModelEndpointOptions;
  readonly modelEndpoints?: LocalModelEndpointsOptions;
  readonly agentContextProfile?: AgentContextProfile;
  readonly secretResolver?: SecretResolverPort;
  /**
   * Trusted-host credential persistence. It is never exposed through Assistant
   * read models, Web snapshots, or a renderer mutation API.
   */
  readonly credentialStore?: SecretStorePort;
  readonly trustedProviderHost?: ShellOptions["trustedProviderHost"];
  readonly pluginComposition?: LocalPluginCompositionPort;
  readonly initialState?: InitialState;
}

export interface AssistantHost {
  readonly shell: Shell;
  readonly surface: SurfaceAdapter;
  readonly teamConversations: Shell["teamConversations"];
  readonly schedules: Shell["schedules"];
  readonly modelEndpoints: ModelEndpointCommands;
  /** Trusted composition capability; never project into a Renderer or remote contract. */
  readonly secretResolver: SecretResolverPort;
  readonly mcpSettings: LocalMcpSettingsPort;
  readonly attachments: LocalAttachmentUploadPort;
  readonly resourceDeliveries: LocalResourceDeliveryPort;
  close(): Promise<void>;
}

export interface AssistantWebApp {
  readonly shell: Shell;
  readonly teamConversations: Shell["teamConversations"];
  readonly modelEndpoints: ModelEndpointCommands;
  readonly mcpSettings: LocalMcpSettingsPort;
  readonly providers: LocalProviderCommands;
  readonly modelCatalog: LocalModelCatalogCommands;
  readonly capabilitySetup: LocalCapabilitySetupCommands;
  readonly settings: LocalSettingsCommands;
  /** Trusted-host resolver for other local application domains. */
  readonly secretResolver: SecretResolverPort;
  readonly configuration: LocalConfigurationPort;
  readonly attachments: LocalAttachmentUploadPort;
  readonly resourceDeliveries: LocalResourceDeliveryPort;
  readonly controller: Controller;
  readonly host: WebNodeHostServer;
  readonly url: string;
  readSnapshot(): Promise<AssistantHostSnapshot>;
  close(): Promise<void>;
}

export interface LocalModelCatalogRefreshSuccess {
  readonly kind: "assistant-host.model-catalog.refreshed";
  readonly revision: string;
  readonly providerCount: number;
  readonly modelCount: number;
}

export interface LocalModelCatalogRefreshFailure {
  readonly kind: "assistant-host.model-catalog.refresh-failed";
  readonly code:
    | "timeout"
    | "transport_failed"
    | "unexpected_status"
    | "response_too_large"
    | "malformed_catalog"
    | "persistence_failed";
  readonly message: string;
}

export type LocalModelCatalogRefreshResult =
  | LocalModelCatalogRefreshSuccess
  | LocalModelCatalogRefreshFailure;

export interface LocalModelCatalogCommands {
  readConversationModelSuggestions(): LocalConversationModelSuggestions;
  refresh(): Promise<LocalModelCatalogRefreshResult>;
}

export interface LocalConversationModelSuggestions {
  readonly kind: "assistant-host.conversation-model-suggestions";
  readonly providers: Readonly<
    Record<StandardProviderPresetId, readonly string[]>
  >;
}

export interface AssistantHostSnapshot {
  readonly kind: "assistant-host.snapshot";
  readonly url: string;
  readonly settings: SettingsReadModel;
  readonly modelEndpoints: ModelEndpointListReadModel;
  readonly web: Snapshot;
  readonly privacy: AssistantHostSnapshotPrivacy;
}

export interface AssistantHostSnapshotPrivacy {
  readonly exposesStorePath: false;
  readonly exposesServiceBinaryPath: false;
  readonly exposesSecrets: false;
  readonly exposesRawStorageClient: false;
  readonly exposesRendererMutationApi: false;
}

export interface LocalSettingsCommands {
  readSettings(): SettingsReadModel;
  selectSession(
    request: SelectSessionRequest,
  ): Promise<StateSnapshot>;
  setLayout(
    request: SetLayoutRequest,
  ): Promise<StateSnapshot>;
  setMode(request: SetModeRequest): Promise<StateSnapshot>;
  updatePreferences(
    request: UpdatePreferencesRequest,
  ): Promise<StateSnapshot>;
}

export interface LocalProviderCommands {
  listProviders(): Promise<LocalConfiguredProviderListReadModel>;
  saveProvider(
    request: ProviderSetupInput,
  ): Promise<LocalSaveProviderResult>;
  removeProvider(
    request: LocalRemoveProviderRequest,
  ): Promise<LocalRemoveProviderResult>;
}

export interface LocalConfigureImageGenerationCapabilityRequest {
  readonly imageGenerationModelId: string;
}

export interface LocalConfigureImageGenerationCapabilityResult {
  readonly kind: "assistant-host.image-generation-capability.configured";
  readonly endpoint: ModelEndpointReadModel;
  readonly readiness: Awaited<
    ReturnType<
      Shell["modelCapabilities"]["readModelCapabilityReadiness"]
    >
  >;
}

export interface LocalCapabilitySetupCommands {
  setupImageGenerationAndContinue(
    request: LocalSetupImageGenerationAndContinueRequest,
  ): Promise<LocalSetupImageGenerationAndContinueResult>;
}

export interface LocalSetupImageGenerationAndContinueRequest {
  readonly operationId: string;
  readonly sessionId: string;
  readonly operation: "image.generate";
  readonly imageGenerationModelId: string;
}

export type LocalSetupImageGenerationAndContinueResult =
  | {
      readonly kind: "assistant-host.capability-setup.continued";
      readonly setup: LocalConfigureImageGenerationCapabilityResult;
      readonly operation: ConversationOperationFoundResult;
    }
  | {
      readonly kind: "assistant-host.capability-setup.rejected";
      readonly reason:
        | "operation_not_current"
        | "capability_request_not_found"
        | "capability_setup_failed"
        | "continuation_rejected";
      readonly message: string;
      readonly operation?: ConversationOperationRejectedResult;
    };

export interface LocalConfiguredProviderEndpointReadModel {
  readonly id: string;
  readonly protocol: ModelEndpointReadModel["protocol"];
  readonly model: ModelEndpointReadModel["model"];
  readonly active: boolean;
}

export interface LocalConfiguredProviderReadModel {
  readonly connectionId: string;
  readonly providerId: string;
  readonly presetId?: ProviderPresetId;
  readonly baseUrl?: string;
  readonly credentialConfigured: boolean;
  readonly active: boolean;
  readonly endpoints: readonly LocalConfiguredProviderEndpointReadModel[];
}

export interface LocalConfiguredProviderListReadModel {
  readonly kind: "assistant-host.configured-provider-list";
  readonly providers: readonly LocalConfiguredProviderReadModel[];
}

export interface LocalSaveProviderResult {
  readonly kind: "assistant-host.provider.saved";
  readonly provider: LocalConfiguredProviderReadModel;
  readonly readiness: ProviderReadinessReadModel;
  readonly credentialCleanupPending: boolean;
}

export interface LocalRemoveProviderRequest {
  readonly connectionId: string;
}

export interface LocalRemoveProviderResult {
  readonly kind: "assistant-host.provider.removed";
  readonly connectionId: string;
  readonly removedEndpointIds: readonly string[];
  readonly readiness: ProviderReadinessReadModel;
  readonly credentialCleanupPending: boolean;
}
