import type {
  JsonValue,
  ModelCapabilityRouteExecutionBinding,
  RequestSessionTurnCancelReceipt,
  SessionAttemptRecord,
  SessionTurnExecutionBinding,
  SessionTurnRecoveryBinding,
  SessionTurnRecord,
  SettleSessionTurnReceipt,
  StartSessionTurnAttemptReceipt
} from "@wanex/protocol"
import {
  expectArray,
  expectJsonField,
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"
import {
  assertModelSupportsRequirement,
  digestJson,
  expectSha256,
  readModelCapabilityRequirement,
  readModelEndpointExecutionBinding,
  readResourceInputEvidenceList,
  requireExactKeys
} from "./codec-model-evidence.js"
import { fromRpcSchedulerJobRecord } from "./codec-scheduler.js"
import { fromRpcSessionMessageRecord } from "./codec-session-message-records.js"

export function fromRpcSessionTurnRecord(value: JsonValue): SessionTurnRecord {
  if (!isRecord(value)) {
    throw new Error("session turn must be an object")
  }
  const executionBinding = readExecutionBinding(value.execution_binding)
  const persistedDigest = expectString(
    value.execution_binding_digest,
    "turn.execution_binding_digest"
  )
  if (executionBinding.digest !== persistedDigest) {
    throw new Error("turn execution binding digest does not match")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "turn.id"),
      sessionId: expectString(value.session_id, "turn.session_id"),
      primaryInputId: expectString(
        value.primary_input_id,
        "turn.primary_input_id"
      ),
      jobId: expectString(value.job_id, "turn.job_id"),
      state: expectTurnState(value.state),
      executionBinding,
      maxSteps: expectNumber(value.max_steps, "turn.max_steps"),
      createdAt: expectNumber(value.created_at, "turn.created_at"),
      updatedAt: expectNumber(value.updated_at, "turn.updated_at")
    },
    {
      currentAttemptId: optionalString(
        value.current_attempt_id,
        "turn.current_attempt_id"
      ),
      regeneratesTurnId: optionalString(
        value.regenerates_turn_id,
        "turn.regenerates_turn_id"
      ),
      cancelRequestedAt: optionalNumber(
        value.cancel_requested_at,
        "turn.cancel_requested_at"
      ),
      cancelReason: optionalString(value.cancel_reason, "turn.cancel_reason"),
      result: value.result ?? undefined,
      error: value.error ?? undefined,
      finishedAt: optionalNumber(value.finished_at, "turn.finished_at")
    }
  )
}

export function fromRpcSessionAttemptRecord(
  value: JsonValue
): SessionAttemptRecord {
  if (!isRecord(value)) {
    throw new Error("session attempt must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "attempt.id"),
      sessionId: expectString(value.session_id, "attempt.session_id"),
      turnId: expectString(value.turn_id, "attempt.turn_id"),
      inputId: expectString(value.input_id, "attempt.input_id"),
      jobId: expectString(value.job_id, "attempt.job_id"),
      attemptNumber: expectNumber(
        value.attempt_number,
        "attempt.attempt_number"
      ),
      workerId: expectString(value.worker_id, "attempt.worker_id"),
      leaseToken: expectString(value.lease_token, "attempt.lease_token"),
      state: expectAttemptState(value.state),
      startedAt: expectNumber(value.started_at, "attempt.started_at"),
      updatedAt: expectNumber(value.updated_at, "attempt.updated_at")
    },
    {
      error: value.error ?? undefined,
      finishedAt: optionalNumber(value.finished_at, "attempt.finished_at")
    }
  )
}

export function fromRpcStartSessionTurnAttemptReceipt(
  value: JsonValue
): StartSessionTurnAttemptReceipt {
  if (!isRecord(value)) {
    throw new Error("start session turn attempt receipt must be an object")
  }
  return {
    turn: fromRpcSessionTurnRecord(expectJsonField(value, "turn", "started turn")),
    attempt: fromRpcSessionAttemptRecord(
      expectJsonField(value, "attempt", "started attempt")
    ),
    inputMessage: fromRpcSessionMessageRecord(
      expectJsonField(value, "input_message", "promoted input message")
    )
  }
}

export function fromRpcSettleSessionTurnReceipt(
  value: JsonValue
): SettleSessionTurnReceipt {
  if (!isRecord(value)) {
    throw new Error("settle session turn receipt must be an object")
  }
  return withOptionalFields(
    {
      turn: fromRpcSessionTurnRecord(expectJsonField(value, "turn", "settled turn")),
      attempt: fromRpcSessionAttemptRecord(
        expectJsonField(value, "attempt", "settled attempt")
      ),
      job: fromRpcSchedulerJobRecord(expectJsonField(value, "job", "settled job"))
    },
    {
      assistantMessage:
        value.assistant_message === null || value.assistant_message === undefined
          ? undefined
          : fromRpcSessionMessageRecord(value.assistant_message)
    }
  )
}

export function fromRpcRequestSessionTurnCancelReceipt(
  value: JsonValue
): RequestSessionTurnCancelReceipt {
  if (!isRecord(value)) {
    throw new Error("session turn cancel receipt must be an object")
  }
  const status = expectString(value.status, "turn_cancel.status")
  if (
    status !== "cancelled" &&
    status !== "cancel_requested" &&
    status !== "already_terminal" &&
    status !== "missing"
  ) {
    throw new Error(`invalid session turn cancel status: ${status}`)
  }
  const cascadeJobIds = expectArray(
    value.cascade_job_ids,
    "turn_cancel.cascade_job_ids"
  )
  return withOptionalFields(
    {
      status,
      cascadeJobIds: cascadeJobIds.map((jobId) =>
        expectString(jobId, "turn_cancel.cascade_job_ids[]")
      )
    },
    {
      turn:
        value.turn === null || value.turn === undefined
          ? undefined
          : fromRpcSessionTurnRecord(value.turn),
      job:
        value.job === null || value.job === undefined
          ? undefined
          : fromRpcSchedulerJobRecord(value.job)
    }
  ) as RequestSessionTurnCancelReceipt
}

export function readExecutionBinding(value: JsonValue | undefined): SessionTurnExecutionBinding {
  if (!isRecord(value)) {
    throw new Error("turn.execution_binding must be an object")
  }
  requireExactKeys(
    value,
    [
      "digest",
      "createdAt",
      "modelEndpoint",
      "completion",
      "capabilityRoutes",
      "resources",
      "recovery",
      ...("contextSnapshot" in value ? ["contextSnapshot"] : []),
      ...("toolSnapshot" in value ? ["toolSnapshot"] : []),
      ...("permissionSnapshot" in value ? ["permissionSnapshot"] : []),
      ...("environmentSnapshot" in value ? ["environmentSnapshot"] : [])
    ],
    "execution_binding"
  )
  const modelEndpoint = readModelEndpointExecutionBinding(
    value.modelEndpoint,
    "execution_binding.modelEndpoint"
  )
  if (
    !modelEndpoint.model.operations.includes("conversation") ||
    !modelEndpoint.model.inputModalities.includes("text") ||
    !modelEndpoint.model.outputModalities.includes("text")
  ) {
    throw new Error(
      "execution_binding.modelEndpoint must support text conversation"
    )
  }
  const capabilityRoutes = readCapabilityRoutes(value.capabilityRoutes)
  const completion = readCompletionBinding(value.completion)
  const resources = readResourceInputEvidenceList(
    value.resources,
    "execution_binding.resources"
  )
  const recovery = readRecoveryBinding(value.recovery)
  const digest = expectSha256(value.digest, "execution_binding.digest")
  const binding = withOptionalFields(
    {
      digest,
      createdAt: expectNumber(value.createdAt, "execution_binding.createdAt"),
      modelEndpoint,
      completion,
      capabilityRoutes,
      resources,
      recovery
    },
    {
      contextSnapshot: value.contextSnapshot,
      toolSnapshot: value.toolSnapshot,
      permissionSnapshot: value.permissionSnapshot,
      environmentSnapshot: value.environmentSnapshot
    }
  ) as SessionTurnExecutionBinding
  const { digest: _digest, ...unsigned } = binding
  if (digestJson(unsigned) !== digest) {
    throw new Error("execution_binding.digest does not match its content")
  }
  return binding
}

function readCompletionBinding(
  value: JsonValue | undefined
): SessionTurnExecutionBinding["completion"] {
  if (!isRecord(value)) {
    throw new Error("execution_binding.completion must be an object")
  }
  requireExactKeys(value, ["maxOutputTokens"], "execution_binding.completion")
  const maxOutputTokens = expectNumber(
    value.maxOutputTokens,
    "execution_binding.completion.maxOutputTokens"
  )
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0) {
    throw new Error(
      "execution_binding.completion.maxOutputTokens must be a positive safe integer"
    )
  }
  return { maxOutputTokens }
}

function readRecoveryBinding(value: JsonValue | undefined): SessionTurnRecoveryBinding {
  if (!isRecord(value)) {
    throw new Error("execution_binding.recovery must be an object")
  }
  const providerMaxAttempts = expectNumber(
    value.providerMaxAttempts,
    "binding.recovery.providerMaxAttempts"
  )
  const idempotentToolMaxAttempts = expectNumber(
    value.idempotentToolMaxAttempts,
    "binding.recovery.idempotentToolMaxAttempts"
  )
  if (
    !Number.isSafeInteger(providerMaxAttempts) ||
    providerMaxAttempts <= 0 ||
    !Number.isSafeInteger(idempotentToolMaxAttempts) ||
    idempotentToolMaxAttempts <= 0
  ) {
    throw new Error("turn recovery bounds must be positive integers")
  }
  return { providerMaxAttempts, idempotentToolMaxAttempts }
}

function readCapabilityRoutes(
  value: JsonValue | undefined
): readonly ModelCapabilityRouteExecutionBinding[] {
  const entries = expectArray(value, "execution_binding.capabilityRoutes")
  if (entries.length > 64) {
    throw new Error("execution_binding.capabilityRoutes exceeds 64 entries")
  }
  const keys = new Set<string>()
  let previousKey: string | undefined
  return entries.map((entry, index) => {
    const label = `execution_binding.capabilityRoutes.${index}`
    if (!isRecord(entry)) {
      throw new Error(`${label} must be an object`)
    }
    requireExactKeys(
      entry,
      ["requirement", "source", "modelEndpoint"],
      label
    )
    const requirement = readModelCapabilityRequirement(
      entry.requirement,
      `${label}.requirement`
    )
    if (requirement.operation === "conversation") {
      throw new Error(`${label}.requirement.operation must not be conversation`)
    }
    const source = expectString(entry.source, `${label}.source`)
    if (source !== "configured" && source !== "single_candidate") {
      throw new Error(`invalid ${label}.source: ${source}`)
    }
    const modelEndpoint = readModelEndpointExecutionBinding(
      entry.modelEndpoint,
      `${label}.modelEndpoint`
    )
    assertModelSupportsRequirement(modelEndpoint.model, requirement, label)
    const key = JSON.stringify(requirement)
    if (keys.has(key)) {
      throw new Error(`duplicate execution binding capability route: ${key}`)
    }
    if (previousKey !== undefined && previousKey.localeCompare(key) >= 0) {
      throw new Error("execution_binding.capabilityRoutes must use canonical order")
    }
    keys.add(key)
    previousKey = key
    return { requirement, source, modelEndpoint }
  })
}

function expectTurnState(value: JsonValue | undefined): SessionTurnRecord["state"] {
  const state = expectString(value, "turn.state")
  if (
    state !== "queued" &&
    state !== "running" &&
    state !== "waiting" &&
    state !== "cancel_requested" &&
    state !== "succeeded" &&
    state !== "failed" &&
    state !== "cancelled" &&
    state !== "interrupted" &&
    state !== "recovery_required"
  ) {
    throw new Error(`invalid session turn state: ${state}`)
  }
  return state
}

function expectAttemptState(
  value: JsonValue | undefined
): SessionAttemptRecord["state"] {
  const state = expectString(value, "attempt.state")
  if (
    state !== "running" &&
    state !== "suspended" &&
    state !== "succeeded" &&
    state !== "failed" &&
    state !== "cancelled" &&
    state !== "interrupted" &&
    state !== "recovery_required"
  ) {
    throw new Error(`invalid session attempt state: ${state}`)
  }
  return state
}
