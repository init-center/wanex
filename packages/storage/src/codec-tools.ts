import type {
  BeginToolExecutionRequest,
  FinishToolExecutionRequest,
  JsonValue,
  ListToolActivitiesRequest,
  ListToolExecutionAttemptsRequest,
  ListToolExecutionsRequest,
  ToolExecutionAttemptRecord,
  ToolExecutionAttemptState,
  ToolExecutionApprovalDecision,
  ToolExecutionApprovalDecisionRecord,
  ToolExecutionRecord,
  ToolExecutionRecoveryDecision,
  ToolExecutionRecoveryDecisionRecord,
  ToolExecutionRecoveryEvidence,
  ToolExecutionState,
  ToolActivityEvidence,
  ToolActivityPresentation,
  ToolActivityRecord,
  ToolResultContentPart
} from "@wanex/protocol"
import { normalizeToolActivityPresentation } from "@wanex/protocol"
import {
  expectBoolean,
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"
import type {
  BeginToolExecutionWire,
  FinishToolExecutionWire,
  ListToolExecutionAttemptsWire,
  ListToolExecutionsWire,
  ListToolActivitiesWire,
  RequireToolExecutionRecoveryWire,
  ResolveToolExecutionApprovalWire,
  ResolveToolExecutionRecoveryWire,
  ToolResultContentPartWire,
  ToolActivityEvidenceWire,
  ToolActivityPresentationWire,
} from "./generated/storage-rpc.js"
import { toRpcJsonValue } from "./codec-common.js"
import { canonicalJson, digestCanonicalJson } from "./codec-canonical.js"
import {
  fromRpcResourceInputEvidence,
  resourceInputEvidenceJson,
  toRpcResourceInputEvidence
} from "./codec-resource.js"

export function fromRpcToolExecutionRecord(value: JsonValue): ToolExecutionRecord {
  if (!isRecord(value)) throw new Error("tool execution must be an object")
  const content = decodeToolResultContentPair(
    value.content,
    value.content_digest,
    "tool execution"
  )
  return withOptionalFields(
    {
      id: expectString(value.id, "tool_execution.id"),
      sessionId: expectString(value.session_id, "tool_execution.session_id"),
      turnId: expectString(value.turn_id, "tool_execution.turn_id"),
      inputId: expectString(value.input_id, "tool_execution.input_id"),
      sourceMessageId: expectString(
        value.source_message_id,
        "tool_execution.source_message_id"
      ),
      principalId: expectString(value.principal_id, "tool_execution.principal_id"),
      toolCallId: expectString(value.tool_call_id, "tool_execution.tool_call_id"),
      toolName: expectString(value.tool_name, "tool_execution.tool_name"),
      input: value.input ?? null,
      descriptor: value.descriptor ?? null,
      permission: value.permission ?? null,
      state: expectToolExecutionState(value.state),
      attemptCount: expectNumber(value.attempt_count, "tool_execution.attempt_count"),
      idempotencyKey: expectString(value.idempotency_key, "tool_execution.idempotency_key"),
      approvalRevision: expectNumber(
        value.approval_revision,
        "tool_execution.approval_revision"
      ),
      recoveryRevision: expectNumber(
        value.recovery_revision,
        "tool_execution.recovery_revision"
      ),
      createdAt: expectNumber(value.created_at, "tool_execution.created_at"),
      updatedAt: expectNumber(value.updated_at, "tool_execution.updated_at")
    },
    {
      currentInvocationAttemptId: optionalString(
        value.current_invocation_attempt_id,
        "tool_execution.current_invocation_attempt_id"
      ),
      activity:
        value.activity === null || value.activity === undefined
          ? undefined
          : fromRpcToolActivityEvidence(value.activity),
      recovery:
        value.recovery === null || value.recovery === undefined
          ? undefined
          : fromRpcToolExecutionRecoveryEvidence(value.recovery),
      content: content?.content,
      contentDigest: content?.contentDigest,
      isError:
        value.is_error === null || value.is_error === undefined
          ? undefined
          : expectBoolean(value.is_error, "tool_execution.is_error"),
      error: value.error === null || value.error === undefined ? undefined : value.error,
      finishedAt: optionalNumber(value.finished_at, "tool_execution.finished_at")
    }
  )
}

export function fromRpcToolActivityRecord(value: JsonValue): ToolActivityRecord {
  if (!isRecord(value)) throw new Error("tool activity must be an object")
  return withOptionalFields(
    {
      sessionId: expectString(value.session_id, "tool_activity.session_id"),
      turnId: expectString(value.turn_id, "tool_activity.turn_id"),
      sourceMessageId: expectString(
        value.source_message_id,
        "tool_activity.source_message_id"
      ),
      toolCallId: expectString(value.tool_call_id, "tool_activity.tool_call_id"),
      toolName: expectString(value.tool_name, "tool_activity.tool_name"),
      state: expectToolExecutionState(value.state),
      updatedAt: expectNumber(value.updated_at, "tool_activity.updated_at")
    },
    {
      activity:
        value.activity === null || value.activity === undefined
          ? undefined
          : fromRpcToolActivityEvidence(value.activity)
    }
  )
}

export function fromRpcToolActivityEvidence(value: JsonValue): ToolActivityEvidence {
  if (!isRecord(value)) throw new Error("tool activity evidence must be an object")
  return withOptionalFields(
    { call: fromRpcToolActivityPresentation(value.call, "tool_activity.call") },
    {
      result:
        value.result === null || value.result === undefined
          ? undefined
          : fromRpcToolActivityPresentation(value.result, "tool_activity.result")
    }
  )
}

function fromRpcToolActivityPresentation(
  value: JsonValue | undefined,
  path: string
): ToolActivityPresentation {
  if (!isRecord(value)) throw new Error(`${path} must be an object`)
  const rawDetails = value.details
  const details = rawDetails === null || rawDetails === undefined
    ? undefined
    : Array.isArray(rawDetails)
      ? rawDetails.map((detail, index) => {
          if (!isRecord(detail)) throw new Error(`${path}.details[${index}] must be an object`)
          return {
            label: expectString(detail.label, `${path}.details[${index}].label`),
            value: expectString(detail.value, `${path}.details[${index}].value`)
          }
        })
      : (() => { throw new Error(`${path}.details must be an array`) })()
  return normalizeToolActivityPresentation({
    summary: expectString(value.summary, `${path}.summary`),
    ...(details === undefined ? {} : { details })
  }, path)
}

export function fromRpcToolExecutionRecoveryEvidence(
  value: JsonValue
): ToolExecutionRecoveryEvidence {
  if (!isRecord(value) || value.type !== "ambiguous_tool_outcome") {
    throw new Error("tool execution recovery evidence is invalid")
  }
  return withOptionalFields(
    {
      type: "ambiguous_tool_outcome" as const,
      message: expectString(value.message, "tool recovery evidence.message")
    },
    {
      reconciliationRef: optionalString(
        value.reconciliationRef,
        "tool recovery evidence.reconciliationRef"
      ),
      metadata: value.metadata === undefined ? undefined : value.metadata
    }
  )
}

export function fromRpcToolExecutionRecoveryDecisionRecord(
  value: JsonValue
): ToolExecutionRecoveryDecisionRecord {
  if (!isRecord(value)) {
    throw new Error("tool execution recovery decision must be an object")
  }
  const content = decodeToolResultContentPair(
    value.content,
    value.content_digest,
    "tool recovery decision"
  )
  return withOptionalFields(
    {
      id: expectString(value.id, "tool recovery decision.id"),
      executionId: expectString(
        value.execution_id,
        "tool recovery decision.execution_id"
      ),
      recoveryRevision: expectNumber(
        value.recovery_revision,
        "tool recovery decision.recovery_revision"
      ),
      decision: expectToolExecutionRecoveryDecision(value.decision),
      principalId: expectString(
        value.principal_id,
        "tool recovery decision.principal_id"
      ),
      reason: expectString(value.reason, "tool recovery decision.reason"),
      idempotencyKey: expectString(
        value.idempotency_key,
        "tool recovery decision.idempotency_key"
      ),
      action: expectToolExecutionRecoveryAction(value.action),
      createdAt: expectNumber(value.created_at, "tool recovery decision.created_at")
    },
    {
      content: content?.content,
      contentDigest: content?.contentDigest,
      error: value.error === null || value.error === undefined ? undefined : value.error
    }
  )
}

export function fromRpcToolExecutionApprovalDecisionRecord(
  value: JsonValue
): ToolExecutionApprovalDecisionRecord {
  if (!isRecord(value)) {
    throw new Error("tool execution approval decision must be an object")
  }
  const action = expectString(value.action, "tool approval decision.action")
  if (action !== "turn_requeued") {
    throw new Error("tool approval decision action is invalid")
  }
  return {
    id: expectString(value.id, "tool approval decision.id"),
    executionId: expectString(
      value.execution_id,
      "tool approval decision.execution_id"
    ),
    approvalRevision: expectNumber(
      value.approval_revision,
      "tool approval decision.approval_revision"
    ),
    decision: expectToolExecutionApprovalDecision(value.decision),
    principalId: expectString(
      value.principal_id,
      "tool approval decision.principal_id"
    ),
    reason: expectString(value.reason, "tool approval decision.reason"),
    idempotencyKey: expectString(
      value.idempotency_key,
      "tool approval decision.idempotency_key"
    ),
    action,
    createdAt: expectNumber(value.created_at, "tool approval decision.created_at")
  }
}

export function fromRpcToolExecutionAttemptRecord(
  value: JsonValue
): ToolExecutionAttemptRecord {
  if (!isRecord(value)) throw new Error("tool execution attempt must be an object")
  return withOptionalFields(
    {
      id: expectString(value.id, "tool_attempt.id"),
      executionId: expectString(value.execution_id, "tool_attempt.execution_id"),
      sessionAttemptId: expectString(
        value.session_attempt_id,
        "tool_attempt.session_attempt_id"
      ),
      jobId: expectString(value.job_id, "tool_attempt.job_id"),
      workerId: expectString(value.worker_id, "tool_attempt.worker_id"),
      attemptNumber: expectNumber(
        value.attempt_number,
        "tool_attempt.attempt_number"
      ),
      state: expectToolExecutionAttemptState(value.state),
      startedAt: expectNumber(value.started_at, "tool_attempt.started_at"),
      updatedAt: expectNumber(value.updated_at, "tool_attempt.updated_at")
    },
    {
      error: value.error === null || value.error === undefined ? undefined : value.error,
      finishedAt: optionalNumber(value.finished_at, "tool_attempt.finished_at")
    }
  )
}

export function toRpcBeginToolExecutionRequest(
  request: BeginToolExecutionRequest
): BeginToolExecutionWire {
  return {
    session_id: request.sessionId,
    turn_id: request.turnId,
    attempt_id: request.attemptId,
    input_id: request.inputId,
    source_message_id: request.sourceMessageId,
    job_id: request.jobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    principal_id: request.principalId,
    tool_call_id: request.toolCallId,
    tool_name: request.toolName,
    input: toRpcJsonValue(request.input),
    descriptor: toRpcJsonValue(request.descriptor),
    permission: toRpcJsonValue(request.permission),
    activity:
      request.activity === undefined
        ? null
        : toRpcToolActivityEvidence(request.activity),
    state: request.state,
    idempotency_key: request.idempotencyKey
  }
}

export function toRpcFinishToolExecutionRequest(
  request: FinishToolExecutionRequest
): FinishToolExecutionWire {
  const content = encodeToolResultContentPair(
    request.content,
    request.contentDigest,
    "tool execution finish"
  )
  return {
    session_id: request.sessionId,
    turn_id: request.turnId,
    session_attempt_id: request.sessionAttemptId,
    input_id: request.inputId,
    job_id: request.jobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    execution_id: request.executionId,
    invocation_attempt_id: request.invocationAttemptId,
    state: request.state,
    content: content.content,
    content_digest: content.contentDigest,
    is_error: request.isError ?? null,
    result_presentation:
      request.resultPresentation === undefined
        ? null
        : toRpcToolActivityPresentation(request.resultPresentation),
    error: request.error === undefined ? null : toRpcJsonValue(request.error)
  }
}

export function toRpcRequireToolExecutionRecoveryRequest(
  request: import("@wanex/protocol").RequireToolExecutionRecoveryRequest
): RequireToolExecutionRecoveryWire {
  return {
    session_id: request.sessionId,
    turn_id: request.turnId,
    session_attempt_id: request.sessionAttemptId,
    input_id: request.inputId,
    job_id: request.jobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    execution_id: request.executionId,
    invocation_attempt_id: request.invocationAttemptId,
    evidence: toRpcJsonValue(request.evidence as unknown as JsonValue)
  }
}

export function toRpcResolveToolExecutionRecoveryRequest(
  request: import("@wanex/protocol").ResolveToolExecutionRecoveryRequest
): ResolveToolExecutionRecoveryWire {
  const content = encodeToolResultContentPair(
    request.content,
    request.contentDigest,
    "tool recovery resolution"
  )
  return {
    execution_id: request.executionId,
    expected_recovery_revision: request.expectedRecoveryRevision,
    decision: request.decision,
    principal_id: request.principalId,
    reason: request.reason,
    idempotency_key: request.idempotencyKey,
    content: content.content,
    content_digest: content.contentDigest,
    error: request.error === undefined ? null : toRpcJsonValue(request.error)
  }
}

export function toRpcResolveToolExecutionApprovalRequest(
  request: import("@wanex/protocol").ResolveToolExecutionApprovalRequest
): ResolveToolExecutionApprovalWire {
  return {
    execution_id: request.executionId,
    expected_approval_revision: request.expectedApprovalRevision,
    decision: request.decision,
    principal_id: request.principalId,
    reason: request.reason,
    idempotency_key: request.idempotencyKey
  }
}

export function toRpcListToolExecutionsRequest(
  request: ListToolExecutionsRequest
): ListToolExecutionsWire {
  return {
    session_id: request.sessionId ?? null,
    turn_id: request.turnId ?? null,
    state: request.state ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcListToolActivitiesRequest(
  request: ListToolActivitiesRequest
): ListToolActivitiesWire {
  if (request.sourceMessageIds.length === 0) {
    throw new Error("tool activity sourceMessageIds must not be empty")
  }
  return {
    session_id: request.sessionId,
    source_message_ids: [...request.sourceMessageIds] as [string, ...string[]]
  }
}

function toRpcToolActivityEvidence(
  value: ToolActivityEvidence
): ToolActivityEvidenceWire {
  return {
    call: toRpcToolActivityPresentation(value.call),
    result:
      value.result === undefined
        ? null
        : toRpcToolActivityPresentation(value.result)
  }
}

function toRpcToolActivityPresentation(
  value: ToolActivityPresentation
): ToolActivityPresentationWire {
  const normalized = normalizeToolActivityPresentation(value)
  const details = normalized.details === undefined
    ? null
    : normalized.details.map((detail) => ({ ...detail })) as NonNullable<
        ToolActivityPresentationWire["details"]
      >
  return {
    summary: normalized.summary,
    details
  }
}

export function toRpcListToolExecutionAttemptsRequest(
  request: ListToolExecutionAttemptsRequest
): ListToolExecutionAttemptsWire {
  return { execution_id: request.executionId }
}

function expectToolExecutionState(value: JsonValue | undefined): ToolExecutionState {
  if (
    value !== "running" && value !== "waiting" && value !== "retry_ready" &&
    value !== "approved" && value !== "denied" &&
    value !== "approval_required" && value !== "succeeded" &&
    value !== "failed" && value !== "cancelled" &&
    value !== "recovery_required"
  ) {
    throw new Error("tool_execution.state is invalid")
  }
  return value
}

function expectToolExecutionApprovalDecision(
  value: JsonValue | undefined
): ToolExecutionApprovalDecision {
  if (value !== "approve_once" && value !== "deny") {
    throw new Error("tool approval decision is invalid")
  }
  return value
}

function expectToolExecutionAttemptState(
  value: JsonValue | undefined
): ToolExecutionAttemptState {
  if (
    value !== "running" && value !== "suspended" && value !== "succeeded" && value !== "failed" &&
    value !== "cancelled" && value !== "interrupted" &&
    value !== "recovery_required"
  ) {
    throw new Error("tool_execution_attempt.state is invalid")
  }
  return value
}

function expectToolExecutionRecoveryDecision(
  value: JsonValue | undefined
): ToolExecutionRecoveryDecision {
  if (
    value !== "confirm_succeeded" && value !== "confirm_failed" &&
    value !== "retry" && value !== "abandon_turn"
  ) {
    throw new Error("tool recovery decision is invalid")
  }
  return value
}

function expectToolExecutionRecoveryAction(
  value: JsonValue | undefined
): ToolExecutionRecoveryDecisionRecord["action"] {
  if (
    value !== "waiting_for_other_recovery" && value !== "turn_requeued" &&
    value !== "turn_abandoned"
  ) {
    throw new Error("tool recovery decision action is invalid")
  }
  return value
}

const MAX_TOOL_RESULT_PARTS = 64
const MAX_TOOL_RESULT_PART_BYTES = 262_144
const MAX_TOOL_RESULT_INLINE_BYTES = 1_048_576

function encodeToolResultContentPair(
  content: readonly ToolResultContentPart[] | undefined,
  contentDigest: string | undefined,
  name: string
): {
  readonly content: [ToolResultContentPartWire, ...ToolResultContentPartWire[]] | null
  readonly contentDigest: string | null
} {
  if (content === undefined && contentDigest === undefined) {
    return { content: null, contentDigest: null }
  }
  if (content === undefined || contentDigest === undefined) {
    throw new Error(`${name} content and contentDigest must be provided together`)
  }
  const normalized = validateToolResultContent(content, name)
  const actual = toolResultContentDigest(normalized)
  if (contentDigest !== actual) throw new Error(`${name} contentDigest is invalid`)
  const wire = normalized.map((part): ToolResultContentPartWire => {
    if (part.type === "text") return { type: part.type, text: part.text }
    if (part.type === "json") {
      return { type: part.type, value: toRpcJsonValue(part.value) }
    }
    return { type: part.type, ...toRpcResourceInputEvidence(part) }
  })
  return {
    content: wire as [ToolResultContentPartWire, ...ToolResultContentPartWire[]],
    contentDigest
  }
}

function decodeToolResultContentPair(
  content: JsonValue | undefined,
  contentDigest: JsonValue | undefined,
  name: string
): { readonly content: readonly ToolResultContentPart[]; readonly contentDigest: string } | undefined {
  const missingContent = content === null || content === undefined
  const missingDigest = contentDigest === null || contentDigest === undefined
  if (missingContent && missingDigest) return undefined
  if (missingContent || missingDigest) {
    throw new Error(`${name} content and content_digest must be present together`)
  }
  if (!Array.isArray(content)) throw new Error(`${name}.content must be an array`)
  const decoded = content.map((part, index): ToolResultContentPart => {
    if (!isRecord(part)) throw new Error(`${name}.content.${index} must be an object`)
    if (part.type === "text") {
      return { type: part.type, text: expectString(part.text, `${name}.content.${index}.text`) }
    }
    if (part.type === "json") {
      if (!("value" in part)) throw new Error(`${name}.content.${index}.value is required`)
      return { type: part.type, value: part.value as JsonValue }
    }
    if (part.type !== "resource") {
      throw new Error(`${name}.content.${index}.type is invalid`)
    }
    return {
      type: part.type,
      ...fromRpcResourceInputEvidence(part, `${name}.content.${index}`)
    }
  })
  const normalized = validateToolResultContent(decoded, name)
  const digest = expectString(contentDigest, `${name}.content_digest`)
  if (digest !== toolResultContentDigest(normalized)) {
    throw new Error(`${name}.content_digest is invalid`)
  }
  return { content: normalized, contentDigest: digest }
}

function validateToolResultContent(
  content: readonly ToolResultContentPart[],
  name: string
): readonly ToolResultContentPart[] {
  if (content.length === 0 || content.length > MAX_TOOL_RESULT_PARTS) {
    throw new Error(`${name} content must contain 1 to ${MAX_TOOL_RESULT_PARTS} parts`)
  }
  let inlineBytes = 0
  const resources = new Set<string>()
  for (const part of content) {
    if (part.type === "text") {
      const size = Buffer.byteLength(part.text)
      if (size === 0 || size > MAX_TOOL_RESULT_PART_BYTES) {
        throw new Error(`${name} text part has an invalid UTF-8 size`)
      }
      inlineBytes += size
      continue
    }
    if (part.type === "json") {
      const size = Buffer.byteLength(canonicalJson(part.value))
      if (size > MAX_TOOL_RESULT_PART_BYTES) {
        throw new Error(`${name} JSON part exceeds ${MAX_TOOL_RESULT_PART_BYTES} bytes`)
      }
      inlineBytes += size
      continue
    }
    toRpcResourceInputEvidence(part)
    if (resources.has(part.resourceId)) {
      throw new Error(`${name} contains a duplicate resource`)
    }
    resources.add(part.resourceId)
  }
  if (inlineBytes > MAX_TOOL_RESULT_INLINE_BYTES) {
    throw new Error(`${name} inline content exceeds ${MAX_TOOL_RESULT_INLINE_BYTES} bytes`)
  }
  return content
}

function toolResultContentDigest(content: readonly ToolResultContentPart[]): string {
  return digestCanonicalJson(
    content.map((part): JsonValue => {
      if (part.type === "text") return { type: part.type, text: part.text }
      if (part.type === "json") return { type: part.type, value: part.value }
      return { type: part.type, ...resourceInputEvidenceJson(part) }
    })
  )
}
