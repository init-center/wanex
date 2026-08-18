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
    value.value.kind === "product.workbench.opened" ||
    value.value.kind === "product.workbench.no-session" ||
    value.value.kind === "product.workbench.failed"
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
    (value.value.kind === "product.session-transcript.found" ||
      value.value.kind === "product.session-transcript.no-session")
  )
}

export function isConversationSourceResult(
  value: unknown
): value is ConversationSourceResult {
  return (
    isRecord(value) &&
    (value.kind === "product.conversation-operation.found" ||
      value.kind === "product.conversation-operation.untracked" ||
      value.kind === "product.conversation-operation.missing" ||
      value.kind === "product.conversation-operation.rejected" ||
      value.kind === "product.conversation-operation.cancel" ||
      value.kind === "product.conversation-approval.resolved" ||
      value.kind === "product.conversation-recovery.resolved")
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
    value.value.kind === "product.side-query" ||
    value.value.kind === "product.side-query.found" ||
    value.value.kind === "product.side-query.missing" ||
    value.value.kind === "product.side-query.dismissed"
  )
}

export function conversationResult(
  result: ConversationSourceResult
): Exclude<
  ConversationSourceResult,
  {
    readonly kind:
      | "product.conversation-operation.cancel"
      | "product.conversation-approval.resolved"
      | "product.conversation-recovery.resolved"
  }
> {
  return result.kind === "product.conversation-operation.cancel" ||
    result.kind === "product.conversation-approval.resolved" ||
    result.kind === "product.conversation-recovery.resolved"
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
    (value.value.kind === "completed" || value.value.kind === "rejected") &&
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
