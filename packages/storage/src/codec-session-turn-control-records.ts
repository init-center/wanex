import type {
  ApplySessionTurnControlReceipt,
  InterruptSessionTurnReceipt,
  JsonValue,
  SessionTurnControlRecord,
  SteerSessionTurnReceipt
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
  expectSessionTurnControlApplyEffect,
  expectSessionTurnControlKind,
  expectSessionTurnControlStatus
} from "./codec-session-values.js"

export function fromRpcInterruptSessionTurnReceipt(
  value: JsonValue
): InterruptSessionTurnReceipt {
  if (!isRecord(value)) {
    throw new Error("interrupt session turn receipt must be an object")
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
      turnId: expectString(value.turn_id, "interrupt.turn_id"),
      attemptId: expectString(value.attempt_id, "interrupt.attempt_id"),
      durability,
      status
    },
    {
      acceptedAt:
        value.accepted_at === null || value.accepted_at === undefined
          ? undefined
          : expectNumber(value.accepted_at, "interrupt.accepted_at")
    }
  ) as InterruptSessionTurnReceipt
}

export function fromRpcSteerSessionTurnReceipt(
  value: JsonValue
): SteerSessionTurnReceipt {
  if (!isRecord(value)) {
    throw new Error("steer session turn receipt must be an object")
  }
  const durability = expectString(value.durability, "steer.durability")
  const status = expectString(value.status, "steer.status")
  if (durability !== "local-durable" || status !== "accepted") {
    throw new Error("invalid steer session turn receipt")
  }
  return withOptionalFields(
    {
      sessionId: expectString(value.session_id, "steer.session_id"),
      turnId: expectString(value.turn_id, "steer.turn_id"),
      attemptId: expectString(value.attempt_id, "steer.attempt_id"),
      durability,
      status
    },
    {
      acceptedAt:
        value.accepted_at === null || value.accepted_at === undefined
          ? undefined
          : expectNumber(value.accepted_at, "steer.accepted_at")
    }
  ) as SteerSessionTurnReceipt
}

export function fromRpcApplySessionTurnControlReceipt(
  value: JsonValue
): ApplySessionTurnControlReceipt {
  if (!isRecord(value)) {
    throw new Error("apply session turn control receipt must be an object")
  }
  return {
    control: fromRpcSessionTurnControlRecord(
      expectJsonField(value, "control", "applied turn control")
    ),
    effect: expectSessionTurnControlApplyEffect(value.effect)
  }
}

export function fromRpcSessionTurnControlRecord(
  value: JsonValue
): SessionTurnControlRecord {
  if (!isRecord(value)) {
    throw new Error("session turn control must be an object")
  }
  const record = {
    id: expectString(value.id, "turn_control.id"),
    sessionId: expectString(value.session_id, "turn_control.session_id"),
    turnId: expectString(value.turn_id, "turn_control.turn_id"),
    attemptId: expectString(value.attempt_id, "turn_control.attempt_id"),
    idempotencyKey: expectString(
      value.idempotency_key,
      "turn_control.idempotency_key"
    ),
    kind: expectSessionTurnControlKind(value.kind),
    status: expectSessionTurnControlStatus(value.status),
    createdAt: expectNumber(value.created_at, "turn_control.created_at"),
    updatedAt: expectNumber(value.updated_at, "turn_control.updated_at")
  }
  return withOptionalFields(record, {
    inputId: optionalString(value.input_id, "turn_control.input_id"),
    principalId: optionalString(value.principal_id, "turn_control.principal_id"),
    content:
      value.content === null || value.content === undefined
        ? undefined
        : messagePartsFromJson(value.content),
    reason: optionalString(value.reason, "turn_control.reason"),
    origin:
      value.origin === null || value.origin === undefined
        ? undefined
        : expectSessionInputOrigin(value.origin),
    metadata:
      value.metadata === null || value.metadata === undefined
        ? undefined
        : expectMetadata(value.metadata, "turn_control.metadata"),
    appliedAt:
      value.applied_at === null || value.applied_at === undefined
        ? undefined
        : expectNumber(value.applied_at, "turn_control.applied_at")
  })
}
