import type {
  RuntimeEvent,
  SessionInputRecord,
  SessionMessageRecord,
  SessionRecord
} from "@wanex/protocol"
import {
  expectString,
  isRecord,
  setOptionalString
} from "./codec-common.js"

export function fromRpcScope(value: unknown): RuntimeEvent["scope"] {
  if (!isRecord(value)) {
    return {}
  }
  const scope: Record<string, string> = {}
  setOptionalString(scope, "sessionId", value.session_id, "scope.session_id")
  setOptionalString(scope, "turnId", value.turn_id, "scope.turn_id")
  setOptionalString(scope, "attemptId", value.attempt_id, "scope.attempt_id")
  setOptionalString(scope, "inputId", value.input_id, "scope.input_id")
  setOptionalString(scope, "messageId", value.message_id, "scope.message_id")
  setOptionalString(scope, "resourceId", value.resource_id, "scope.resource_id")
  setOptionalString(
    scope,
    "planProposalId",
    value.plan_proposal_id,
    "scope.plan_proposal_id"
  )
  setOptionalString(scope, "objectiveId", value.objective_id, "scope.objective_id")
  return scope
}

export function expectSessionKind(value: unknown): SessionRecord["kind"] {
  const kind = expectString(value, "session.kind")
  if (kind !== "chat" && kind !== "agent") {
    throw new Error(`invalid session kind: ${kind}`)
  }
  return kind
}

export function expectSessionStatus(value: unknown): SessionRecord["status"] {
  const status = expectString(value, "session.status")
  if (status !== "active" && status !== "archived") {
    throw new Error(`invalid session status: ${status}`)
  }
  return status
}

export function expectInputType(value: unknown): SessionInputRecord["inputType"] {
  const inputType = expectString(value, "input.input_type")
  if (inputType !== "user" && inputType !== "system") {
    throw new Error(`invalid input type: ${inputType}`)
  }
  return inputType
}

export function expectSessionInputState(
  value: unknown
): SessionInputRecord["status"] {
  const status = expectString(value, "input.status")
  if (
    status !== "admitted" &&
    status !== "control_pending" &&
    status !== "promoted" &&
    status !== "completed" &&
    status !== "failed" &&
    status !== "cancelled" &&
    status !== "rejected"
  ) {
    throw new Error(`invalid input status: ${status}`)
  }
  return status
}

export function expectMessageRole(value: unknown): SessionMessageRecord["role"] {
  const role = expectString(value, "message.role")
  if (
    role !== "user" &&
    role !== "assistant" &&
    role !== "tool" &&
    role !== "system"
  ) {
    throw new Error(`invalid message role: ${role}`)
  }
  return role
}

export function expectMessageStatus(value: unknown): SessionMessageRecord["status"] {
  const status = expectString(value, "message.status")
  if (status !== "completed" && status !== "failed" && status !== "partial") {
    throw new Error(`invalid message status: ${status}`)
  }
  return status
}
