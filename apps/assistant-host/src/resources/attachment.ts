import type {
  ConversationAttachmentsReadModel,
  AttachmentDraft,
  Shell
} from "@wanex/assistant"
import type { ResourceKind } from "@wanex/protocol"
import type { ModelInputModality } from "@wanex/protocol"

export const MAX_ATTACHMENT_UPLOAD_BYTES = 25 * 1024 * 1024

const acceptedKinds = new Set<ResourceKind>([
  "file",
  "image",
  "video",
  "audio",
  "document"
])
const mediaTypePattern = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/

export interface LocalAttachmentUploadRequest {
  readonly content: Uint8Array
  readonly mediaType: string
  readonly kind?: ResourceKind
  readonly label?: string
  readonly sessionId?: string
}

export interface LocalAttachmentUploadResult {
  readonly kind: "assistant-host.attachment-uploaded"
  readonly attachment: AttachmentDraft
  readonly attachments: ConversationAttachmentsReadModel
}

export interface LocalAttachmentUploadPort {
  uploadAttachment(
    request: LocalAttachmentUploadRequest
  ): Promise<LocalAttachmentUploadResult>
}

export class LocalAttachmentUploadError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: "provider_not_ready" | "unsupported_attachment",
    message: string
  ) {
    super(message)
    this.name = "LocalAttachmentUploadError"
  }
}

export function createLocalAttachmentUploadPort(
  shell: Shell
): LocalAttachmentUploadPort {
  return {
    async uploadAttachment(request) {
      const normalized = normalizeUploadRequest(request)
      await assertActiveProviderSupportsAttachment(shell, normalized.kind)
      const resource = await shell.trustedResources.ingestResource({
        content: normalized.content,
        mediaType: normalized.mediaType,
        kind: normalized.kind,
        origin: "user_upload",
        ...(normalized.label === undefined ? {} : { label: normalized.label })
      })
      const prepared = await shell.prepareConversationAttachment({
        resourceId: resource.id,
        ...(normalized.sessionId === undefined
          ? {}
          : { sessionId: normalized.sessionId })
      })
      return {
        kind: "assistant-host.attachment-uploaded",
        attachment: prepared.attachment,
        attachments: prepared.attachments
      }
    }
  }
}

async function assertActiveProviderSupportsAttachment(
  shell: Shell,
  kind: ResourceKind
): Promise<void> {
  const endpointList = await shell.modelEndpoints.listModelEndpoints()
  const active = endpointList.endpoints.find(
    (endpoint) => endpoint.id === endpointList.activeEndpointId && endpoint.active
  )
  if (active === undefined) {
    throw new LocalAttachmentUploadError(
      409,
      "provider_not_ready",
      "attachment upload requires an active provider"
    )
  }
  const modality = attachmentModality(kind)
  if (!active.model.inputModalities.includes(modality)) {
    throw new LocalAttachmentUploadError(
      415,
      "unsupported_attachment",
      `active provider does not support ${modality} attachment input`
    )
  }
}

function attachmentModality(kind: ResourceKind): ModelInputModality {
  if (kind === "image") return "image"
  if (kind === "audio") return "audio"
  if (kind === "video") return "video"
  return "document"
}

function normalizeUploadRequest(
  request: LocalAttachmentUploadRequest
): Required<Pick<LocalAttachmentUploadRequest, "content" | "mediaType" | "kind">> &
  Pick<LocalAttachmentUploadRequest, "label" | "sessionId"> {
  if (!(request.content instanceof Uint8Array)) {
    throw new Error("attachment content must be bytes")
  }
  if (request.content.byteLength === 0) {
    throw new Error("attachment content must not be empty")
  }
  if (request.content.byteLength > MAX_ATTACHMENT_UPLOAD_BYTES) {
    throw new Error(
      `attachment exceeds ${MAX_ATTACHMENT_UPLOAD_BYTES} bytes`
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
