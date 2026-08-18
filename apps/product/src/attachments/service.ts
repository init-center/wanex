import type { ResourceRecord } from "@wanex/protocol"
import type { BackendShell } from "@wanex/product/backend"
import {
  copyState,
  resolveSessionId,
  type MutableState,
  type StateCoordinator
} from "../state/product.js"
import type {
  AttachmentDraft,
  AttachmentPreviewKind,
  ConversationAttachmentsReadModel,
  PrepareConversationAttachmentRequest,
  PrepareConversationAttachmentResult,
  ReadConversationAttachmentsRequest,
  RemoveConversationAttachmentRequest,
  RemoveConversationAttachmentResult
} from "./model.js"

export const NEW_CONVERSATION_DRAFT_KEY = "__new__" as const

export async function prepareConversationAttachment(request: {
  readonly backend: BackendShell
  readonly state: StateCoordinator
  readonly input: PrepareConversationAttachmentRequest
  readonly now?: () => number
}): Promise<PrepareConversationAttachmentResult> {
  const resourceId = required(request.input.resourceId, "attachment resourceId")
  const resource = await request.backend.commands.readResource({ resourceId })
  if (resource === null) {
    throw new Error("attachment resource was not found")
  }
  const draft = projectAttachment(resource, request.now?.() ?? Date.now())

  return await request.state.mutate<PrepareConversationAttachmentResult>(async (state) => {
    const target = resolveAttachmentTarget(state, request.input.sessionId)
    const current = state.conversationAttachmentDrafts[target.draftKey] ?? []
    const existing = current.find(
      (attachment) => attachment.resourceId === draft.resourceId
    )
    if (existing !== undefined) {
      return {
        value: {
          kind: "product.conversation-attachment.prepared" as const,
          attachment: existing,
          attachments: attachmentReadModel(target, current)
        }
      }
    }

    const attachments = [...current, draft]
    const next = copyState(state)
    next.conversationAttachmentDrafts[target.draftKey] = attachments
    return {
      value: {
        kind: "product.conversation-attachment.prepared" as const,
        attachment: draft,
        attachments: attachmentReadModel(target, attachments)
      },
      next
    }
  })
}

export function readConversationAttachments(request: {
  readonly state: MutableState
  readonly input: ReadConversationAttachmentsRequest
}): ConversationAttachmentsReadModel {
  const target = resolveAttachmentTarget(request.state, request.input.sessionId)
  return attachmentReadModel(
    target,
    request.state.conversationAttachmentDrafts[target.draftKey] ?? []
  )
}

export async function removeConversationAttachment(request: {
  readonly state: StateCoordinator
  readonly input: RemoveConversationAttachmentRequest
}): Promise<RemoveConversationAttachmentResult> {
  const resourceId = required(request.input.resourceId, "attachment resourceId")
  return await request.state.mutate<RemoveConversationAttachmentResult>(async (state) => {
    const target = resolveAttachmentTarget(state, request.input.sessionId)
    const current = state.conversationAttachmentDrafts[target.draftKey] ?? []
    const attachments = current.filter(
      (attachment) => attachment.resourceId !== resourceId
    )
    if (attachments.length === current.length) {
      return {
        value: {
          kind: "product.conversation-attachment.removed" as const,
          removed: false,
          resourceId,
          attachments: attachmentReadModel(target, current)
        }
      }
    }

    const next = copyState(state)
    if (attachments.length === 0) {
      delete next.conversationAttachmentDrafts[target.draftKey]
    } else {
      next.conversationAttachmentDrafts[target.draftKey] = attachments
    }
    return {
      value: {
        kind: "product.conversation-attachment.removed" as const,
        removed: true,
        resourceId,
        attachments: attachmentReadModel(target, attachments)
      },
      next
    }
  })
}

export function attachmentDraftsForConversation(
  state: MutableState,
  sessionId: string | undefined
): readonly AttachmentDraft[] {
  const draftKey = sessionId ?? NEW_CONVERSATION_DRAFT_KEY
  return state.conversationAttachmentDrafts[draftKey] ?? []
}

export function clearAttachmentDraftsForConversation(
  state: MutableState,
  sessionId: string | undefined
): MutableState {
  const draftKey = sessionId ?? NEW_CONVERSATION_DRAFT_KEY
  if (state.conversationAttachmentDrafts[draftKey] === undefined) {
    return state
  }
  const next = copyState(state)
  delete next.conversationAttachmentDrafts[draftKey]
  return next
}

function resolveAttachmentTarget(
  state: MutableState,
  requestedSessionId: string | undefined
): { readonly draftKey: string; readonly sessionId?: string } {
  const sessionId = resolveSessionId(state, requestedSessionId)
  return sessionId === undefined
    ? { draftKey: NEW_CONVERSATION_DRAFT_KEY }
    : { draftKey: sessionId, sessionId }
}

function attachmentReadModel(
  target: { readonly draftKey: string; readonly sessionId?: string },
  attachments: readonly AttachmentDraft[]
): ConversationAttachmentsReadModel {
  return {
    kind: "product.conversation-attachments",
    draftKey: target.draftKey,
    ...(target.sessionId === undefined ? {} : { sessionId: target.sessionId }),
    attachments: attachments.map((attachment) => ({ ...attachment }))
  }
}

function projectAttachment(
  resource: ResourceRecord,
  addedAt: number
): AttachmentDraft {
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
    kind: "product.attachment",
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

function previewKind(resource: ResourceRecord): AttachmentPreviewKind {
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
