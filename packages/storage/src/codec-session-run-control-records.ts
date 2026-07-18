import {
  type ApplySessionRunControlReceipt,
  type InterruptSessionRunReceipt,
  type JsonValue,
  type SessionRunControlRecord,
  type SteerSessionRunReceipt
} from "@wanex/protocol"

import {
  expectJsonField,
  expectNumber,
  expectString,
  isRecord,
  messagePartsFromJson,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"
import {
  expectMetadata,
  expectSessionInputOrigin,
  expectSessionRunControlApplyEffect,
  expectSessionRunControlKind,
  expectSessionRunControlStatus
} from "./codec-session-values.js"

export function fromRpcInterruptSessionRunReceipt(
  value: JsonValue
): InterruptSessionRunReceipt {
  if (!isRecord(value)) {
    throw new Error("interrupt session run receipt must be an object")
  }
  const durability = expectString(value.durability, "interrupt.durability")
  const status = expectString(value.status, "interrupt.status")
  if (durability !== "local-durable") {
    throw new Error(`invalid interrupt durability: ${durability}`)
  }
  if (status !== "interrupt_requested" && status !== "not_running") {
    throw new Error(`invalid interrupt status: ${status}`)
  }
  return withOptionalFields(
    {
      sessionId: expectString(value.session_id, "interrupt.session_id"),
      runId: expectString(value.run_id, "interrupt.run_id"),
      durability,
      status
    },
    {
      acceptedAt:
        value.accepted_at === null || value.accepted_at === undefined
          ? undefined
          : expectNumber(value.accepted_at, "interrupt.accepted_at")
    }
  ) as InterruptSessionRunReceipt
}

export function fromRpcSteerSessionRunReceipt(
  value: JsonValue
): SteerSessionRunReceipt {
  if (!isRecord(value)) {
    throw new Error("steer session run receipt must be an object")
  }
  const durability = expectString(value.durability, "steer.durability")
  const status = expectString(value.status, "steer.status")
  if (durability !== "local-durable") {
    throw new Error(`invalid steer durability: ${durability}`)
  }
  if (status !== "accepted") {
    throw new Error(`invalid steer status: ${status}`)
  }
  return withOptionalFields(
    {
      sessionId: expectString(value.session_id, "steer.session_id"),
      runId: expectString(value.run_id, "steer.run_id"),
      durability,
      status
    },
    {
      acceptedAt:
        value.accepted_at === null || value.accepted_at === undefined
          ? undefined
          : expectNumber(value.accepted_at, "steer.accepted_at")
    }
  ) as SteerSessionRunReceipt
}

export function fromRpcApplySessionRunControlReceipt(
  value: JsonValue
): ApplySessionRunControlReceipt {
  if (!isRecord(value)) {
    throw new Error("apply session run control receipt must be an object")
  }
  return {
    control: fromRpcSessionRunControlRecord(
      expectJsonField(value, "control", "applied run control")
    ),
    effect: expectSessionRunControlApplyEffect(value.effect)
  }
}

export function fromRpcSessionRunControlRecord(
  value: JsonValue
): SessionRunControlRecord {
  if (!isRecord(value)) {
    throw new Error("session run control must be an object")
  }
  const record = {
    id: expectString(value.id, "run_control.id"),
    sessionId: expectString(value.session_id, "run_control.session_id"),
    runId: expectString(value.run_id, "run_control.run_id"),
    idempotencyKey: expectString(
      value.idempotency_key,
      "run_control.idempotency_key"
    ),
    kind: expectSessionRunControlKind(value.kind),
    status: expectSessionRunControlStatus(value.status),
    createdAt: expectNumber(value.created_at, "run_control.created_at"),
    updatedAt: expectNumber(value.updated_at, "run_control.updated_at")
  }
  return withOptionalFields(record, {
    inputId: optionalString(value.input_id, "run_control.input_id"),
    principalId: optionalString(value.principal_id, "run_control.principal_id"),
    content:
      value.content === null || value.content === undefined
        ? undefined
        : messagePartsFromJson(value.content),
    reason: optionalString(value.reason, "run_control.reason"),
    origin:
      value.origin === null || value.origin === undefined
        ? undefined
        : expectSessionInputOrigin(value.origin),
    providerProfileId: optionalString(
      value.provider_profile_id,
      "run_control.provider_profile_id"
    ),
    metadata:
      value.metadata === null || value.metadata === undefined
        ? undefined
        : expectMetadata(value.metadata, "run_control.metadata"),
    appliedAt:
      value.applied_at === null || value.applied_at === undefined
        ? undefined
        : expectNumber(value.applied_at, "run_control.applied_at")
  })
}
