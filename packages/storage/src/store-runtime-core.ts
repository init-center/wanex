import type {
  AtomicWriteRequest,
  CleanupExpiredResourceTicketsRequest,
  DoctorReport,
  FileRecord,
  GetResourceRequest,
  IngestResourceRequest,
  JsonValue,
  ListResourceProvenanceRequest,
  ListResourcesRequest,
  QueryEventsInput,
  ReadResourceContentRequest,
  ResourceContentChunk,
  ResourceProvenanceRecord,
  ResourceRecord,
  ResourceTicket,
  ResourceTicketCleanupReceipt,
  ResourceTicketRequest,
  RecordResourceProvenanceRequest,
  RuntimeEvent
} from "@wanex/protocol"

import {
  assertArray,
  expectBoolean,
  fromRpcDoctorReport,
  fromRpcEvent,
  fromRpcFileRecord,
  fromRpcResourceRecord,
  fromRpcResourceProvenanceRecord,
  fromRpcResourceContentChunk,
  fromRpcResourceTicket,
  fromRpcResourceTicketCleanupReceipt,
  toRpcCleanupExpiredResourceTicketsRequest,
  toRpcEvent,
  toRpcIngestResourceRequest,
  toRpcJsonValue,
  toRpcListResourcesRequest,
  toRpcListResourceProvenanceRequest,
  toRpcRecordResourceProvenanceRequest,
  toRpcQueryEvents
} from "./codec.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"
import type { RuntimeStorageRpcCommand } from "./generated/storage-rpc.js"

export class RuntimeStoreMethods extends RpcStoreFacetBase {
  async appendEvent(event: RuntimeEvent): Promise<void> {
    await this.callRuntime({
      command: "append-event",
      event: toRpcEvent(event)
    })
  }

  async queryEvents(query: QueryEventsInput): Promise<RuntimeEvent[]> {
    const value = await this.callRuntime({
      command: "query-events",
      query: toRpcQueryEvents(query)
    })
    assertArray(value, "query-events")
    return value.map(fromRpcEvent)
  }

  async putConfig(key: string, value: JsonValue): Promise<void> {
    await this.callRuntime({
      command: "put-config",
      key,
      value: toRpcJsonValue(value)
    })
  }

  async applyConfigMutations(request: {
    readonly puts: readonly { readonly key: string; readonly value: JsonValue }[]
    readonly deletes: readonly string[]
  }): Promise<void> {
    await this.callRuntime({
      command: "apply-config-mutations",
      puts: request.puts.map((entry) => ({
        key: entry.key,
        value: toRpcJsonValue(entry.value)
      })),
      deletes: [...request.deletes]
    })
  }

  async hasLiveSecretReference(secretRef: string): Promise<boolean> {
    return expectBoolean(await this.callRuntime({
      command: "has-live-secret-reference",
      secret_ref: secretRef
    }), "has-live-secret-reference")
  }

  async getConfig(key: string): Promise<JsonValue | null> {
    return await this.callRuntime({
      command: "get-config",
      key
    })
  }

  async writeAtomicFile(request: AtomicWriteRequest): Promise<FileRecord> {
    const value = await this.callRuntime({
      command: "write-atomic-file",
      logical_path: request.logicalPath,
      content_base64: Buffer.from(request.content).toString("base64"),
      expected_sha256: request.expectedSha256 ?? null
    })
    return fromRpcFileRecord(value)
  }

  async ingestResource(
    request: IngestResourceRequest
  ): Promise<ResourceRecord> {
    const value = await this.callRuntime({
      command: "ingest-resource",
      request: toRpcIngestResourceRequest(request)
    })
    return fromRpcResourceRecord(value)
  }

  async getResource(
    request: GetResourceRequest
  ): Promise<ResourceRecord | null> {
    const value = await this.callRuntime({
      command: "get-resource",
      resource_id: request.resourceId
    })
    return value === null ? null : fromRpcResourceRecord(value)
  }

  async readResourceContent(
    request: ReadResourceContentRequest
  ): Promise<ResourceContentChunk | null> {
    const value = await this.callRuntime({
      command: "read-resource-content",
      resource_id: request.resourceId,
      expected_sha256: request.expectedSha256,
      offset: request.offset,
      limit: request.limit
    })
    return value === null ? null : fromRpcResourceContentChunk(value)
  }

  async listResources(
    request: ListResourcesRequest
  ): Promise<ResourceRecord[]> {
    const value = await this.callRuntime({
      command: "list-resources",
      request: toRpcListResourcesRequest(request)
    })
    assertArray(value, "resources")
    return value.map(fromRpcResourceRecord)
  }

  async recordResourceProvenance(
    request: RecordResourceProvenanceRequest
  ): Promise<ResourceProvenanceRecord> {
    const value = await this.callRuntime({
      command: "record-resource-provenance",
      request: toRpcRecordResourceProvenanceRequest(request)
    })
    return fromRpcResourceProvenanceRecord(value)
  }

  async listResourceProvenance(
    request: ListResourceProvenanceRequest
  ): Promise<ResourceProvenanceRecord[]> {
    const value = await this.callRuntime({
      command: "list-resource-provenance",
      request: toRpcListResourceProvenanceRequest(request)
    })
    assertArray(value, "resource provenance")
    return value.map(fromRpcResourceProvenanceRecord)
  }

  async createResourceTicket(
    request: ResourceTicketRequest
  ): Promise<ResourceTicket> {
    const value = await this.callRuntime({
      command: "create-resource-ticket",
      principal_id: request.principalId,
      resource_id: request.resourceId,
      capability: request.capability,
      expires_at: request.expiresAt
    })
    return fromRpcResourceTicket(value)
  }

  async cleanupExpiredResourceTickets(
    request: CleanupExpiredResourceTicketsRequest
  ): Promise<ResourceTicketCleanupReceipt> {
    const value = await this.callRuntime({
      command: "cleanup-expired-resource-tickets",
      request: toRpcCleanupExpiredResourceTicketsRequest(request)
    })
    return fromRpcResourceTicketCleanupReceipt(value)
  }

  async doctor(): Promise<DoctorReport> {
    const value = await this.callRuntime({ command: "doctor" })
    return fromRpcDoctorReport(value)
  }

  private callRuntime(request: RuntimeStorageRpcCommand) {
    return this.call(request)
  }
}
