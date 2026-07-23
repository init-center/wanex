import type {
  JsonValue,
  ProviderCapabilities,
  ProviderExecutionBinding,
  ProviderInputModality,
  ProviderOutputModality,
  RequestSessionTurnCancelReceipt,
  ResourceInputEvidence,
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
  expectResourceKind,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"
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
      parentTurnId: optionalString(value.parent_turn_id, "turn.parent_turn_id"),
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
  return withOptionalFields(
    { status },
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

function readExecutionBinding(value: JsonValue | undefined): SessionTurnExecutionBinding {
  if (!isRecord(value)) {
    throw new Error("turn.execution_binding must be an object")
  }
  const provider = readProviderBinding(value.provider)
  const resources = readResourceInputEvidenceList(value.resources)
  const recovery = readRecoveryBinding(value.recovery)
  return withOptionalFields(
    {
      digest: expectString(value.digest, "execution_binding.digest"),
      createdAt: expectNumber(value.createdAt, "execution_binding.createdAt"),
      provider,
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

function readProviderBinding(value: JsonValue | undefined): ProviderExecutionBinding {
  if (!isRecord(value)) {
    throw new Error("execution_binding.provider must be an object")
  }
  return withOptionalFields(
    {
      profileId: expectString(value.profileId, "binding.provider.profileId"),
      profileDigest: expectString(
        value.profileDigest,
        "binding.provider.profileDigest"
      ),
      adapterId: expectString(
        value.adapterId,
        "binding.provider.adapterId"
      ) as ProviderExecutionBinding["adapterId"],
      providerId: expectString(value.providerId, "binding.provider.providerId"),
      modelId: expectString(value.modelId, "binding.provider.modelId"),
      capabilities: readProviderCapabilities(value.capabilities)
    },
    {
      baseUrl: optionalString(value.baseUrl, "binding.provider.baseUrl"),
      secretRef: optionalString(value.secretRef, "binding.provider.secretRef"),
      anthropicVersion: optionalString(
        value.anthropicVersion,
        "binding.provider.anthropicVersion"
      ),
      requestConfig:
        value.requestConfig === undefined
          ? undefined
          : (value.requestConfig as Readonly<Record<string, JsonValue>>)
    }
  ) as ProviderExecutionBinding
}

const PROVIDER_INPUT_MODALITIES = [
  "text",
  "image",
  "audio",
  "video",
  "document"
] as const satisfies readonly ProviderInputModality[]

const PROVIDER_OUTPUT_MODALITIES = [
  "text",
  "image",
  "audio",
  "video"
] as const satisfies readonly ProviderOutputModality[]

function readProviderCapabilities(
  value: JsonValue | undefined
): ProviderCapabilities {
  if (!isRecord(value)) {
    throw new Error("binding.provider.capabilities must be an object")
  }
  const input = readModalities(
    value.input,
    PROVIDER_INPUT_MODALITIES,
    "binding.provider.capabilities.input"
  )
  const output = readModalities(
    value.output,
    PROVIDER_OUTPUT_MODALITIES,
    "binding.provider.capabilities.output"
  )
  if (!input.includes("text") || !output.includes("text")) {
    throw new Error("conversational provider capabilities require text input and output")
  }
  return { input, output }
}

function readModalities<T extends string>(
  value: JsonValue | undefined,
  allowed: readonly T[],
  name: string
): readonly T[] {
  const values = expectArray(value, name)
  if (values.length === 0) {
    throw new Error(`${name} must not be empty`)
  }
  const modalities = values.map((item, index) => {
    const modality = expectString(item, `${name}.${index}`)
    if (!allowed.includes(modality as T)) {
      throw new Error(`invalid ${name} modality: ${modality}`)
    }
    return modality as T
  })
  if (new Set(modalities).size !== modalities.length) {
    throw new Error(`${name} must not contain duplicates`)
  }
  return modalities
}

function readResourceInputEvidenceList(
  value: JsonValue | undefined
): readonly ResourceInputEvidence[] {
  const values = expectArray(value, "execution_binding.resources")
  const resources = values.map((item, index) =>
    readResourceInputEvidence(item, index)
  )
  const resourceIds = resources.map((resource) => resource.resourceId)
  if (new Set(resourceIds).size !== resourceIds.length) {
    throw new Error("execution_binding.resources must not contain duplicate resource ids")
  }
  return resources
}

function readResourceInputEvidence(
  value: JsonValue,
  index: number
): ResourceInputEvidence {
  const name = `execution_binding.resources.${index}`
  if (!isRecord(value)) {
    throw new Error(`${name} must be an object`)
  }
  const sha256 = expectString(value.sha256, `${name}.sha256`)
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(`${name}.sha256 must be a lowercase SHA-256 digest`)
  }
  const sizeBytes = expectNumber(value.sizeBytes, `${name}.sizeBytes`)
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error(`${name}.sizeBytes must be a positive integer`)
  }
  const mediaType = optionalString(value.mediaType, `${name}.mediaType`)
  if (mediaType !== undefined && mediaType.length === 0) {
    throw new Error(`${name}.mediaType must not be empty`)
  }
  return withOptionalFields(
    {
      resourceId: expectString(value.resourceId, `${name}.resourceId`),
      sha256,
      sizeBytes,
      kind: expectResourceKind(value.kind, `${name}.kind`)
    },
    { mediaType }
  )
}

function expectTurnState(value: JsonValue | undefined): SessionTurnRecord["state"] {
  const state = expectString(value, "turn.state")
  if (
    state !== "queued" &&
    state !== "running" &&
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
