import {
  type JsonValue,
  type SessionRecord
} from "@wanex/protocol"

import {
  expectNumber,
  expectSessionKind,
  expectSessionStatus,
  expectString,
  isRecord,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"

export function fromRpcSessionRecord(value: JsonValue): SessionRecord {
  if (!isRecord(value)) {
    throw new Error("session record must be an object")
  }
  const record = {
    id: expectString(value.id, "session.id"),
    kind: expectSessionKind(value.kind),
    status: expectSessionStatus(value.status),
    createdAt: expectNumber(value.created_at, "session.created_at"),
    updatedAt: expectNumber(value.updated_at, "session.updated_at")
  }
  return withOptionalFields(record, {
    title: optionalString(value.title, "session.title"),
    archivedAt:
      value.archived_at === null || value.archived_at === undefined
        ? undefined
        : expectNumber(value.archived_at, "session.archived_at")
  })
}
