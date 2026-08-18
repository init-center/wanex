import type { ResourceKind, ResourceRecord } from "@wanex/protocol"
import type { LocalResourceDeliveryPurpose } from "./model.js"
import type { LocalResourceDeliveryKind } from "./model.js"
import { LocalResourceDeliveryError } from "./model.js"

export const MAX_IMAGE_PREVIEW_BYTES = 25 * 1024 * 1024
export const MAX_AUDIO_DELIVERY_BYTES = 256 * 1024 * 1024
export const MAX_VIDEO_DELIVERY_BYTES = 1024 * 1024 * 1024

const previewImageMediaTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp"
])

export function validateResourceDeliveryRecord(request: {
  readonly resource: ResourceRecord | null
  readonly resourceId: string
  readonly expectedSha256: string
  readonly purpose: LocalResourceDeliveryPurpose
}): ResourceRecord & {
  readonly kind: LocalResourceDeliveryKind
  readonly mediaType: string
} {
  const { resource, resourceId, expectedSha256, purpose } = request
  if (resource === null) {
    throw deliveryPolicyError(404, "resource_not_found", "resource was not found")
  }
  if (resource.state !== "available") {
    throw deliveryPolicyError(
      409,
      "resource_not_available",
      `resource is not available (${resource.state})`
    )
  }
  if (resource.id !== resourceId || resource.sha256 !== expectedSha256) {
    throw deliveryPolicyError(
      409,
      "resource_evidence_mismatch",
      "resource identity or digest does not match canonical evidence"
    )
  }
  if (!Number.isSafeInteger(resource.sizeBytes) || resource.sizeBytes <= 0) {
    throw deliveryPolicyError(
      409,
      "resource_evidence_mismatch",
      "resource size evidence is invalid"
    )
  }
  if (resource.mediaType === undefined || !isSafeMediaType(resource.mediaType)) {
    throw deliveryPolicyError(
      415,
      "unsupported_resource_delivery",
      "resource media type is not safe for inline delivery"
    )
  }

  const maxBytes = deliverySizeLimit(resource.kind, resource.mediaType, purpose)
  if (maxBytes === undefined) {
    throw deliveryPolicyError(
      415,
      "unsupported_resource_delivery",
      `${resource.kind} resources do not support ${purpose} delivery`
    )
  }
  if (resource.sizeBytes > maxBytes) {
    throw deliveryPolicyError(
      413,
      "resource_too_large",
      `resource exceeds the ${maxBytes} byte ${purpose} limit`
    )
  }
  return {
    ...resource,
    kind: resource.kind as LocalResourceDeliveryKind,
    mediaType: resource.mediaType
  }
}

export function deliverySizeLimit(
  kind: ResourceKind,
  mediaType: string,
  purpose: LocalResourceDeliveryPurpose
): number | undefined {
  if (
    purpose === "preview" &&
    kind === "image" &&
    previewImageMediaTypes.has(mediaType)
  ) {
    return MAX_IMAGE_PREVIEW_BYTES
  }
  if (purpose === "media" && kind === "audio" && mediaType.startsWith("audio/")) {
    return MAX_AUDIO_DELIVERY_BYTES
  }
  if (purpose === "media" && kind === "video" && mediaType.startsWith("video/")) {
    return MAX_VIDEO_DELIVERY_BYTES
  }
  return undefined
}

function isSafeMediaType(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 255 &&
    /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(value)
  )
}

function deliveryPolicyError(
  statusCode: LocalResourceDeliveryError["statusCode"],
  code: LocalResourceDeliveryError["code"],
  message: string
): LocalResourceDeliveryError {
  return new LocalResourceDeliveryError(statusCode, code, message)
}
