import type { JsonValue } from "./json.js"
import type { SessionAttemptId, ToolExecutionAttemptId } from "./ids.js"
import type { SchedulerJobRecord } from "./scheduler.js"
import type { SessionAttemptRecord, SessionTurnRecord } from "./session.js"
import type { ToolResultContentPart } from "./message.js"
import type {
  MediaGenerationOperationBinding,
  MediaGenerationOperationRecord
} from "./media-generation.js"
import type {
  DelegationGraphDependencyRecord,
  DelegationGraphNodeRecord,
  DelegationGraphRecord
} from "./delegation.js"
import type {
  TeamDelegationOperationRecord,
  TeamDelegationTaskRecord
} from "./team.js"
import type { SessionTurnExecutionBinding } from "./session.js"

export interface ToolActivityPresentation {
  readonly summary: string
  readonly details?: readonly ToolActivityPresentationDetail[]
}

export interface ToolActivityPresentationDetail {
  readonly label: string
  readonly value: string
}

export interface ToolActivityEvidence {
  readonly call: ToolActivityPresentation
  readonly result?: ToolActivityPresentation
}

export const TOOL_ACTIVITY_PRESENTATION_LIMITS = Object.freeze({
  summaryBytes: 512,
  details: 16,
  detailLabelBytes: 128,
  detailValueBytes: 1_024
})

const TOOL_ACTIVITY_CONTROL_CHARACTER = /\p{Cc}/u

export function normalizeToolActivityPresentation(
  presentation: ToolActivityPresentation,
  label = "tool activity presentation"
): ToolActivityPresentation {
  assertToolActivityText(
    presentation?.summary,
    TOOL_ACTIVITY_PRESENTATION_LIMITS.summaryBytes,
    `${label} summary`
  )
  const details = presentation.details ?? []
  if (!Array.isArray(details) || details.length > TOOL_ACTIVITY_PRESENTATION_LIMITS.details) {
    throw new Error(
      `${label} exceeds ${TOOL_ACTIVITY_PRESENTATION_LIMITS.details} details`
    )
  }
  const normalizedDetails = details.map((detail, index) => {
    assertToolActivityText(
      detail?.label,
      TOOL_ACTIVITY_PRESENTATION_LIMITS.detailLabelBytes,
      `${label} detail ${index + 1} label`
    )
    assertToolActivityText(
      detail.value,
      TOOL_ACTIVITY_PRESENTATION_LIMITS.detailValueBytes,
      `${label} detail ${index + 1} value`
    )
    return Object.freeze({ label: detail.label, value: detail.value })
  })
  return Object.freeze({
    summary: presentation.summary,
    ...(normalizedDetails.length === 0
      ? {}
      : { details: Object.freeze(normalizedDetails) })
  })
}

function assertToolActivityText(
  value: string,
  maximumBytes: number,
  label: string
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    TOOL_ACTIVITY_CONTROL_CHARACTER.test(value) ||
    utf8ByteLength(value) > maximumBytes
  ) {
    throw new Error(
      `${label} must contain 1 to ${maximumBytes} UTF-8 bytes without control characters`
    )
  }
}

function utf8ByteLength(value: string): number {
  let bytes = 0
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    bytes += codePoint <= 0x7f
      ? 1
      : codePoint <= 0x7ff
        ? 2
        : codePoint <= 0xffff
          ? 3
          : 4
  }
  return bytes
}

/**
 * Safe read projection for ordinary Product transcript rendering. It must not
 * grow input, result, descriptor, permission, or execution identity fields.
 */
export interface ToolActivityRecord {
  readonly sessionId: string
  readonly turnId: string
  readonly sourceMessageId: string
  readonly toolCallId: string
  readonly toolName: string
  readonly state: ToolExecutionState
  readonly activity?: ToolActivityEvidence
  readonly updatedAt: number
}

export type ToolExecutionState =
  | "running"
  | "waiting"
  | "retry_ready"
  | "approved"
  | "denied"
  | "approval_required"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "recovery_required"

export interface DeferredMediaGenerationOperationRequest {
  readonly kind: "media_generation"
  readonly binding: MediaGenerationOperationBinding
  readonly priority?: number
}

export interface DeferredTeamDelegationTaskRequest {
  readonly id: string
  readonly graphNodeId: string
  readonly targetParticipantId: string
  readonly targetSessionId: string
  readonly prompt: string
  readonly dependsOnTaskIds: readonly string[]
  readonly childInputId: string
  readonly childTurnId: string
  readonly childJobId: string
  readonly inputIdempotencyKey: string
  readonly jobIdempotencyKey: string
  readonly executionBinding: SessionTurnExecutionBinding
  readonly maxSteps?: number
  readonly priority?: number
}

export interface DeferredTeamDelegationOperationRequest {
  readonly kind: "team_delegation"
  readonly operationId: string
  readonly conversationId: string
  readonly sourceDeliveryId: string
  readonly leadParticipantId: string
  readonly graphId: string
  readonly tasks: readonly DeferredTeamDelegationTaskRequest[]
}

export type DeferredToolOperationRequest =
  | DeferredMediaGenerationOperationRequest
  | DeferredTeamDelegationOperationRequest

export interface DeferredMediaGenerationOperationReceipt {
  readonly kind: "media_generation"
  readonly record: MediaGenerationOperationRecord
  readonly job: SchedulerJobRecord
}

export interface DeferredTeamDelegationOperationReceipt {
  readonly kind: "team_delegation"
  readonly record: TeamDelegationOperationRecord
  readonly tasks: readonly TeamDelegationTaskRecord[]
  readonly graph: DelegationGraphRecord
  readonly nodes: readonly DelegationGraphNodeRecord[]
  readonly dependencies: readonly DelegationGraphDependencyRecord[]
  readonly jobs: readonly SchedulerJobRecord[]
}

export type DeferredToolOperationReceipt =
  | DeferredMediaGenerationOperationReceipt
  | DeferredTeamDelegationOperationReceipt

export interface DeferToolExecutionRequest {
  readonly sessionId: string
  readonly turnId: string
  readonly sessionAttemptId: string
  readonly inputId: string
  readonly sourceMessageId: string
  readonly sessionJobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly toolExecutionId: string
  readonly toolInvocationAttemptId: string
  readonly toolCallId: string
  readonly operation: DeferredToolOperationRequest
}

export interface DeferToolExecutionReceipt {
  readonly turn: SessionTurnRecord
  readonly sessionAttempt: SessionAttemptRecord
  readonly sessionJob: SchedulerJobRecord
  readonly toolExecution: ToolExecutionRecord
  readonly toolInvocationAttempt: ToolExecutionAttemptRecord
  readonly operation: DeferredToolOperationReceipt
}

export interface ToolExecutionRecord {
  readonly id: string
  readonly sessionId: string
  readonly turnId: string
  readonly inputId: string
  readonly sourceMessageId: string
  readonly principalId: string
  readonly toolCallId: string
  readonly toolName: string
  readonly input: JsonValue
  readonly descriptor: JsonValue
  readonly permission: JsonValue
  readonly activity?: ToolActivityEvidence
  readonly state: ToolExecutionState
  readonly currentInvocationAttemptId?: ToolExecutionAttemptId
  readonly attemptCount: number
  readonly idempotencyKey: string
  readonly approvalRevision: number
  readonly recoveryRevision: number
  readonly recovery?: ToolExecutionRecoveryEvidence
  readonly content?: readonly ToolResultContentPart[]
  readonly contentDigest?: string
  readonly isError?: boolean
  readonly error?: JsonValue
  readonly createdAt: number
  readonly finishedAt?: number
  readonly updatedAt: number
}

export type ToolExecutionAttemptState =
  | "running"
  | "suspended"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "recovery_required"

export interface ToolExecutionAttemptRecord {
  readonly id: ToolExecutionAttemptId
  readonly executionId: string
  readonly sessionAttemptId: SessionAttemptId
  readonly jobId: string
  readonly workerId: string
  readonly attemptNumber: number
  readonly state: ToolExecutionAttemptState
  readonly error?: JsonValue
  readonly startedAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
}

export interface BeginToolExecutionRequest {
  readonly sessionId: string
  readonly turnId: string
  readonly attemptId: string
  readonly inputId: string
  readonly sourceMessageId: string
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly principalId: string
  readonly toolCallId: string
  readonly toolName: string
  readonly input: JsonValue
  readonly descriptor: JsonValue
  readonly permission: JsonValue
  readonly activity?: ToolActivityEvidence
  readonly state: "running" | "denied" | "approval_required"
  readonly idempotencyKey: string
}

export interface BeginToolExecutionReceipt {
  readonly execution: ToolExecutionRecord
  readonly invocationAttempt?: ToolExecutionAttemptRecord
  readonly approvalSuspension?: ToolExecutionApprovalSuspensionReceipt
  readonly created: boolean
}

export interface ToolExecutionApprovalSuspensionReceipt {
  readonly execution: ToolExecutionRecord
  readonly turn: SessionTurnRecord
  readonly attempt: SessionAttemptRecord
  readonly job: SchedulerJobRecord
}

export interface FinishToolExecutionRequest {
  readonly sessionId: string
  readonly turnId: string
  readonly sessionAttemptId: SessionAttemptId
  readonly inputId: string
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly executionId: string
  readonly invocationAttemptId: ToolExecutionAttemptId
  readonly state: "succeeded" | "failed" | "cancelled"
  readonly content?: readonly ToolResultContentPart[]
  readonly contentDigest?: string
  readonly isError?: boolean
  readonly resultPresentation?: ToolActivityPresentation
  readonly error?: JsonValue
}

export interface ToolExecutionRecoveryEvidence {
  readonly type: "ambiguous_tool_outcome"
  readonly message: string
  readonly reconciliationRef?: string
  readonly metadata?: JsonValue
}

export interface RequireToolExecutionRecoveryRequest {
  readonly sessionId: string
  readonly turnId: string
  readonly sessionAttemptId: SessionAttemptId
  readonly inputId: string
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly executionId: string
  readonly invocationAttemptId: ToolExecutionAttemptId
  readonly evidence: ToolExecutionRecoveryEvidence
}

export interface RequireToolExecutionRecoveryReceipt {
  readonly execution: ToolExecutionRecord
  readonly turn: SessionTurnRecord
  readonly attempt: SessionAttemptRecord
  readonly job: SchedulerJobRecord
}

export type ToolExecutionRecoveryDecision =
  | "confirm_succeeded"
  | "confirm_failed"
  | "retry"
  | "abandon_turn"

export interface ResolveToolExecutionRecoveryRequest {
  readonly executionId: string
  readonly expectedRecoveryRevision: number
  readonly decision: ToolExecutionRecoveryDecision
  readonly principalId: string
  readonly reason: string
  readonly idempotencyKey: string
  readonly content?: readonly ToolResultContentPart[]
  readonly contentDigest?: string
  readonly error?: JsonValue
}

export interface ToolExecutionRecoveryDecisionRecord {
  readonly id: string
  readonly executionId: string
  readonly recoveryRevision: number
  readonly decision: ToolExecutionRecoveryDecision
  readonly principalId: string
  readonly reason: string
  readonly idempotencyKey: string
  readonly content?: readonly ToolResultContentPart[]
  readonly contentDigest?: string
  readonly error?: JsonValue
  readonly action:
    | "waiting_for_other_recovery"
    | "turn_requeued"
    | "turn_abandoned"
  readonly createdAt: number
}

export interface ResolveToolExecutionRecoveryReceipt {
  readonly execution: ToolExecutionRecord
  readonly recoveryDecision: ToolExecutionRecoveryDecisionRecord
}

export type ToolExecutionApprovalDecision = "approve_once" | "deny"

export interface ResolveToolExecutionApprovalRequest {
  readonly executionId: string
  readonly expectedApprovalRevision: number
  readonly decision: ToolExecutionApprovalDecision
  readonly principalId: string
  readonly reason: string
  readonly idempotencyKey: string
}

export interface ToolExecutionApprovalDecisionRecord {
  readonly id: string
  readonly executionId: string
  readonly approvalRevision: number
  readonly decision: ToolExecutionApprovalDecision
  readonly principalId: string
  readonly reason: string
  readonly idempotencyKey: string
  readonly action: "turn_requeued"
  readonly createdAt: number
}

export interface ResolveToolExecutionApprovalReceipt {
  readonly execution: ToolExecutionRecord
  readonly approvalDecision: ToolExecutionApprovalDecisionRecord
  readonly turn: SessionTurnRecord
  readonly job: SchedulerJobRecord
}

export interface ListToolExecutionAttemptsRequest {
  readonly executionId: string
}

export interface GetToolExecutionByCallRequest {
  readonly turnId: string
  readonly sourceMessageId: string
  readonly toolCallId: string
}

export interface ListToolExecutionsRequest {
  readonly sessionId?: string
  readonly turnId?: string
  readonly state?: ToolExecutionState
  readonly limit?: number
}

export interface ListToolActivitiesRequest {
  readonly sessionId: string
  readonly sourceMessageIds: readonly string[]
}
