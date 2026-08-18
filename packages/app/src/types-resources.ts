import type {
  GetResourceRequest,
  IngestResourceRequest,
  ReadResourceContentRequest,
  ResourceContentChunk,
  ResourceRecord
} from "@wanex/protocol"

export interface WanexAppResourceCommands {
  ingestResource(
    request: IngestResourceRequest
  ): Promise<ResourceRecord>
  readResource(
    request: GetResourceRequest
  ): Promise<ResourceRecord | null>
  readResourceContent(
    request: ReadResourceContentRequest
  ): Promise<ResourceContentChunk | null>
}
