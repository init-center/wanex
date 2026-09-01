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
