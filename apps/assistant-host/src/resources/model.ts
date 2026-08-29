export type LocalResourceDeliveryPurpose = "preview" | "media"
export type LocalResourceDeliveryKind = "image" | "audio" | "video"

export interface LocalResourceDeliveryAuthorizationRequest {
  readonly resourceId: string
  readonly expectedSha256: string
  readonly purpose: LocalResourceDeliveryPurpose
  readonly sessionId?: string
}

export interface LocalResourceDeliveryAuthorizer {
  authorize(
    request: LocalResourceDeliveryAuthorizationRequest
  ): Promise<boolean>
}

export interface LocalPrepareResourceDeliveryRequest
  extends LocalResourceDeliveryAuthorizationRequest {
  /** Trusted Host-owned audience. Renderer input must never populate it. */
  readonly audience: string
}

export interface LocalPreparedResourceDelivery {
  readonly kind: "assistant-host.resource-delivery"
  readonly token: string
  readonly resourceId: string
  readonly sha256: string
  readonly resourceKind: LocalResourceDeliveryKind
  readonly mediaType: string
  readonly sizeBytes: number
  readonly purpose: LocalResourceDeliveryPurpose
  readonly sessionId?: string
  readonly expiresAt: number
}

export interface LocalOpenResourceDeliveryRequest {
  readonly token: string
  readonly method: "GET" | "HEAD"
  readonly range?: string
  readonly ifNoneMatch?: string
  readonly audience?: string
  readonly signal?: AbortSignal
}

export interface LocalResourceDeliveryRead {
  readonly kind: "assistant-host.resource-delivery-read"
  readonly statusCode: 200 | 206 | 304
  readonly resourceId: string
  readonly sha256: string
  readonly resourceKind: LocalResourceDeliveryKind
  readonly mediaType: string
  readonly totalSizeBytes: number
  readonly contentLength: number
  readonly etag: string
  readonly digest: string
  readonly expiresAt: number
  readonly range?: {
    readonly start: number
    readonly end: number
  }
  readonly body?: AsyncIterable<Uint8Array>
}

export interface LocalResourceDeliveryPort {
  prepare(
    request: LocalPrepareResourceDeliveryRequest
  ): Promise<LocalPreparedResourceDelivery>
  open(
    request: LocalOpenResourceDeliveryRequest
  ): Promise<LocalResourceDeliveryRead>
  revoke(token: string): boolean
  close(): void
  activeGrantCount(): number
}

export type LocalResourceDeliveryErrorCode =
  | "invalid_resource_delivery"
  | "resource_delivery_forbidden"
  | "resource_delivery_capacity_exceeded"
  | "resource_delivery_not_found"
  | "resource_delivery_expired"
  | "resource_delivery_audience_mismatch"
  | "resource_not_found"
  | "resource_not_available"
  | "resource_evidence_mismatch"
  | "resource_too_large"
  | "unsupported_resource_delivery"
  | "resource_content_mismatch"
  | "resource_range_not_satisfiable"
  | "resource_delivery_closed"
  | "resource_delivery_aborted"

export class LocalResourceDeliveryError extends Error {
  constructor(
    readonly statusCode: 400 | 403 | 404 | 409 | 410 | 413 | 415 | 416 | 429,
    readonly code: LocalResourceDeliveryErrorCode,
    message: string,
    readonly totalSizeBytes?: number
  ) {
    super(message)
    this.name = "LocalResourceDeliveryError"
  }
}
