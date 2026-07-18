import {
  type ConnectorRegistrationRecord,
  type JsonValue,
  type ListConnectorRegistrationsRequest,
  type PutConnectorRegistrationRequest,
  type UpdateConnectorRegistrationStateRequest
} from "@wanex/protocol"

import {
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  withOptionalFields
} from "./codec-helpers.js"
import { expectConnectorRegistrationState } from "./codec-connector-enums.js"
import { toRpcJsonValue } from "./codec-common.js"
import type { ListConnectorRegistrationsWire, PutConnectorRegistrationWire, UpdateConnectorRegistrationStateWire } from "./generated/storage-rpc.js"

export function toRpcPutConnectorRegistrationRequest(
  request: PutConnectorRegistrationRequest
): PutConnectorRegistrationWire {
  return {
    id: request.id ?? null,
    connector_id: request.connectorId,
    plugin_id: request.pluginId,
    version: request.version ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcListConnectorRegistrationsRequest(
  request: ListConnectorRegistrationsRequest
): ListConnectorRegistrationsWire {
  return {
    connector_id: request.connectorId ?? null,
    plugin_id: request.pluginId ?? null,
    state: request.state ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcUpdateConnectorRegistrationStateRequest(
  request: UpdateConnectorRegistrationStateRequest
): UpdateConnectorRegistrationStateWire {
  return {
    connector_id: request.connectorId,
    state: request.state
  }
}

export function fromRpcConnectorRegistrationRecord(
  value: JsonValue
): ConnectorRegistrationRecord {
  if (!isRecord(value)) {
    throw new Error("connector registration must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "connector_registration.id"),
      connectorId: expectString(
        value.connector_id,
        "connector_registration.connector_id"
      ),
      pluginId: expectString(value.plugin_id, "connector_registration.plugin_id"),
      pluginVersion: expectString(
        value.plugin_version,
        "connector_registration.plugin_version"
      ),
      state: expectConnectorRegistrationState(value.state),
      createdAt: expectNumber(value.created_at, "connector_registration.created_at"),
      updatedAt: expectNumber(value.updated_at, "connector_registration.updated_at")
    },
    {
      metadata: value.metadata ?? undefined,
      disabledAt: optionalNumber(
        value.disabled_at,
        "connector_registration.disabled_at"
      )
    }
  )
}
