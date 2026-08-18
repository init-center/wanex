import {
  type CleanupExpiredResourceTicketsRequest,
  type DoctorReport,
  type FileRecord,
  type IngestResourceRequest,
  type JsonValue,
  type ListResourcesRequest,
  type ResourceContentChunk,
  type ResourceInputEvidence,
  type ResourceProvenanceCause,
  type ResourceProvenanceRecord,
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
  ListResourceProvenanceWire,
  ListResourcesWire,
  RecordResourceProvenanceWire,
  ResourceInputEvidenceWire,
  ResourceProvenanceCauseWire
} from "./generated/storage-rpc.js"
import { digestCanonicalJson } from "./codec-canonical.js"

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

export function toRpcResourceInputEvidence(
  evidence: ResourceInputEvidence
): ResourceInputEvidenceWire {
  validateResourceInputEvidence(evidence)
  return {
    resource_id: evidence.resourceId,
    sha256: evidence.sha256,
    size_bytes: evidence.sizeBytes,
    kind: evidence.kind,
    media_type: evidence.mediaType ?? null
  }
}

export function fromRpcResourceInputEvidence(
  value: JsonValue,
  name = "resource evidence"
): ResourceInputEvidence {
  if (!isRecord(value)) throw new Error(`${name} must be an object`)
  const evidence = withOptionalFields(
    {
      resourceId: expectString(value.resource_id, `${name}.resource_id`),
      sha256: expectString(value.sha256, `${name}.sha256`),
      sizeBytes: expectNumber(value.size_bytes, `${name}.size_bytes`),
      kind: expectResourceKind(value.kind, `${name}.kind`)
    },
    { mediaType: optionalString(value.media_type, `${name}.media_type`) }
  )
  validateResourceInputEvidence(evidence)
  return evidence
}

export function toRpcRecordResourceProvenanceRequest(
  request: import("@wanex/protocol").RecordResourceProvenanceRequest
): RecordResourceProvenanceWire {
  if (request.inputResources.length > 64) {
    throw new Error("resource provenance accepts at most 64 inputs")
  }
  assertUniqueResourceEvidence(request.inputResources, "resource provenance inputs")
  return {
    resource: toRpcResourceInputEvidence(request.resource),
    cause: toRpcResourceProvenanceCause(request.cause),
    input_resources: request.inputResources.map(toRpcResourceInputEvidence)
  }
}

export function toRpcListResourceProvenanceRequest(
  request: import("@wanex/protocol").ListResourceProvenanceRequest
): ListResourceProvenanceWire {
  if (request.causeId !== undefined && request.causeKind === undefined) {
    throw new Error("resource provenance causeId requires causeKind")
  }
  return {
    resource_id: request.resourceId ?? null,
    cause_kind: request.causeKind ?? null,
    cause_id: request.causeId ?? null,
    limit: request.limit ?? null
  }
}

export function fromRpcResourceProvenanceRecord(
  value: JsonValue
): ResourceProvenanceRecord {
  if (!isRecord(value)) throw new Error("resource provenance must be an object")
  assertArray(value.input_resources, "resource provenance.input_resources")
  const resource = fromRpcResourceInputEvidence(
    value.resource ?? null,
    "resource provenance.resource"
  )
  const cause = fromRpcResourceProvenanceCause(value.cause ?? null)
  const inputResources = value.input_resources.map((input, index) =>
    fromRpcResourceInputEvidence(input, `resource provenance.input_resources.${index}`)
  )
  assertUniqueResourceEvidence(inputResources, "resource provenance inputs")
  const digest = expectString(value.digest, "resource provenance.digest")
  const actualDigest = resourceProvenanceDigest({ resource, cause, inputResources })
  if (digest !== actualDigest) throw new Error("resource provenance digest is invalid")
  const id = expectString(value.id, "resource provenance.id")
  if (id !== `rprov_${digest}`) throw new Error("resource provenance id is invalid")
  return {
    id,
    resource,
    cause,
    inputResources,
    digest,
    createdAt: expectNumber(value.created_at, "resource provenance.created_at")
  }
}

function toRpcResourceProvenanceCause(
  cause: ResourceProvenanceCause
): ResourceProvenanceCauseWire {
  if (cause.kind === "media_generation") {
    return { kind: cause.kind, operation_id: requireNonEmpty(cause.operationId, "operationId") }
  }
  return {
    kind: cause.kind,
    execution_id: requireNonEmpty(cause.executionId, "executionId"),
    session_id: requireNonEmpty(cause.sessionId, "sessionId"),
    turn_id: requireNonEmpty(cause.turnId, "turnId"),
    source_message_id: requireNonEmpty(cause.sourceMessageId, "sourceMessageId"),
    tool_call_id: requireNonEmpty(cause.toolCallId, "toolCallId")
  }
}

function fromRpcResourceProvenanceCause(value: JsonValue): ResourceProvenanceCause {
  if (!isRecord(value)) throw new Error("resource provenance cause must be an object")
  if (value.kind === "media_generation") {
    return {
      kind: value.kind,
      operationId: requireNonEmpty(
        expectString(value.operation_id, "resource provenance cause.operation_id"),
        "operation_id"
      )
    }
  }
  if (value.kind !== "tool_execution") {
    throw new Error("resource provenance cause kind is invalid")
  }
  return {
    kind: value.kind,
    executionId: requireNonEmpty(expectString(value.execution_id, "cause.execution_id"), "execution_id"),
    sessionId: requireNonEmpty(expectString(value.session_id, "cause.session_id"), "session_id"),
    turnId: requireNonEmpty(expectString(value.turn_id, "cause.turn_id"), "turn_id"),
    sourceMessageId: requireNonEmpty(expectString(value.source_message_id, "cause.source_message_id"), "source_message_id"),
    toolCallId: requireNonEmpty(expectString(value.tool_call_id, "cause.tool_call_id"), "tool_call_id")
  }
}

function resourceProvenanceDigest(request: {
  readonly resource: ResourceInputEvidence
  readonly cause: ResourceProvenanceCause
  readonly inputResources: readonly ResourceInputEvidence[]
}): string {
  return digestCanonicalJson({
    resource: resourceInputEvidenceJson(request.resource),
    cause: resourceProvenanceCauseJson(request.cause),
    inputResources: request.inputResources.map(resourceInputEvidenceJson)
  })
}

export function resourceInputEvidenceJson(
  evidence: ResourceInputEvidence
): Readonly<Record<string, JsonValue>> {
  return {
    resourceId: evidence.resourceId,
    sha256: evidence.sha256,
    sizeBytes: evidence.sizeBytes,
    kind: evidence.kind,
    ...(evidence.mediaType === undefined ? {} : { mediaType: evidence.mediaType })
  }
}

function resourceProvenanceCauseJson(
  cause: ResourceProvenanceCause
): Readonly<Record<string, JsonValue>> {
  return cause.kind === "media_generation"
    ? { kind: cause.kind, operationId: cause.operationId }
    : {
        kind: cause.kind,
        executionId: cause.executionId,
        sessionId: cause.sessionId,
        turnId: cause.turnId,
        sourceMessageId: cause.sourceMessageId,
        toolCallId: cause.toolCallId
      }
}

function validateResourceInputEvidence(evidence: ResourceInputEvidence): void {
  requireNonEmpty(evidence.resourceId, "resourceId")
  if (!/^[0-9a-f]{64}$/.test(evidence.sha256)) {
    throw new Error("resource evidence sha256 must be lowercase SHA-256")
  }
  if (!Number.isSafeInteger(evidence.sizeBytes) || evidence.sizeBytes <= 0) {
    throw new Error("resource evidence sizeBytes must be a positive safe integer")
  }
  if (evidence.mediaType !== undefined) requireNonEmpty(evidence.mediaType, "mediaType")
}

function assertUniqueResourceEvidence(
  resources: readonly ResourceInputEvidence[],
  name: string
): void {
  const seen = new Set<string>()
  for (const resource of resources) {
    validateResourceInputEvidence(resource)
    if (seen.has(resource.resourceId)) throw new Error(`${name} contains a duplicate resource`)
    seen.add(resource.resourceId)
  }
}

function requireNonEmpty(value: string, name: string): string {
  if (value.length === 0) throw new Error(`${name} must not be empty`)
  return value
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
