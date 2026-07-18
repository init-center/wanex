import {
  type JsonValue,
  type QueryEventsInput,
  type RuntimeEvent,
  WANEX_PROTOCOL_VERSION
} from "@wanex/protocol"

import {
  expectNumber,
  expectString,
  fromRpcScope,
  isRecord,
  toRpcJsonValue
} from "./codec-helpers.js"
import type {
  QueryEventsWire,
  RuntimeEventInputWire
} from "./generated/storage-rpc.js"

export function toRpcEvent(event: RuntimeEvent): RuntimeEventInputWire {
  return {
    id: event.id,
    type: event.type,
    scope: {
      session_id: event.scope.sessionId ?? null,
      run_id: event.scope.runId ?? null,
      input_id: event.scope.inputId ?? null,
      message_id: event.scope.messageId ?? null,
      resource_id: event.scope.resourceId ?? null,
      plan_proposal_id: event.scope.planProposalId ?? null,
      objective_id: event.scope.objectiveId ?? null
    },
    payload: toRpcJsonValue(event.payload),
    occurredAt: event.occurredAt
  }
}

export function fromRpcEvent(value: JsonValue): RuntimeEvent {
  if (!isRecord(value)) {
    throw new Error("event must be an object")
  }
  return {
    id: expectString(value.id, "event.id"),
    protocolVersion: WANEX_PROTOCOL_VERSION,
    type: expectString(value.event_type, "event.event_type"),
    scope: fromRpcScope(value.scope),
    payload: (value.payload ?? null) as JsonValue,
    occurredAt: expectNumber(value.occurred_at, "event.occurred_at")
  }
}

export function toRpcQueryEvents(query: QueryEventsInput): QueryEventsWire {
  return {
    session_id: query.scope?.sessionId ?? null,
    plan_proposal_id: query.scope?.planProposalId ?? null,
    objective_id: query.scope?.objectiveId ?? null,
    after_occurred_at: query.after?.occurredAt ?? null,
    after_event_id: query.after?.eventId ?? null,
    limit: query.limit ?? null
  }
}
