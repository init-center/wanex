import {
  type JsonValue,
  type SessionMessageRecord
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
    role: expectMessageRole(value.role),
    status: expectMessageStatus(value.status),
    content: messagePartsFromJson(value.content),
    createdAt: expectNumber(value.created_at, "message.created_at"),
    updatedAt: expectNumber(value.updated_at, "message.updated_at")
  }
  return withOptionalFields(record, {
    runId: optionalString(value.run_id, "message.run_id"),
    inputId: optionalString(value.input_id, "message.input_id"),
    providerState:
      value.provider_state === null || value.provider_state === undefined
        ? undefined
        : expectProviderState(value.provider_state)
  })
}
