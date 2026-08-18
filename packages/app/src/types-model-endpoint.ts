import type {
  ModelDescriptor,
  ModelEndpoint,
  ProviderConnection,
  ProviderProtocolDescriptor,
} from "@wanex/protocol";

export type WanexAppModelEndpointOptions = ModelEndpoint;

export interface WanexAppModelEndpointCommands {
  readActiveModelEndpoint(): Promise<WanexAppModelEndpointReadModel | null>;
  setActiveModelEndpoint(
    request: WanexAppSetActiveModelEndpointRequest,
  ): Promise<WanexAppModelEndpointReadModel>;
  upsertModelEndpoint(
    request: WanexAppUpsertModelEndpointRequest,
  ): Promise<WanexAppModelEndpointReadModel>;
  replaceConnectedModelEndpoints(
    request: WanexAppReplaceConnectedModelEndpointsRequest,
  ): Promise<readonly WanexAppModelEndpointReadModel[]>;
  removeModelEndpointConnection(
    request: WanexAppRemoveModelEndpointConnectionRequest,
  ): Promise<WanexAppRemoveModelEndpointConnectionResult>;
  upsertSiblingModelEndpoint(
    request: WanexAppUpsertSiblingModelEndpointRequest,
  ): Promise<WanexAppModelEndpointReadModel>;
  readModelEndpoint(
    request: WanexAppReadModelEndpointRequest,
  ): Promise<WanexAppModelEndpointReadModel | null>;
  listModelEndpoints(): Promise<WanexAppModelEndpointListReadModel>;
}

export interface WanexAppSetActiveModelEndpointRequest {
  readonly endpointId: string;
}

export interface WanexAppUpsertModelEndpointRequest {
  readonly modelEndpoint: ModelEndpoint;
  readonly makeActive?: boolean;
}

export interface WanexAppReplaceConnectedModelEndpointsRequest {
  readonly connection: ProviderConnection;
  readonly endpoints: readonly Omit<ModelEndpoint, "connection">[];
  readonly makeActiveEndpointId?: string;
  readonly activateByDefault?: boolean;
}

export interface WanexAppRemoveModelEndpointConnectionRequest {
  readonly connectionId: string;
}

export interface WanexAppRemoveModelEndpointConnectionResult {
  readonly connectionId: string;
  readonly removedEndpointIds: readonly string[];
  readonly activeEndpointId?: string;
}

export interface WanexAppUpsertSiblingModelEndpointRequest {
  readonly sourceEndpointId: string;
  readonly endpoint: Omit<ModelEndpoint, "connection">;
  readonly makeActive?: boolean;
}

export interface WanexAppReadModelEndpointRequest {
  readonly endpointId: string;
}

export interface WanexAppModelEndpointReadModel {
  readonly id: string;
  readonly connection: Omit<ProviderConnection, "secretRef">;
  readonly protocol: ProviderProtocolDescriptor;
  readonly model: ModelDescriptor;
  readonly credentialConfigured: boolean;
  readonly active: boolean;
}

export interface WanexAppModelEndpointListReadModel {
  readonly activeEndpointId?: string;
  readonly endpoints: readonly WanexAppModelEndpointReadModel[];
}
