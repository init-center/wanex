import { projectCommandPreviewFromResult } from "../commands/preview/projection.js"
import { projectCommandExecutionFromResult } from "../commands/execution/projection.js"
import type {
  ConversationSourceResult,
  ConversationHistorySourceResult,
  SideQuerySourceResult,
  WorkbenchSourceResult
} from "../model.js"
import type { SurfaceEnvelopeLike } from "./model.js"

export function isSuccessfulWorkbenchEnvelope(
  value: SurfaceEnvelopeLike
): value is SurfaceEnvelopeLike & {
  readonly ok: true
  readonly value: WorkbenchSourceResult
} {
  if (!value.ok || !isRecord(value.value)) {
    return false
  }
  return (
    value.value.kind === "assistant.workbench.opened" ||
    value.value.kind === "assistant.workbench.no-session" ||
    value.value.kind === "assistant.workbench.failed"
  )
}

export function isSuccessfulConversationEnvelope(
  value: SurfaceEnvelopeLike
): value is SurfaceEnvelopeLike & {
  readonly ok: true
  readonly value: ConversationSourceResult
} {
  return value.ok && isConversationSourceResult(value.value)
}

export function isSuccessfulConversationHistoryEnvelope(
  value: SurfaceEnvelopeLike
): value is SurfaceEnvelopeLike & {
  readonly ok: true
  readonly value: ConversationHistorySourceResult
} {
  return (
    value.ok &&
    isRecord(value.value) &&
    (value.value.kind === "assistant.session-transcript.found" ||
      value.value.kind === "assistant.session-transcript.no-session")
  )
}

export function isConversationSourceResult(
  value: unknown
): value is ConversationSourceResult {
  return (
    isRecord(value) &&
    (value.kind === "assistant.conversation-operation.found" ||
      value.kind === "assistant.conversation-operation.untracked" ||
      value.kind === "assistant.conversation-operation.missing" ||
      value.kind === "assistant.conversation-operation.rejected" ||
      value.kind === "assistant.conversation-operation.cancel" ||
      value.kind === "assistant.conversation-approval.resolved" ||
      value.kind === "assistant.conversation-recovery.resolved")
  )
}

export function isSuccessfulSideQueryEnvelope(
  value: SurfaceEnvelopeLike
): value is SurfaceEnvelopeLike & {
  readonly ok: true
  readonly value: SideQuerySourceResult
} {
  if (!value.ok || !isRecord(value.value)) {
    return false
  }
  return (
    value.value.kind === "assistant.side-query" ||
    value.value.kind === "assistant.side-query.found" ||
    value.value.kind === "assistant.side-query.missing" ||
    value.value.kind === "assistant.side-query.dismissed"
  )
}

export function conversationResult(
  result: ConversationSourceResult
): Exclude<
  ConversationSourceResult,
  {
    readonly kind:
      | "assistant.conversation-operation.cancel"
      | "assistant.conversation-approval.resolved"
      | "assistant.conversation-recovery.resolved"
  }
> {
  return result.kind === "assistant.conversation-operation.cancel" ||
    result.kind === "assistant.conversation-approval.resolved" ||
    result.kind === "assistant.conversation-recovery.resolved"
    ? result.operation
    : result
}

export function isSuccessfulCommandPreviewEnvelope(
  value: SurfaceEnvelopeLike
): value is SurfaceEnvelopeLike & {
  readonly ok: true
  readonly value: Parameters<
    typeof projectCommandPreviewFromResult
  >[0]["preview"]
} {
  if (!value.ok || !isRecord(value.value)) {
    return false
  }
  return (
    (value.value.kind === "runnable" || value.value.kind === "rejected") &&
    typeof value.value.commandId === "string"
  )
}

export function isSuccessfulCommandExecutionEnvelope(
  value: SurfaceEnvelopeLike
): value is SurfaceEnvelopeLike & {
  readonly ok: true
  readonly value: Parameters<typeof projectCommandExecutionFromResult>[0]
} {
  if (!value.ok || !isRecord(value.value)) {
    return false
  }
  return (
    (value.value.kind === "completed" ||
      value.value.kind === "submitted" ||
      value.value.kind === "rejected") &&
    typeof value.value.commandId === "string"
  )
}

export type CommandPreviewLike =
  | {
      readonly kind: "runnable"
      readonly commandId: string
    }
  | {
      readonly kind: "rejected"
      readonly commandId: string
      readonly message: string
    }

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
