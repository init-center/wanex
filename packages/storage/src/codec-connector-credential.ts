import {
  type ConnectorCredentialRecord,
  type JsonValue,
  type ListConnectorCredentialsRequest,
  type PutConnectorCredentialRequest,
  type RevokeConnectorCredentialRequest
} from "@wanex/protocol"

import {
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  withOptionalFields
} from "./codec-helpers.js"
import { expectConnectorCredentialState } from "./codec-connector-enums.js"
import { toRpcJsonValue } from "./codec-common.js"
import type { ListConnectorCredentialsWire, PutConnectorCredentialWire, RevokeConnectorCredentialWire } from "./generated/storage-rpc.js"

export function toRpcPutConnectorCredentialRequest(
  request: PutConnectorCredentialRequest
): PutConnectorCredentialWire {
  return {
    id: request.id ?? null,
    connector_id: request.connectorId,
    kind: request.kind,
    secret_ref: request.secretRef,
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcListConnectorCredentialsRequest(
  request: ListConnectorCredentialsRequest
): ListConnectorCredentialsWire {
  return {
    connector_id: request.connectorId ?? null,
    state: request.state ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcRevokeConnectorCredentialRequest(
  request: RevokeConnectorCredentialRequest
): RevokeConnectorCredentialWire {
  return {
    credential_id: request.credentialId
  }
}

export function fromRpcConnectorCredentialRecord(
  value: JsonValue
): ConnectorCredentialRecord {
  if (!isRecord(value)) {
    throw new Error("connector credential must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "connector_credential.id"),
      connectorId: expectString(
        value.connector_id,
        "connector_credential.connector_id"
      ),
      kind: expectString(value.kind, "connector_credential.kind"),
      secretRef: expectString(value.secret_ref, "connector_credential.secret_ref"),
      state: expectConnectorCredentialState(value.state),
      createdAt: expectNumber(value.created_at, "connector_credential.created_at"),
      updatedAt: expectNumber(value.updated_at, "connector_credential.updated_at")
    },
    {
      metadata: value.metadata ?? undefined,
      revokedAt: optionalNumber(value.revoked_at, "connector_credential.revoked_at")
    }
  )
}
