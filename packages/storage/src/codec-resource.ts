import {
  type CleanupExpiredResourceTicketsRequest,
  type DoctorReport,
  type FileRecord,
  type IngestResourceRequest,
  type JsonValue,
  type ListResourcesRequest,
  type ResourceContentChunk,
  type ResourceRecord,
  type ResourceTicket,
  type ResourceTicketCleanupReceipt
} from "@wanex/protocol"

import {
  assertArray,
  expectNumber,
  expectResourceKind,
  expectResourceOrigin,
  expectResourceSource,
  expectResourceState,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  toRpcJsonValue,
  withOptionalFields
} from "./codec-helpers.js"
import type {
  CleanupExpiredResourceTicketsWire,
  IngestResourceWire,
  ListResourcesWire
} from "./generated/storage-rpc.js"

export function fromRpcFileRecord(value: JsonValue): FileRecord {
  if (!isRecord(value)) {
    throw new Error("file record must be an object")
  }
  return {
    resourceId: expectString(value.resource_id, "file.resource_id"),
    logicalPath: expectString(value.logical_path, "file.logical_path"),
    sizeBytes: expectNumber(value.size_bytes, "file.size_bytes"),
    sha256: expectString(value.sha256, "file.sha256"),
    updatedAt: expectNumber(value.updated_at, "file.updated_at")
  }
}

export function toRpcIngestResourceRequest(
  request: IngestResourceRequest
): IngestResourceWire {
  return {
    id: request.id ?? null,
    logical_path: request.logicalPath ?? null,
    content_base64: Buffer.from(request.content).toString("base64"),
    media_type: request.mediaType ?? null,
    kind: request.kind ?? null,
    origin: request.origin ?? null,
    label: request.label ?? null,
    source:
      request.source === undefined
        ? null
        : {
            provider: request.source.provider ?? null,
            provider_file_id: request.source.providerFileId ?? null,
            provider_operation_id: request.source.providerOperationId ?? null,
            source_url: request.source.sourceUrl ?? null,
            source_expires_at: request.source.sourceExpiresAt ?? null
          },
    metadata: toRpcJsonValue(request.metadata ?? null),
    width: request.width ?? null,
    height: request.height ?? null,
    duration_ms: request.durationMs ?? null,
    expected_sha256: request.expectedSha256 ?? null
  }
}

export function toRpcListResourcesRequest(
  request: ListResourcesRequest
): ListResourcesWire {
  return {
    kind: request.kind ?? null,
    origin: request.origin ?? null,
    state: request.state ?? null,
    limit: request.limit ?? null
  }
}

export function fromRpcResourceRecord(value: JsonValue): ResourceRecord {
  if (!isRecord(value)) {
    throw new Error("resource record must be an object")
  }
  const record = {
    id: expectString(value.id, "resource.id"),
    logicalPath: expectString(value.logical_path, "resource.logical_path"),
    kind: expectResourceKind(value.kind, "resource.kind"),
    origin: expectResourceOrigin(value.origin, "resource.origin"),
    state: expectResourceState(value.state, "resource.state"),
    sizeBytes: expectNumber(value.size_bytes, "resource.size_bytes"),
    sha256: expectString(value.sha256, "resource.sha256"),
    createdAt: expectNumber(value.created_at, "resource.created_at"),
    updatedAt: expectNumber(value.updated_at, "resource.updated_at")
  }
  return withOptionalFields(record, {
    mediaType: optionalString(value.media_type, "resource.media_type"),
    label: optionalString(value.label, "resource.label"),
    source:
      value.source === null || value.source === undefined
        ? undefined
        : expectResourceSource(value.source),
    metadata: value.metadata ?? undefined,
    width: optionalNumber(value.width, "resource.width"),
    height: optionalNumber(value.height, "resource.height"),
    durationMs: optionalNumber(value.duration_ms, "resource.duration_ms")
  })
}

export function fromRpcResourceContentChunk(
  value: JsonValue
): ResourceContentChunk {
  if (!isRecord(value)) {
    throw new Error("resource content chunk must be an object")
  }
  const contentBase64 = expectString(
    value.content_base64,
    "resource content chunk.content_base64"
  )
  const eof = value.eof
  if (typeof eof !== "boolean") {
    throw new Error("resource content chunk.eof must be a boolean")
  }
  return {
    resourceId: expectString(
      value.resource_id,
      "resource content chunk.resource_id"
    ),
    sha256: expectString(value.sha256, "resource content chunk.sha256"),
    totalSizeBytes: expectNumber(
      value.total_size_bytes,
      "resource content chunk.total_size_bytes"
    ),
    offset: expectNumber(value.offset, "resource content chunk.offset"),
    content: Uint8Array.from(Buffer.from(contentBase64, "base64")),
    eof
  }
}

export function fromRpcResourceTicket(value: JsonValue): ResourceTicket {
  if (!isRecord(value)) {
    throw new Error("resource ticket must be an object")
  }
  const capability = expectString(
    value.capability,
    "ticket.capability"
  ) as ResourceTicket["capability"]
  if (capability !== "read" && capability !== "write") {
    throw new Error(`invalid ticket capability: ${capability}`)
  }
  const record = {
    id: expectString(value.id, "ticket.id"),
    principalId: expectString(value.principal_id, "ticket.principal_id"),
    resourceId: expectString(value.resource_id, "ticket.resource_id"),
    capability,
    expiresAt: expectNumber(value.expires_at, "ticket.expires_at")
  }
  return withOptionalFields(record, {
    revokedAt:
      value.revoked_at === null || value.revoked_at === undefined
        ? undefined
        : expectNumber(value.revoked_at, "ticket.revoked_at")
  })
}

export function toRpcCleanupExpiredResourceTicketsRequest(
  request: CleanupExpiredResourceTicketsRequest
): CleanupExpiredResourceTicketsWire {
  return {
    now_ms: request.nowMs ?? null,
    limit: request.limit ?? null
  }
}

export function fromRpcResourceTicketCleanupReceipt(
  value: JsonValue
): ResourceTicketCleanupReceipt {
  if (!isRecord(value)) {
    throw new Error("resource ticket cleanup receipt must be an object")
  }
  assertArray(value.revoked_ticket_ids, "resource cleanup revoked_ticket_ids")
  return {
    revokedCount: expectNumber(
      value.revoked_count,
      "resource cleanup revoked_count"
    ),
    revokedTicketIds: value.revoked_ticket_ids.map((id) =>
      expectString(id, "resource cleanup revoked_ticket_ids[]")
    ),
    nowMs: expectNumber(value.now_ms, "resource cleanup now_ms")
  }
}

export function fromRpcDoctorReport(value: JsonValue): DoctorReport {
  if (!isRecord(value)) {
    throw new Error("doctor report must be an object")
  }
  assertArray(value.checks, "doctor.checks")
  return {
    storePath: expectString(value.store_path, "doctor.store_path"),
    schemaVersion: expectNumber(value.schema_version, "doctor.schema_version"),
    checks: value.checks.map((check) => {
      if (!isRecord(check)) {
        throw new Error("doctor check must be an object")
      }
      const state = expectString(check.state, "doctor.check.state")
      if (state !== "ok" && state !== "warn" && state !== "error") {
        throw new Error(`invalid doctor check state: ${state}`)
      }
      return {
        name: expectString(check.name, "doctor.check.name"),
        state,
        message: expectString(check.message, "doctor.check.message")
      }
    })
  }
}
