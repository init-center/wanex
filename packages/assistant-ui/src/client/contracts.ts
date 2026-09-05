import type {
  Action,
  ActionResult,
  Snapshot,
} from "../application/model.js";
import type {
  AttachmentDraft,
  ConversationAttachmentsReadModel,
} from "@wanex/assistant";

export interface AttachmentUploadRequest {
  readonly content: Uint8Array;
  readonly mediaType: string;
  readonly label?: string;
  readonly sessionId?: string;
  readonly kind?: "file" | "image" | "video" | "audio" | "document";
}

export interface AttachmentUploadResult {
  readonly kind: "web.attachment-uploaded";
  readonly attachment: AttachmentDraft;
  readonly attachments: ConversationAttachmentsReadModel;
  readonly snapshot: Snapshot;
}

export type ProviderPresetId =
  | "openai"
  | "anthropic"
  | "deepseek"
  | "openai-compatible";

export interface ProviderEndpoint {
  readonly id: string;
  readonly protocol: { readonly id: string };
  readonly model: {
    readonly id: string;
    readonly operations: readonly string[];
    readonly inputModalities: readonly string[];
    readonly outputModalities: readonly string[];
    readonly features: readonly string[];
  };
  readonly active: boolean;
}

export interface Provider {
  readonly connectionId: string;
  readonly providerId: string;
  readonly presetId?: ProviderPresetId;
  readonly baseUrl?: string;
  readonly credentialConfigured: boolean;
  readonly active: boolean;
  readonly endpoints: readonly ProviderEndpoint[];
}

export interface ProviderList {
  readonly kind: "assistant-host.configured-provider-list";
  readonly providers: readonly Provider[];
}

export interface SaveProviderRequest {
  readonly connectionId?: string;
  readonly presetId: ProviderPresetId;
  readonly conversationModelId: string;
  readonly conversationInputModalities?: readonly ("text" | "image")[];
  readonly conversationFeatures?: readonly "tool_calling"[];
  readonly imageGenerationModelId?: string;
  readonly baseUrl?: string;
  readonly credential?: string;
  readonly makeConversationActive?: boolean;
}

export interface ProviderMutationResult {
  readonly kind: "web.provider-mutated";
  readonly providers: ProviderList;
  readonly snapshot: Snapshot;
}

export interface ModelCatalogRefreshResult {
  readonly kind: "web.model-catalog-refreshed";
  readonly revision: string;
  readonly providerCount: number;
  readonly modelCount: number;
  readonly suggestions: Readonly<Record<string, readonly string[]>>;
}

export interface CapabilitySetupResult {
  readonly kind: "web.capability-setup";
  readonly snapshot: Snapshot;
}

export type McpTransportKind = "stdio" | "streamable_http";

export interface McpServer {
  readonly serverId?: string;
  readonly label?: string;
  readonly enabled?: boolean;
  readonly transport?: McpTransportKind;
  readonly configurationState: "valid" | "invalid" | "rejected" | "absent";
  readonly configurationFailure?: string;
  readonly runtimeState:
    | "ready"
    | "degraded"
    | "failed"
    | "stopped"
    | "absent";
  readonly toolCount: number;
  readonly revision?: number;
  readonly credentialState?: "not_required" | "configured" | "unavailable";
  readonly runtimeFailure?: string;
}

export interface McpServerList {
  readonly kind: "assistant-host.mcp-servers";
  readonly servers: readonly McpServer[];
}

export interface McpValueInput {
  readonly kind: "credential";
  readonly setupId: string;
}

export interface McpNamedValueInput {
  readonly name: string;
  readonly source: McpValueInput;
}

export type McpTransportInput =
  | {
      readonly kind: "stdio";
      readonly command: string;
      readonly args: readonly string[];
      readonly cwd: string;
      readonly environment: readonly McpNamedValueInput[];
      readonly maxBufferBytes?: number;
    }
  | {
      readonly kind: "streamable_http";
      readonly url: string;
      readonly headers: readonly McpNamedValueInput[];
    };

export interface McpSaveServerRequest {
  readonly serverId: string;
  readonly expectedRevision: number | null;
  readonly label: string;
  readonly enabled: boolean;
  readonly connectTimeoutMs: number;
  readonly requestTimeoutMs: number;
  readonly transport: McpTransportInput;
}

export interface McpCredentialSetupResult {
  readonly kind: "assistant-host.mcp-credential-setup";
  readonly setupId: string;
  readonly expiresAt: number;
}

export interface McpSettingsResultBase {
  readonly reloadOutcome: "unchanged" | "published" | "rejected" | "failed";
  readonly servers: McpServerList;
}

export type McpServerMutationResult =
  | (McpSettingsResultBase & {
      readonly kind: "applied";
      readonly serverId: string;
      readonly enabled?: boolean;
      readonly credentialCleanupPending?: boolean;
    })
  | (McpSettingsResultBase & {
      readonly kind: "conflict";
      readonly serverId: string;
      readonly expectedRevision: number | null;
      readonly currentRevision: number | null;
      readonly credentialCleanupPending?: boolean;
    });

export interface McpSettingsClient {
  listServers(): Promise<McpServerList>;
  stageCredential(request: {
    readonly serverId: string;
    readonly transport: McpTransportKind;
    readonly name: string;
    readonly value: string;
  }): Promise<McpCredentialSetupResult>;
  saveServer(request: McpSaveServerRequest): Promise<McpServerMutationResult>;
  updateServer(request: {
    readonly serverId: string;
    readonly expectedRevision: number;
    readonly label: string;
  }): Promise<McpServerMutationResult>;
  setServerEnabled(request: {
    readonly serverId: string;
    readonly enabled: boolean;
    readonly expectedRevision: number;
  }): Promise<McpServerMutationResult>;
  removeServer(request: {
    readonly serverId: string;
    readonly expectedRevision: number;
  }): Promise<McpServerMutationResult>;
  reloadServers(request?: {
    readonly force?: boolean;
  }): Promise<McpSettingsResultBase>;
}

export interface PreparedResourceDelivery {
  readonly kind: "web.resource-delivery";
  readonly url: string;
  readonly resourceId: string;
  readonly sha256: string;
  readonly resourceKind: "image" | "video" | "audio";
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly purpose: "preview" | "media";
  readonly sessionId?: string;
  readonly expiresAt: number;
}

export type ClientEvent =
  | {
      readonly kind: "snapshot-invalidated";
      readonly operationId?: string;
      readonly sessionId?: string;
    }
  | {
      readonly kind: "assistant-text-delta";
      readonly operationId: string;
      readonly sessionId: string;
      readonly text: string;
      readonly sequence?: number;
    }
  | { readonly kind: "stream-unavailable" };

export interface Client {
  readSnapshot(): Promise<Snapshot>;
  dispatchAction(
    action: Action,
    options?: { readonly requestId?: string },
  ): Promise<ActionResult>;
  uploadAttachment?(
    request: AttachmentUploadRequest,
  ): Promise<AttachmentUploadResult>;
  prepareResourceDelivery?(request: {
    readonly resourceId: string;
    readonly sha256: string;
    readonly purpose: "preview" | "media";
    readonly sessionId?: string;
  }): Promise<PreparedResourceDelivery>;
  releaseResourceDelivery?(
    delivery: Pick<PreparedResourceDelivery, "kind" | "url">,
  ): Promise<void>;
  listProviders?(): Promise<ProviderList>;
  saveProvider?(
    request: SaveProviderRequest,
  ): Promise<ProviderMutationResult>;
  removeProvider?(request: {
    readonly connectionId: string;
  }): Promise<ProviderMutationResult>;
  refreshModelCatalog?(): Promise<ModelCatalogRefreshResult>;
  setupImageGenerationAndContinue?(request: {
    readonly operationId: string;
    readonly sessionId: string;
    readonly operation: "image.generate";
    readonly imageGenerationModelId: string;
  }): Promise<CapabilitySetupResult>;
  readonly mcpSettings?: McpSettingsClient;
  subscribe?(listener: (event: ClientEvent) => void): () => void;
}

export interface AppProps {
  readonly client: Client;
  readonly initialSnapshot?: Snapshot;
  readonly onModalStateChange?: (state: AppModalState) => void;
}

export type AppModalState =
  | { readonly active: false }
  | { readonly active: true; readonly kind: "settings" };
