import { randomUUID } from "node:crypto"
import type {
  ConversationApprovalDecision,
  ConversationOperationFoundResult,
  ConversationOperationReadModel
} from "@wanex/assistant"
import type {
  ReadTrackedConversationOperationResult,
  SurfaceClient
} from "@wanex/assistant/surface"

export type TuiComposerMode = "submit" | "queue" | "guide"

export interface TuiConversationActionContext {
  readonly client: Pick<
    SurfaceClient,
    | "submitConversationOperation"
    | "queueGuidedFollowUp"
    | "steerTrackedConversationOperation"
    | "cancelTrackedConversationOperation"
  >
  readonly sessionId?: string
  readonly operation?: ConversationOperationReadModel
  readonly hasAttachments?: boolean
}

export interface TuiConversationActionResult {
  readonly mode: TuiComposerMode
  readonly accepted: boolean
  readonly sessionId?: string
  readonly operation?: ConversationOperationReadModel
  readonly message?: string
}

export async function submitTuiConversationText(
  context: TuiConversationActionContext,
  mode: TuiComposerMode,
  text: string
): Promise<TuiConversationActionResult> {
  const normalized = text.trim()
  if (
    normalized.length === 0 &&
    !(mode === "submit" && context.hasAttachments === true)
  ) {
    return { mode, accepted: false, message: "Message must not be empty" }
  }
  if (mode !== "submit" && context.operation === undefined) {
    return {
      mode,
      accepted: false,
      message:
        mode === "queue"
          ? "Queue after current requires active work"
          : "Guide current requires active steerable work"
    }
  }

  const envelope =
    mode === "submit"
      ? await context.client.submitConversationOperation({
          text: normalized,
          ...(context.sessionId === undefined
            ? {}
            : { sessionId: context.sessionId })
        })
      : mode === "queue"
        ? await context.client.queueGuidedFollowUp({
            operationId: context.operation!.operationId,
            sessionId: context.operation!.sessionId,
            text: normalized
          })
        : await context.client.steerTrackedConversationOperation(
            {
              operationId: context.operation!.operationId,
              sessionId: context.operation!.sessionId,
              text: normalized
            },
            { requestId: `tui-steer-${randomUUID()}` }
          )
  const value = expectSurfaceValue(envelope, modeCommand(mode))
  if (value.kind === "assistant.conversation-operation.rejected") {
    return {
      mode,
      accepted: false,
      ...(value.sessionId === undefined ? {} : { sessionId: value.sessionId }),
      ...(value.operation === undefined ? {} : { operation: value.operation }),
      message: value.message
    }
  }
  return foundResult(mode, value)
}

export async function stopTuiConversation(
  context: TuiConversationActionContext
): Promise<TuiConversationActionResult> {
  const value = expectSurfaceValue(
    await context.client.cancelTrackedConversationOperation({
      reason: "user requested cancellation from TUI",
      ...(context.sessionId === undefined
        ? {}
        : { sessionId: context.sessionId })
    }),
    "cancelTrackedConversationOperation"
  )
  const operation = foundOperation(value.operation)
  const accepted =
    value.status === "cancelled" || value.status === "cancel_requested"
  return {
    mode: "submit",
    accepted,
    ...(operation === undefined
      ? {}
      : { sessionId: operation.sessionId, operation }),
    ...(accepted
      ? {}
      : { message: `Conversation is ${value.status.replaceAll("_", " ")}` })
  }
}

export async function resolveTuiApproval(options: {
  readonly client: Pick<SurfaceClient, "resolveTrackedConversationApproval">
  readonly operation: ConversationOperationReadModel
  readonly approvalId: string
  readonly expectedApprovalRevision: number
  readonly decision: ConversationApprovalDecision
}): Promise<TuiConversationActionResult> {
  const value = expectSurfaceValue(
    await options.client.resolveTrackedConversationApproval({
      sessionId: options.operation.sessionId,
      approvalId: options.approvalId,
      expectedApprovalRevision: options.expectedApprovalRevision,
      decision: options.decision,
      reason:
        options.decision === "approve_once"
          ? "approved in TUI"
          : "denied in TUI"
    }),
    "resolveTrackedConversationApproval"
  )
  if (value.kind === "assistant.conversation-operation.rejected") {
    return {
      mode: "submit",
      accepted: false,
      ...(value.sessionId === undefined ? {} : { sessionId: value.sessionId }),
      ...(value.operation === undefined ? {} : { operation: value.operation }),
      message: value.message
    }
  }
  const operation = foundOperation(value.operation)
  return {
    mode: "submit",
    accepted: true,
    ...(operation === undefined
      ? {}
      : { sessionId: operation.sessionId, operation })
  }
}

function foundResult(
  mode: TuiComposerMode,
  value: ConversationOperationFoundResult
): TuiConversationActionResult {
  return {
    mode,
    accepted: true,
    sessionId: value.operation.sessionId,
    operation: value.operation
  }
}

function foundOperation(
  value: ReadTrackedConversationOperationResult
): ConversationOperationReadModel | undefined {
  return value.kind === "assistant.conversation-operation.found"
    ? value.operation
    : undefined
}

function modeCommand(mode: TuiComposerMode): string {
  if (mode === "queue") return "queueGuidedFollowUp"
  if (mode === "guide") return "steerTrackedConversationOperation"
  return "submitConversationOperation"
}

function expectSurfaceValue<T>(
  result:
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: { readonly message: string } },
  command: string
): T {
  if (!result.ok) {
    throw new Error(`${command} failed: ${result.error.message}`)
  }
  return result.value
}
