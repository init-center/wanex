import type { ResourceId, ResourceTicketId, PrincipalId } from "./ids.js"
import type { JsonValue } from "./json.js"

export type ResourceKind =
  | "file"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "artifact"
  | "log"
  | "patch"
  | "url"

export type ResourceOrigin =
  | "user_upload"
  | "model_output"
  | "tool_output"
  | "provider_file"
  | "remote_url"
  | "system"

export type ResourceState =
  | "pending"
  | "fetching"
  | "available"
  | "failed"
  | "expired"
  | "deleted"

export interface ResourceSource {
  readonly provider?: string
  readonly providerFileId?: string
  readonly providerOperationId?: string
  readonly sourceUrl?: string
  readonly sourceExpiresAt?: number
}

export interface AtomicWriteRequest {
  readonly logicalPath: string
  readonly content: Uint8Array
  readonly expectedSha256?: string
}

export interface FileRecord {
  readonly resourceId: ResourceId
  readonly logicalPath: string
  readonly sizeBytes: number
  readonly sha256: string
  readonly updatedAt: number
}

export interface ResourceRecord {
  readonly id: ResourceId
  readonly logicalPath: string
  readonly kind: ResourceKind
  readonly origin: ResourceOrigin
  readonly state: ResourceState
  readonly mediaType?: string
  readonly label?: string
  readonly sizeBytes: number
  readonly sha256: string
  readonly source?: ResourceSource
  readonly metadata?: JsonValue
  readonly width?: number
  readonly height?: number
  readonly durationMs?: number
  readonly createdAt: number
  readonly updatedAt: number
}

export interface IngestResourceRequest {
  readonly id?: ResourceId
  readonly logicalPath?: string
  readonly content: Uint8Array
  readonly mediaType?: string
  readonly kind?: ResourceKind
  readonly origin?: ResourceOrigin
  readonly label?: string
  readonly source?: ResourceSource
  readonly metadata?: JsonValue
  readonly width?: number
  readonly height?: number
  readonly durationMs?: number
  readonly expectedSha256?: string
}

export interface GetResourceRequest {
  readonly resourceId: ResourceId
}

export interface ListResourcesRequest {
  readonly kind?: ResourceKind
  readonly origin?: ResourceOrigin
  readonly state?: ResourceState
  readonly limit?: number
}

export interface ResourceTicketRequest {
  readonly principalId: PrincipalId
  readonly resourceId: ResourceId
  readonly capability: "read" | "write"
  readonly expiresAt: number
}

export interface ResourceTicket {
  readonly id: ResourceTicketId
  readonly principalId: PrincipalId
  readonly resourceId: ResourceId
  readonly capability: "read" | "write"
  readonly expiresAt: number
  readonly revokedAt?: number
}

export interface CleanupExpiredResourceTicketsRequest {
  readonly nowMs?: number
  readonly limit?: number
}

export interface ResourceTicketCleanupReceipt {
  readonly revokedCount: number
  readonly revokedTicketIds: readonly ResourceTicketId[]
  readonly nowMs: number
}
