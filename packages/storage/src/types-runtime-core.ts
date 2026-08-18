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

export interface RuntimeStore {
  appendEvent(event: RuntimeEvent): Promise<void>
  queryEvents(query: QueryEventsInput): Promise<RuntimeEvent[]>
  putConfig(key: string, value: JsonValue): Promise<void>
  applyConfigMutations(request: ConfigMutationRequest): Promise<void>
  hasLiveSecretReference(secretRef: string): Promise<boolean>
  getConfig(key: string): Promise<JsonValue | null>
  writeAtomicFile(request: AtomicWriteRequest): Promise<FileRecord>
  ingestResource(request: IngestResourceRequest): Promise<ResourceRecord>
  getResource(request: GetResourceRequest): Promise<ResourceRecord | null>
  readResourceContent(
    request: ReadResourceContentRequest
  ): Promise<ResourceContentChunk | null>
  listResources(request: ListResourcesRequest): Promise<ResourceRecord[]>
  recordResourceProvenance(
    request: RecordResourceProvenanceRequest
  ): Promise<ResourceProvenanceRecord>
  listResourceProvenance(
    request: ListResourceProvenanceRequest
  ): Promise<ResourceProvenanceRecord[]>
  createResourceTicket(request: ResourceTicketRequest): Promise<ResourceTicket>
  cleanupExpiredResourceTickets(
    request: CleanupExpiredResourceTicketsRequest
  ): Promise<ResourceTicketCleanupReceipt>
  doctor(): Promise<DoctorReport>
}

export interface ConfigMutationRequest {
  readonly puts: readonly ConfigPut[]
  readonly deletes: readonly string[]
}

export interface ConfigPut {
  readonly key: string
  readonly value: JsonValue
}
