import type {
  IngestResourceRequest,
  JsonValue,
  ResourceKind,
  ResourceOrigin,
  ResourceRecord,
  ResourceSource
} from "@wanex/protocol"
import type { RuntimeStore } from "@wanex/storage"

export type ProviderArtifactOutput =
  | ProviderBase64ArtifactOutput
  | ProviderInlineBytesArtifactOutput
  | ProviderFileArtifactOutput
  | ProviderRemoteUrlArtifactOutput
  | ProviderAsyncOperationArtifactOutput

export interface ProviderArtifactBase {
  readonly mediaType?: string
  readonly kind?: ResourceKind
  readonly origin?: ResourceOrigin
  readonly label?: string
  readonly provider?: string
  readonly metadata?: IngestResourceRequest["metadata"]
  readonly width?: number
  readonly height?: number
  readonly durationMs?: number
}

export interface ProviderBase64ArtifactOutput extends ProviderArtifactBase {
  readonly kindOfOutput: "base64"
  readonly data: string
}

export interface ProviderInlineBytesArtifactOutput extends ProviderArtifactBase {
  readonly kindOfOutput: "inline_bytes"
  readonly bytes: Uint8Array
}

export interface ProviderFileArtifactOutput extends ProviderArtifactBase {
  readonly kindOfOutput: "provider_file"
  readonly fileId: string
  readonly placeholderText?: string
}

export interface ProviderRemoteUrlArtifactOutput extends ProviderArtifactBase {
  readonly kindOfOutput: "remote_url"
  readonly url: string
  readonly expiresAt?: number
  readonly placeholderText?: string
}

export interface ProviderAsyncOperationArtifactOutput extends ProviderArtifactBase {
  readonly kindOfOutput: "async_operation"
  readonly operationId: string
  readonly placeholderText?: string
}

export interface WanexResourceRuntimeOptions {
  readonly storage: RuntimeStore
}

export type ResourcePreviewKind =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "text"
  | "patch"
  | "log"
  | "artifact"
  | "url"

export interface ResourceUiDescriptor {
  readonly resourceId: string
  readonly kind: ResourceKind
  readonly previewKind: ResourcePreviewKind
  readonly label?: string
  readonly mediaType?: string
  readonly sizeBytes: number
  readonly sha256: string
  readonly width?: number
  readonly height?: number
  readonly durationMs?: number
  readonly state: ResourceRecord["state"]
  readonly origin: ResourceOrigin
  readonly source?: ResourceSource
  readonly metadata?: JsonValue
}

export type ProviderResourceInputSource =
  | ProviderResourceInputProviderFileSource
  | ProviderResourceInputRemoteUrlSource
  | ProviderResourceInputAsyncOperationSource
  | ProviderResourceInputLocalResourceSource

export interface ProviderResourceInputBase {
  readonly resourceId: string
  readonly kind: ResourceKind
  readonly mediaType?: string
  readonly label?: string
  readonly width?: number
  readonly height?: number
  readonly durationMs?: number
  readonly metadata?: JsonValue
}

export interface ProviderResourceInputProviderFileSource
  extends ProviderResourceInputBase {
  readonly sourceKind: "provider_file"
  readonly provider: string
  readonly providerFileId: string
}

export interface ProviderResourceInputRemoteUrlSource
  extends ProviderResourceInputBase {
  readonly sourceKind: "remote_url"
  readonly url: string
  readonly expiresAt?: number
}

export interface ProviderResourceInputAsyncOperationSource
  extends ProviderResourceInputBase {
  readonly sourceKind: "async_operation"
  readonly provider: string
  readonly operationId: string
}

export interface ProviderResourceInputLocalResourceSource
  extends ProviderResourceInputBase {
  readonly sourceKind: "local_resource"
  readonly sha256: string
  readonly sizeBytes: number
}

export interface ContextResourceSummary {
  readonly resourceId: string
  readonly text: string
  readonly tokenEstimate: number
}

export interface ArtifactBundle {
  readonly resources: readonly ResourceUiDescriptor[]
  readonly providerInputs: readonly ProviderResourceInputSource[]
  readonly contextSummaries: readonly ContextResourceSummary[]
}
