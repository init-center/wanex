import {
  type ConnectorSessionRecord,
  type FinishConnectorSessionRequest,
  type HeartbeatConnectorSessionRequest,
  type JsonValue,
  type ListConnectorSessionsRequest,
  type StartConnectorSessionRequest
} from "@wanex/protocol"

import {
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  withOptionalFields
} from "./codec-helpers.js"
import { expectConnectorSessionState } from "./codec-connector-enums.js"
import { toRpcJsonValue } from "./codec-common.js"
import type { FinishConnectorSessionWire, HeartbeatConnectorSessionWire, ListConnectorSessionsWire, StartConnectorSessionWire } from "./generated/storage-rpc.js"

export function toRpcStartConnectorSessionRequest(
  request: StartConnectorSessionRequest
): StartConnectorSessionWire {
  return {
    id: request.id ?? null,
    connector_id: request.connectorId,
    credential_id: request.credentialId,
    owner_id: request.ownerId,
    lease_ms: request.leaseMs,
    state: request.state ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcHeartbeatConnectorSessionRequest(
  request: HeartbeatConnectorSessionRequest
): HeartbeatConnectorSessionWire {
  return {
    session_id: request.sessionId,
    owner_id: request.ownerId,
    lease_token: request.leaseToken,
    lease_ms: request.leaseMs,
    state: request.state ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null)
  }
}

export function toRpcFinishConnectorSessionRequest(
  request: FinishConnectorSessionRequest
): FinishConnectorSessionWire {
  return {
    session_id: request.sessionId,
    owner_id: request.ownerId,
    lease_token: request.leaseToken,
    state: request.state,
    metadata: toRpcJsonValue(request.metadata ?? null),
    error: toRpcJsonValue(request.error ?? null)
  }
}

export function toRpcListConnectorSessionsRequest(
  request: ListConnectorSessionsRequest
): ListConnectorSessionsWire {
  return {
    connector_id: request.connectorId ?? null,
    state: request.state ?? null,
    owner_id: request.ownerId ?? null,
    limit: request.limit ?? null
  }
}

export function fromRpcConnectorSessionRecord(
  value: JsonValue
): ConnectorSessionRecord {
  if (!isRecord(value)) {
    throw new Error("connector session must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "connector_session.id"),
      connectorId: expectString(value.connector_id, "connector_session.connector_id"),
      credentialId: expectString(
        value.credential_id,
        "connector_session.credential_id"
      ),
      state: expectConnectorSessionState(value.state),
      ownerId: expectString(value.owner_id, "connector_session.owner_id"),
      leaseToken: expectString(value.lease_token, "connector_session.lease_token"),
      leaseExpiresAt: expectNumber(
        value.lease_expires_at,
        "connector_session.lease_expires_at"
      ),
      createdAt: expectNumber(value.created_at, "connector_session.created_at"),
      updatedAt: expectNumber(value.updated_at, "connector_session.updated_at")
    },
    {
      metadata: value.metadata ?? undefined,
      lastError: value.last_error ?? undefined,
      finishedAt: optionalNumber(value.finished_at, "connector_session.finished_at")
    }
  )
}
