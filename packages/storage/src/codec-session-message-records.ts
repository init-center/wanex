import type {
  JsonValue,
  ProviderState,
  SessionMessageRecord
} from "@wanex/protocol"

import {
  expectMessageRole,
  expectMessageStatus,
  expectNumber,
  expectProviderState,
  expectString,
  isRecord,
  messagePartsFromJson,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"

export function fromRpcSessionMessageRecord(
  value: JsonValue
): SessionMessageRecord {
  if (!isRecord(value)) {
    throw new Error("session message must be an object")
  }
  const record = {
    id: expectString(value.id, "message.id"),
    sessionId: expectString(value.session_id, "message.session_id"),
    sequence: expectNumber(value.sequence, "message.sequence"),
    turnId: expectString(value.turn_id, "message.turn_id"),
    role: expectMessageRole(value.role),
    status: expectMessageStatus(value.status),
    content: messagePartsFromJson(value.content),
    executionBindingDigest: expectString(
      value.execution_binding_digest,
      "message.execution_binding_digest"
    ),
    createdAt: expectNumber(value.created_at, "message.created_at"),
    updatedAt: expectNumber(value.updated_at, "message.updated_at")
  }
  return withOptionalFields(record, {
    attemptId: optionalString(value.attempt_id, "message.attempt_id"),
    inputId: optionalString(value.input_id, "message.input_id"),
    providerState: readProviderState(value.provider_state)
  })
}

function readProviderState(value: JsonValue | undefined): readonly ProviderState[] | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  if (!Array.isArray(value)) {
    throw new Error("message.provider_state must be an array")
  }
  return value.map(expectProviderState)
}
