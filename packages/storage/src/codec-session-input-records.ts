import {
  type AdmissionReceipt,
  type JsonValue,
  type SessionInputRecord,
  type SubmitSessionRunReceipt
} from "@wanex/protocol"

import {
  expectInputType,
  expectJsonField,
  expectNumber,
  expectSessionInputState,
  expectString,
  isRecord,
  messagePartsFromJson,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"
import { fromRpcSchedulerJobRecord } from "./codec-scheduler.js"
import {
  expectRunControlPolicy,
  expectSessionInputIntent,
  expectSessionInputOrigin
} from "./codec-session-values.js"

export function fromRpcAdmissionReceipt(value: JsonValue): AdmissionReceipt {
  if (!isRecord(value)) {
    throw new Error("admission receipt must be an object")
  }
  const durability = expectString(value.durability, "receipt.durability")
  const status = expectString(value.status, "receipt.status")
  if (durability !== "local-durable") {
    throw new Error(`invalid durability: ${durability}`)
  }
  if (status !== "admitted") {
    throw new Error(`invalid admission status: ${status}`)
  }
  return {
    inputId: expectString(value.input_id, "receipt.input_id"),
    sessionId: expectString(value.session_id, "receipt.session_id"),
    durability,
    status
  }
}

export function fromRpcSubmitSessionRunReceipt(
  value: JsonValue
): SubmitSessionRunReceipt {
  if (!isRecord(value)) {
    throw new Error("submit session run receipt must be an object")
  }
  return {
    admission: fromRpcAdmissionReceipt(
      expectJsonField(value, "admission", "submit session run admission")
    ),
    job: fromRpcSchedulerJobRecord(
      expectJsonField(value, "job", "submit session run job")
    )
  }
}

export function fromRpcSessionInputRecord(
  value: JsonValue
): SessionInputRecord {
  if (!isRecord(value)) {
    throw new Error("session input must be an object")
  }
  const record = {
    id: expectString(value.id, "input.id"),
    sessionId: expectString(value.session_id, "input.session_id"),
    principalId: expectString(value.principal_id, "input.principal_id"),
    idempotencyKey: expectString(value.idempotency_key, "input.idempotency_key"),
    inputType: expectInputType(value.input_type),
    content: messagePartsFromJson(value.content),
    status: expectSessionInputState(value.status),
    createdAt: expectNumber(value.created_at, "input.created_at"),
    updatedAt: expectNumber(value.updated_at, "input.updated_at")
  }
  return withOptionalFields(record, {
    origin:
      value.origin === null || value.origin === undefined
        ? undefined
        : expectSessionInputOrigin(value.origin),
    intent:
      value.intent === null || value.intent === undefined
        ? undefined
        : expectSessionInputIntent(value.intent),
    runControlPolicy:
      value.run_control_policy === null ||
      value.run_control_policy === undefined
        ? undefined
        : expectRunControlPolicy(value.run_control_policy),
    expectedRunId: optionalString(value.expected_run_id, "input.expected_run_id")
  }) as SessionInputRecord
}
