import { createHash } from "node:crypto"
import type { UserMessageInputPart } from "@wanex/protocol"
import type {
  ProductAppBackendConversationOperationReadResult,
  ProductAppBackendConversationOperationReceipt,
  ProductAppBackendShell
} from "@wanex/product-app/backend"
import {
  productAppProviderNotReadyError,
  projectProductAppProviderReadiness
} from "./provider-readiness.js"
import {
  resolveProductAppSessionId,
  withTrackedConversationOperation,
  type MutableProductAppState,
  type ProductAppStateCoordinator
} from "./product-state.js"
import type {
  ProductAppCancelTrackedConversationOperationRequest,
  ProductAppCancelTrackedConversationOperationResult,
  ProductAppConversationOperationFoundResult,
  ProductAppConversationOperationReadModel,
  ProductAppConversationOperationRejectedResult,
  ProductAppReadTrackedConversationOperationRequest,
  ProductAppReadTrackedConversationOperationResult,
  ProductAppRegenerateTrackedConversationOperationRequest,
  ProductAppRegenerateTrackedConversationOperationResult,
  ProductAppSubmitConversationOperationRequest,
  ProductAppSubmitConversationOperationResult,
  ProductAppTrustedConversationOperationReference
} from "./types-conversation.js"
import {
  attachmentDraftsForConversation,
  clearAttachmentDraftsForConversation
} from "./attachments.js"
import type { ProductAppAttachmentDraft } from "./types-attachments.js"

const activeStates = new Set(["queued", "running", "cancel_requested"])
const cancellableStates = new Set(["queued", "running"])

export async function submitProductAppConversationOperation(request: {
  readonly backend: ProductAppBackendShell
  readonly state: ProductAppStateCoordinator
  readonly input: ProductAppSubmitConversationOperationRequest
}): Promise<ProductAppSubmitConversationOperationResult> {
  return await request.state.mutate<ProductAppSubmitConversationOperationResult>(async (state) => {
    const sessionId = resolveProductAppSessionId(state, request.input.sessionId)
    const attachments = attachmentDraftsForConversation(state, sessionId)
    const content = conversationContent(request.input.text, attachments)
    const readiness = await readProviderReadiness(request.backend)
    if (!readiness.canRun) {
      return {
        value: rejected("provider_not_ready", productAppProviderNotReadyError(readiness).message, sessionId)
      }
    }

    const unsupported = unsupportedAttachment(attachments, readiness)
    if (unsupported !== undefined) {
      return {
        value: rejected(
          "unsupported_attachment",
          `active provider does not support ${unsupported} attachment input`,
          sessionId
        )
      }
    }

    if (sessionId !== undefined) {
      const active = await readTrackedOperation(request.backend, state, sessionId)
      if (
        active.kind === "product-app.conversation-operation.found" &&
        active.operation.capabilities.terminal === false
      ) {
        return {
          value: rejected(
            "operation_active",
            "wait for or cancel the active conversation operation before submitting another message",
            sessionId,
            active.operation
          )
        }
      }
    }

    const receipt = await request.backend.commands.submitConversationOperation({
      content,
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(request.input.principalId === undefined
        ? {}
        : { principalId: request.input.principalId }),
      origin: {
        kind: "interactive",
        sourceRef: "product-app"
      },
      intent: "normal"
    })
    const next = clearAttachmentDraftsForConversation(
      withTrackedConversationOperation(state, receipt),
      sessionId
    )
    return {
      value: await readSubmittedOperation(request.backend, receipt),
      next
    }
  })
}

function conversationContent(
  text: string,
  attachments: readonly ProductAppAttachmentDraft[]
): UserMessageInputPart[] {
  if (typeof text !== "string") {
    throw new Error("conversation text must be a string")
  }
  const content: UserMessageInputPart[] = []
  if (text.trim().length > 0) {
    content.push({ type: "text", text })
  }
  content.push(
    ...attachments.map((attachment) => ({
      type: "resource" as const,
      resourceId: attachment.resourceId
    }))
  )
  if (content.length === 0) {
    throw new Error("conversation requires text or an attachment")
  }
  return content
}

function unsupportedAttachment(
  attachments: readonly ProductAppAttachmentDraft[],
  readiness: Awaited<ReturnType<typeof readProviderReadiness>>
): string | undefined {
  const supported = new Set(readiness.activeProfile?.capabilities.input ?? [])
  return attachments
    .map(attachmentModality)
    .find((modality) => !supported.has(modality))
}

function attachmentModality(
  attachment: ProductAppAttachmentDraft
): "image" | "audio" | "video" | "document" {
  if (attachment.resourceKind === "image") return "image"
  if (attachment.resourceKind === "audio") return "audio"
  if (attachment.resourceKind === "video") return "video"
  return "document"
}

export async function readProductAppTrackedConversationOperation(request: {
  readonly backend: ProductAppBackendShell
  readonly state: MutableProductAppState
  readonly input: ProductAppReadTrackedConversationOperationRequest
}): Promise<ProductAppReadTrackedConversationOperationResult> {
  const sessionId = resolveProductAppSessionId(
    request.state,
    request.input.sessionId
  )
  if (sessionId === undefined) {
    return untracked(undefined)
  }
  return await readTrackedOperation(request.backend, request.state, sessionId)
}

export async function cancelProductAppTrackedConversationOperation(request: {
  readonly backend: ProductAppBackendShell
  readonly state: MutableProductAppState
  readonly input: ProductAppCancelTrackedConversationOperationRequest
}): Promise<ProductAppCancelTrackedConversationOperationResult> {
  const sessionId = resolveProductAppSessionId(
    request.state,
    request.input.sessionId
  )
  if (sessionId === undefined) {
    return {
      kind: "product-app.conversation-operation.cancel",
      status: "untracked",
      operation: untracked(undefined)
    }
  }
  const reference = request.state.trackedConversationOperations[sessionId]
  if (reference === undefined) {
    return {
      kind: "product-app.conversation-operation.cancel",
      status: "untracked",
      operation: untracked(sessionId)
    }
  }
  const receipt = await request.backend.commands.cancelConversationOperation({
    ...reference,
    reason: normalizeRequiredString(request.input.reason, "cancel reason")
  })
  return {
    kind: "product-app.conversation-operation.cancel",
    status: receipt.status,
    operation: await readTrackedOperation(request.backend, request.state, sessionId)
  }
}

export async function regenerateProductAppTrackedConversationOperation(request: {
  readonly backend: ProductAppBackendShell
  readonly state: ProductAppStateCoordinator
  readonly input: ProductAppRegenerateTrackedConversationOperationRequest
}): Promise<ProductAppRegenerateTrackedConversationOperationResult> {
  return await request.state.mutate<ProductAppRegenerateTrackedConversationOperationResult>(async (state) => {
    const sessionId = resolveProductAppSessionId(state, request.input.sessionId)
    if (sessionId === undefined) {
      return { value: rejected("no_session", "select a session before regenerating") }
    }
    const reference = state.trackedConversationOperations[sessionId]
    if (reference === undefined) {
      return {
        value: rejected(
          "operation_not_found",
          "no tracked conversation operation exists for this session",
          sessionId
        )
      }
    }
    const source = await request.backend.commands.readConversationOperation(reference)
    if (source.kind === "missing") {
      return {
        value: rejected(
          "operation_not_found",
          "the tracked conversation operation no longer exists",
          sessionId
        )
      }
    }
    const projected = projectProductAppConversationOperation(source)
    if (!projected.operation.capabilities.terminal) {
      return {
        value: rejected(
          "operation_not_terminal",
          "only a terminal conversation operation can be regenerated",
          sessionId,
          projected.operation
        )
      }
    }
    const sourceRow = source.operation.transcript.rows.find(
      (row) => row.role === "user" && row.inputId === reference.inputId
    )
    const sourceContent: UserMessageInputPart[] | undefined =
      sourceRow?.parts.reduce<UserMessageInputPart[]>((parts, part) => {
        if (part.type === "text") {
          parts.push({ type: "text", text: part.text })
        } else if (part.type === "resource") {
          parts.push({ type: "resource", resourceId: part.resourceId })
        }
        return parts
      }, [])
    if (sourceContent === undefined || sourceContent.length === 0) {
      return {
        value: rejected(
          "source_input_missing",
          "the canonical source user input is unavailable",
          sessionId,
          projected.operation
        )
      }
    }
    const readiness = await readProviderReadiness(request.backend)
    if (!readiness.canRun) {
      return {
        value: rejected(
          "provider_not_ready",
          productAppProviderNotReadyError(readiness).message,
          sessionId,
          projected.operation
        )
      }
    }
    const receipt = await request.backend.commands.submitConversationOperation({
      content: sourceContent,
      sessionId,
      ...(request.input.principalId === undefined
        ? {}
        : { principalId: request.input.principalId }),
      regeneratesTurnId: reference.turnId,
      origin: {
        kind: "interactive",
        sourceRef: "product-app.regenerate",
        metadata: { operationId: productAppConversationOperationId(reference) }
      },
      intent: "normal"
    })
    return {
      value: await readSubmittedOperation(request.backend, receipt),
      next: withTrackedConversationOperation(state, receipt)
    }
  })
}

export function projectProductAppConversationOperation(
  source: Extract<ProductAppBackendConversationOperationReadResult, { readonly kind: "found" }>
): ProductAppConversationOperationFoundResult {
  const operation = source.operation
  const terminal = !activeStates.has(operation.state)
  return {
    kind: "product-app.conversation-operation.found",
    operation: {
      kind: "product-app.conversation-operation",
      operationId: productAppConversationOperationId(source.reference),
      sessionId: source.reference.sessionId,
      state: operation.state,
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
      ...(operation.finishedAt === undefined
        ? {}
        : { finishedAt: operation.finishedAt }),
      transcript: {
        rows: operation.transcript.rows.map((row, index) => ({
          key: stableOpaqueId("row", source.reference, `${row.id}:${index}`),
          kind: row.kind,
          role: row.role,
          status: row.status,
          text: row.text,
          textTruncated: row.textTruncated,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt
        })),
        totalRows: operation.transcript.totalRows,
        truncated: operation.transcript.truncated
      },
      ...(operation.result === undefined ? {} : { result: operation.result }),
      ...(operation.error === undefined ? {} : { error: operation.error }),
      capabilities: {
        cancellable: cancellableStates.has(operation.state),
        regeneratable: terminal,
        terminal
      }
    }
  }
}

export function productAppConversationOperationId(
  reference: ProductAppTrustedConversationOperationReference
): string {
  return stableOpaqueId("operation", reference)
}

async function readTrackedOperation(
  backend: ProductAppBackendShell,
  state: MutableProductAppState,
  sessionId: string
): Promise<ProductAppReadTrackedConversationOperationResult> {
  const reference = state.trackedConversationOperations[sessionId]
  if (reference === undefined) {
    return untracked(sessionId)
  }
  const source = await backend.commands.readConversationOperation(reference)
  if (source.kind === "missing") {
    return {
      kind: "product-app.conversation-operation.missing",
      sessionId,
      operationId: productAppConversationOperationId(reference),
      message: "the tracked conversation operation no longer exists"
    }
  }
  return projectProductAppConversationOperation(source)
}

async function readSubmittedOperation(
  backend: ProductAppBackendShell,
  receipt: ProductAppBackendConversationOperationReceipt
): Promise<ProductAppConversationOperationFoundResult> {
  const source = await backend.commands.readConversationOperation(receipt)
  if (source.kind === "found") {
    return projectProductAppConversationOperation(source)
  }
  const terminal = !activeStates.has(receipt.state)
  return {
    kind: "product-app.conversation-operation.found",
    operation: {
      kind: "product-app.conversation-operation",
      operationId: productAppConversationOperationId(receipt),
      sessionId: receipt.sessionId,
      state: receipt.state,
      createdAt: receipt.submittedAt,
      updatedAt: receipt.submittedAt,
      transcript: { rows: [], totalRows: 0, truncated: false },
      capabilities: {
        cancellable: cancellableStates.has(receipt.state),
        regeneratable: terminal,
        terminal
      }
    }
  }
}

async function readProviderReadiness(backend: ProductAppBackendShell) {
  return projectProductAppProviderReadiness(
    await backend.commands.listProviderProfiles()
  )
}

function untracked(
  sessionId: string | undefined
): ProductAppReadTrackedConversationOperationResult {
  return {
    kind: "product-app.conversation-operation.untracked",
    ...(sessionId === undefined ? {} : { sessionId }),
    message:
      sessionId === undefined
        ? "select a session before reading its conversation operation"
        : "no conversation operation is tracked for this session"
  }
}

function rejected(
  reason: ProductAppConversationOperationRejectedResult["reason"],
  message: string,
  sessionId?: string,
  operation?: ProductAppConversationOperationReadModel
): ProductAppConversationOperationRejectedResult {
  return {
    kind: "product-app.conversation-operation.rejected",
    reason,
    message,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(operation === undefined ? {} : { operation })
  }
}

function stableOpaqueId(
  kind: "operation" | "row",
  reference: ProductAppTrustedConversationOperationReference,
  suffix = ""
): string {
  const digest = createHash("sha256")
    .update(
      [
        reference.sessionId,
        reference.inputId,
        reference.turnId,
        reference.jobId,
        suffix
      ].join("\u0000"),
      "utf8"
    )
    .digest("hex")
    .slice(0, 24)
  return `product_conversation_${kind}_${digest}`
}

function normalizeRequiredString(value: string, name: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${name} must not be empty`)
  }
  return value
}
