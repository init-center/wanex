import type { ResourceRecord } from "@wanex/protocol"
import type { ProductAppBackendShell } from "@wanex/product-app/backend"
import {
  copyProductAppState,
  resolveProductAppSessionId,
  type MutableProductAppState,
  type ProductAppStateCoordinator
} from "./product-state.js"
import type {
  ProductAppAttachmentDraft,
  ProductAppAttachmentPreviewKind,
  ProductAppConversationAttachmentsReadModel,
  ProductAppPrepareConversationAttachmentRequest,
  ProductAppPrepareConversationAttachmentResult,
  ProductAppReadConversationAttachmentsRequest,
  ProductAppRemoveConversationAttachmentRequest,
  ProductAppRemoveConversationAttachmentResult
} from "./types-attachments.js"

export const PRODUCT_APP_NEW_CONVERSATION_DRAFT_KEY = "__new__" as const

export async function prepareProductAppConversationAttachment(request: {
  readonly backend: ProductAppBackendShell
  readonly state: ProductAppStateCoordinator
  readonly input: ProductAppPrepareConversationAttachmentRequest
  readonly now?: () => number
}): Promise<ProductAppPrepareConversationAttachmentResult> {
  const resourceId = required(request.input.resourceId, "attachment resourceId")
  const resource = await request.backend.commands.readResource({ resourceId })
  if (resource === null) {
    throw new Error("attachment resource was not found")
  }
  const draft = projectProductAppAttachment(resource, request.now?.() ?? Date.now())

  return await request.state.mutate<ProductAppPrepareConversationAttachmentResult>(async (state) => {
    const target = resolveAttachmentTarget(state, request.input.sessionId)
    const current = state.conversationAttachmentDrafts[target.draftKey] ?? []
    const existing = current.find(
      (attachment) => attachment.resourceId === draft.resourceId
    )
    if (existing !== undefined) {
      return {
        value: {
          kind: "product-app.conversation-attachment.prepared" as const,
          attachment: existing,
          attachments: attachmentReadModel(target, current)
        }
      }
    }

    const attachments = [...current, draft]
    const next = copyProductAppState(state)
    next.conversationAttachmentDrafts[target.draftKey] = attachments
    return {
      value: {
        kind: "product-app.conversation-attachment.prepared" as const,
        attachment: draft,
        attachments: attachmentReadModel(target, attachments)
      },
      next
    }
  })
}

export function readProductAppConversationAttachments(request: {
  readonly state: MutableProductAppState
  readonly input: ProductAppReadConversationAttachmentsRequest
}): ProductAppConversationAttachmentsReadModel {
  const target = resolveAttachmentTarget(request.state, request.input.sessionId)
  return attachmentReadModel(
    target,
    request.state.conversationAttachmentDrafts[target.draftKey] ?? []
  )
}

export async function removeProductAppConversationAttachment(request: {
  readonly state: ProductAppStateCoordinator
  readonly input: ProductAppRemoveConversationAttachmentRequest
}): Promise<ProductAppRemoveConversationAttachmentResult> {
  const resourceId = required(request.input.resourceId, "attachment resourceId")
  return await request.state.mutate<ProductAppRemoveConversationAttachmentResult>(async (state) => {
    const target = resolveAttachmentTarget(state, request.input.sessionId)
    const current = state.conversationAttachmentDrafts[target.draftKey] ?? []
    const attachments = current.filter(
      (attachment) => attachment.resourceId !== resourceId
    )
    if (attachments.length === current.length) {
      return {
        value: {
          kind: "product-app.conversation-attachment.removed" as const,
          removed: false,
          resourceId,
          attachments: attachmentReadModel(target, current)
        }
      }
    }

    const next = copyProductAppState(state)
    if (attachments.length === 0) {
      delete next.conversationAttachmentDrafts[target.draftKey]
    } else {
      next.conversationAttachmentDrafts[target.draftKey] = attachments
    }
    return {
      value: {
        kind: "product-app.conversation-attachment.removed" as const,
        removed: true,
        resourceId,
        attachments: attachmentReadModel(target, attachments)
      },
      next
    }
  })
}

export function attachmentDraftsForConversation(
  state: MutableProductAppState,
  sessionId: string | undefined
): readonly ProductAppAttachmentDraft[] {
  const draftKey = sessionId ?? PRODUCT_APP_NEW_CONVERSATION_DRAFT_KEY
  return state.conversationAttachmentDrafts[draftKey] ?? []
}

export function clearAttachmentDraftsForConversation(
  state: MutableProductAppState,
  sessionId: string | undefined
): MutableProductAppState {
  const draftKey = sessionId ?? PRODUCT_APP_NEW_CONVERSATION_DRAFT_KEY
  if (state.conversationAttachmentDrafts[draftKey] === undefined) {
    return state
  }
  const next = copyProductAppState(state)
  delete next.conversationAttachmentDrafts[draftKey]
  return next
}

function resolveAttachmentTarget(
  state: MutableProductAppState,
  requestedSessionId: string | undefined
): { readonly draftKey: string; readonly sessionId?: string } {
  const sessionId = resolveProductAppSessionId(state, requestedSessionId)
  return sessionId === undefined
    ? { draftKey: PRODUCT_APP_NEW_CONVERSATION_DRAFT_KEY }
    : { draftKey: sessionId, sessionId }
}

function attachmentReadModel(
  target: { readonly draftKey: string; readonly sessionId?: string },
  attachments: readonly ProductAppAttachmentDraft[]
): ProductAppConversationAttachmentsReadModel {
  return {
    kind: "product-app.conversation-attachments",
    draftKey: target.draftKey,
    ...(target.sessionId === undefined ? {} : { sessionId: target.sessionId }),
    attachments: attachments.map((attachment) => ({ ...attachment }))
  }
}

function projectProductAppAttachment(
  resource: ResourceRecord,
  addedAt: number
): ProductAppAttachmentDraft {
  if (resource.state !== "available") {
    throw new Error(`attachment resource is not available (${resource.state})`)
  }
  if (!Number.isSafeInteger(resource.sizeBytes) || resource.sizeBytes <= 0) {
    throw new Error("attachment resource has an invalid size")
  }
  if (!/^[a-f0-9]{64}$/.test(resource.sha256)) {
    throw new Error("attachment resource has an invalid digest")
  }
  return {
    kind: "product-app.attachment",
    resourceId: resource.id,
    resourceKind: resource.kind,
    previewKind: previewKind(resource),
    state: resource.state,
    sizeBytes: resource.sizeBytes,
    sha256: resource.sha256,
    ...(resource.label === undefined ? {} : { label: resource.label }),
    ...(resource.mediaType === undefined ? {} : { mediaType: resource.mediaType }),
    ...(resource.width === undefined ? {} : { width: resource.width }),
    ...(resource.height === undefined ? {} : { height: resource.height }),
    ...(resource.durationMs === undefined ? {} : { durationMs: resource.durationMs }),
    addedAt
  }
}

function previewKind(resource: ResourceRecord): ProductAppAttachmentPreviewKind {
  if (resource.kind === "image") return "image"
  if (resource.kind === "audio") return "audio"
  if (resource.kind === "video") return "video"
  if (resource.kind === "document" || resource.mediaType?.startsWith("text/")) {
    return "document"
  }
  return "file"
}

function required(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  return normalized
}
