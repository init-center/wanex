import type { ResourceKind, ResourceState } from "@wanex/protocol"

export type ProductAppAttachmentPreviewKind =
  | "image"
  | "audio"
  | "video"
  | "document"
  | "file"

export interface ProductAppAttachmentDescriptor {
  readonly kind: "product-app.attachment"
  readonly resourceId: string
  readonly resourceKind: ResourceKind
  readonly previewKind: ProductAppAttachmentPreviewKind
  readonly state: ResourceState
  readonly sizeBytes: number
  readonly sha256: string
  readonly label?: string
  readonly mediaType?: string
  readonly width?: number
  readonly height?: number
  readonly durationMs?: number
}

export interface ProductAppAttachmentDraft
  extends ProductAppAttachmentDescriptor {
  readonly addedAt: number
}

export interface ProductAppPrepareConversationAttachmentRequest {
  readonly resourceId: string
  readonly sessionId?: string
}

export interface ProductAppReadConversationAttachmentsRequest {
  readonly sessionId?: string
}

export interface ProductAppRemoveConversationAttachmentRequest {
  readonly resourceId: string
  readonly sessionId?: string
}

export interface ProductAppConversationAttachmentsReadModel {
  readonly kind: "product-app.conversation-attachments"
  readonly draftKey: string
  readonly sessionId?: string
  readonly attachments: readonly ProductAppAttachmentDraft[]
}

export interface ProductAppPrepareConversationAttachmentResult {
  readonly kind: "product-app.conversation-attachment.prepared"
  readonly attachment: ProductAppAttachmentDraft
  readonly attachments: ProductAppConversationAttachmentsReadModel
}

export interface ProductAppRemoveConversationAttachmentResult {
  readonly kind: "product-app.conversation-attachment.removed"
  readonly removed: boolean
  readonly resourceId: string
  readonly attachments: ProductAppConversationAttachmentsReadModel
}
