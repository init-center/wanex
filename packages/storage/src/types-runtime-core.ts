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

export interface RuntimeStore {
  appendEvent(event: RuntimeEvent): Promise<void>
  queryEvents(query: QueryEventsInput): Promise<RuntimeEvent[]>
  putConfig(key: string, value: JsonValue): Promise<void>
  getConfig(key: string): Promise<JsonValue | null>
  writeAtomicFile(request: AtomicWriteRequest): Promise<FileRecord>
  ingestResource(request: IngestResourceRequest): Promise<ResourceRecord>
  getResource(request: GetResourceRequest): Promise<ResourceRecord | null>
  listResources(request: ListResourcesRequest): Promise<ResourceRecord[]>
  createResourceTicket(request: ResourceTicketRequest): Promise<ResourceTicket>
  cleanupExpiredResourceTickets(
    request: CleanupExpiredResourceTicketsRequest
  ): Promise<ResourceTicketCleanupReceipt>
  doctor(): Promise<DoctorReport>
}
