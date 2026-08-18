import type { ResourceKind, ResourceState } from "@wanex/protocol"

export type AttachmentPreviewKind =
  | "image"
  | "audio"
  | "video"
  | "document"
  | "file"

export interface AttachmentDescriptor {
  readonly kind: "product.attachment"
  readonly resourceId: string
  readonly resourceKind: ResourceKind
  readonly previewKind: AttachmentPreviewKind
  readonly state: ResourceState
  readonly sizeBytes: number
  readonly sha256: string
  readonly label?: string
  readonly mediaType?: string
  readonly width?: number
  readonly height?: number
  readonly durationMs?: number
}

export interface AttachmentDraft
  extends AttachmentDescriptor {
  readonly addedAt: number
}

export interface PrepareConversationAttachmentRequest {
  readonly resourceId: string
  readonly sessionId?: string
}

export interface ReadConversationAttachmentsRequest {
  readonly sessionId?: string
}

export interface RemoveConversationAttachmentRequest {
  readonly resourceId: string
  readonly sessionId?: string
}

export interface ConversationAttachmentsReadModel {
  readonly kind: "product.conversation-attachments"
  readonly draftKey: string
  readonly sessionId?: string
  readonly attachments: readonly AttachmentDraft[]
}

export interface PrepareConversationAttachmentResult {
  readonly kind: "product.conversation-attachment.prepared"
  readonly attachment: AttachmentDraft
  readonly attachments: ConversationAttachmentsReadModel
}

export interface RemoveConversationAttachmentResult {
  readonly kind: "product.conversation-attachment.removed"
  readonly removed: boolean
  readonly resourceId: string
  readonly attachments: ConversationAttachmentsReadModel
}
