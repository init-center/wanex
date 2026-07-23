import type {
  ProductAppConversationAttachmentsReadModel,
  ProductAppAttachmentDraft,
  ProductAppShell
} from "@wanex/product-app"
import type { ResourceKind } from "@wanex/protocol"

export const MAX_PRODUCT_APP_ATTACHMENT_UPLOAD_BYTES = 25 * 1024 * 1024

const acceptedKinds = new Set<ResourceKind>([
  "file",
  "image",
  "video",
  "audio",
  "document"
])
const mediaTypePattern = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/

export interface ProductAppLocalAttachmentUploadRequest {
  readonly content: Uint8Array
  readonly mediaType: string
  readonly kind?: ResourceKind
  readonly label?: string
  readonly sessionId?: string
}

export interface ProductAppLocalAttachmentUploadResult {
  readonly kind: "product-app-local.attachment-uploaded"
  readonly attachment: ProductAppAttachmentDraft
  readonly attachments: ProductAppConversationAttachmentsReadModel
}

export interface ProductAppLocalAttachmentUploadPort {
  uploadAttachment(
    request: ProductAppLocalAttachmentUploadRequest
  ): Promise<ProductAppLocalAttachmentUploadResult>
}

export function createProductAppLocalAttachmentUploadPort(
  productApp: ProductAppShell
): ProductAppLocalAttachmentUploadPort {
  return {
    async uploadAttachment(request) {
      const normalized = normalizeUploadRequest(request)
      const resource = await productApp.trustedResources.ingestResource({
        content: normalized.content,
        mediaType: normalized.mediaType,
        kind: normalized.kind,
        origin: "user_upload",
        ...(normalized.label === undefined ? {} : { label: normalized.label })
      })
      const prepared = await productApp.prepareConversationAttachment({
        resourceId: resource.id,
        ...(normalized.sessionId === undefined
          ? {}
          : { sessionId: normalized.sessionId })
      })
      return {
        kind: "product-app-local.attachment-uploaded",
        attachment: prepared.attachment,
        attachments: prepared.attachments
      }
    }
  }
}

function normalizeUploadRequest(
  request: ProductAppLocalAttachmentUploadRequest
): Required<Pick<ProductAppLocalAttachmentUploadRequest, "content" | "mediaType" | "kind">> &
  Pick<ProductAppLocalAttachmentUploadRequest, "label" | "sessionId"> {
  if (!(request.content instanceof Uint8Array)) {
    throw new Error("attachment content must be bytes")
  }
  if (request.content.byteLength === 0) {
    throw new Error("attachment content must not be empty")
  }
  if (request.content.byteLength > MAX_PRODUCT_APP_ATTACHMENT_UPLOAD_BYTES) {
    throw new Error(
      `attachment exceeds ${MAX_PRODUCT_APP_ATTACHMENT_UPLOAD_BYTES} bytes`
    )
  }
  const mediaType = request.mediaType.trim().toLowerCase()
  if (!mediaTypePattern.test(mediaType)) {
    throw new Error("attachment mediaType is invalid")
  }
  const inferredKind = inferResourceKind(mediaType)
  const kind = request.kind ?? inferredKind
  if (!acceptedKinds.has(kind)) {
    throw new Error(`attachment kind is not supported: ${kind}`)
  }
  if (kind !== "file" && kind !== inferredKind) {
    throw new Error(
      `attachment kind ${kind} does not match mediaType ${mediaType}`
    )
  }
  const label = optionalText(request.label, "attachment label", 255)
  const sessionId = optionalText(request.sessionId, "attachment sessionId", 512)
  return {
    content: request.content,
    mediaType,
    kind,
    ...(label === undefined ? {} : { label }),
    ...(sessionId === undefined ? {} : { sessionId })
  }
}

function inferResourceKind(mediaType: string): ResourceKind {
  if (mediaType.startsWith("image/")) return "image"
  if (mediaType.startsWith("audio/")) return "audio"
  if (mediaType.startsWith("video/")) return "video"
  if (
    mediaType.startsWith("text/") ||
    mediaType === "application/pdf" ||
    mediaType.includes("document") ||
    mediaType.includes("presentation") ||
    mediaType.includes("spreadsheet")
  ) {
    return "document"
  }
  return "file"
}

function optionalText(
  value: string | undefined,
  label: string,
  maxLength: number
): string | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new Error(`${label} must contain 1 to ${maxLength} characters`)
  }
  if (/\p{Cc}/u.test(normalized)) {
    throw new Error(`${label} must not contain control characters`)
  }
  return normalized
}
