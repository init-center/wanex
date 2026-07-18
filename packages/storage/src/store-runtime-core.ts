import type {
  AtomicWriteRequest,
  CleanupExpiredResourceTicketsRequest,
  DoctorReport,
  FileRecord,
  GetResourceRequest,
  IngestResourceRequest,
  JsonValue,
  ListResourcesRequest,
  QueryEventsInput,
  ResourceRecord,
  ResourceTicket,
  ResourceTicketCleanupReceipt,
  ResourceTicketRequest,
  RuntimeEvent
} from "@wanex/protocol"

import {
  assertArray,
  fromRpcDoctorReport,
  fromRpcEvent,
  fromRpcFileRecord,
  fromRpcResourceRecord,
  fromRpcResourceTicket,
  fromRpcResourceTicketCleanupReceipt,
  toRpcCleanupExpiredResourceTicketsRequest,
  toRpcEvent,
  toRpcIngestResourceRequest,
  toRpcJsonValue,
  toRpcListResourcesRequest,
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
