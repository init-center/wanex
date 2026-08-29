import { createHash } from "node:crypto"
import type { BackendShell } from "@wanex/assistant/backend"
import {
  resolveSessionId,
  type StateCoordinator
} from "../state/assistant.js"
import {
  conversationRecoveryId,
  projectConversationOperation,
  readTrackedConversationOperation
} from "./operation.js"
import type {
  ConversationOperationReadModel,
  ConversationOperationRejectedResult,
  ResolveTrackedConversationRecoveryRequest,
  ResolveTrackedConversationRecoveryResult
} from "./model.js"

const MAX_RECOVERY_JSON_BYTES = 32_768
const MAX_RECOVERY_REASON_BYTES = 4_096

export async function resolveTrackedConversationRecovery(request: {
  readonly backend: BackendShell
  readonly state: StateCoordinator
  readonly input: ResolveTrackedConversationRecoveryRequest
}): Promise<ResolveTrackedConversationRecoveryResult> {
  const sessionId = resolveSessionId(
    request.state.state,
    request.input.sessionId
  )
  if (sessionId === undefined) {
    return rejected("no_session", "select a session before reviewing recovery")
  }
  const reference = request.state.state.trackedConversationOperations[sessionId]
  if (reference === undefined) {
    return rejected(
      "recovery_not_found",
      "no tracked recovery exists for this session",
      sessionId
    )
  }
  const source = await request.backend.commands.readConversationOperation(reference)
  if (source.kind === "missing") {
    return rejected(
      "operation_not_found",
      "the tracked conversation operation no longer exists",
      sessionId
    )
  }
  const projected = projectConversationOperation(source)
  const trustedRecovery = source.operation.recovery?.items.find(
    (item) =>
      conversationRecoveryId(reference, item.executionId) ===
      request.input.recoveryId
  )
  if (trustedRecovery === undefined) {
    return rejected(
      "recovery_not_found",
      "the requested recovery item is not current",
      sessionId,
      projected.operation
    )
  }
  if (
    !Number.isSafeInteger(request.input.expectedRecoveryRevision) ||
    request.input.expectedRecoveryRevision <= 0 ||
    trustedRecovery.recoveryRevision !== request.input.expectedRecoveryRevision
  ) {
    return rejected(
      "recovery_revision_stale",
      "the recovery review changed; refresh before deciding",
      sessionId,
      projected.operation
    )
  }
  if (!trustedRecovery.availableDecisions.includes(request.input.decision)) {
    return rejected(
      "recovery_action_unavailable",
      "the requested recovery decision is not available",
      sessionId,
      projected.operation
    )
  }
  const payloadError = validateAssistantRecoveryPayload(request.input)
  if (payloadError !== undefined) {
    return rejected(
      "invalid_recovery_payload",
      payloadError,
      sessionId,
      projected.operation
    )
  }
  const reason = request.input.reason.trim()
  const receipt = await request.backend.commands.resolveConversationOperationRecovery({
    ...reference,
    executionId: trustedRecovery.executionId,
    expectedRecoveryRevision: request.input.expectedRecoveryRevision,
    decision: request.input.decision,
    reason,
    idempotencyKey:
      request.input.idempotencyKey ??
      assistantRecoveryDecisionIdempotencyKey(
        projected.operation.operationId,
        request.input,
        reason
      ),
    ...(request.input.content === undefined
      ? {}
      : { content: request.input.content }),
    ...(request.input.error === undefined
      ? {}
      : { error: request.input.error })
  })
  return {
    kind: "assistant.conversation-recovery.resolved",
    decision: receipt.decision,
    action: receipt.action,
    operation: await readTrackedConversationOperation({
      backend: request.backend,
      state: request.state,
      input: { sessionId }
    })
  }
}

function validateAssistantRecoveryPayload(
  input: ResolveTrackedConversationRecoveryRequest
): string | undefined {
  const reason = input.reason.trim()
  if (reason.length === 0) return "recovery reason must not be empty"
  if (Buffer.byteLength(reason, "utf8") > MAX_RECOVERY_REASON_BYTES) {
    return "recovery reason exceeds 4096 bytes"
  }
  const confirms =
    input.decision === "confirm_succeeded" ||
    input.decision === "confirm_failed"
  if (confirms && input.content === undefined) {
    return "confirmed recovery requires canonical content"
  }
  if (!confirms && (input.content !== undefined || input.error !== undefined)) {
    return "retry and abandon recovery cannot include content data"
  }
  for (const [label, value] of [
    ["content", input.content],
    ["error", input.error]
  ] as const) {
    if (
      value !== undefined &&
      Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_RECOVERY_JSON_BYTES
    ) {
      return `recovery ${label} exceeds ${MAX_RECOVERY_JSON_BYTES} bytes`
    }
  }
  return undefined
}

function assistantRecoveryDecisionIdempotencyKey(
  operationId: string,
  input: ResolveTrackedConversationRecoveryRequest,
  reason: string
): string {
  const digest = createHash("sha256")
    .update(stableJson({
      operationId,
      recoveryId: input.recoveryId,
      expectedRecoveryRevision: input.expectedRecoveryRevision,
      decision: input.decision,
      reason,
      content: input.content ?? null,
      error: input.error ?? null
    }))
    .digest("hex")
  return `assistant:recovery:${digest}`
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  return `{${Object.entries(value as Readonly<Record<string, unknown>>)
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`
}

function rejected(
  reason: ConversationOperationRejectedResult["reason"],
  message: string,
  sessionId?: string,
  operation?: ConversationOperationReadModel
): ConversationOperationRejectedResult {
  return {
    kind: "assistant.conversation-operation.rejected",
    reason,
    message,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(operation === undefined ? {} : { operation })
  }
}
