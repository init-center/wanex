import type {
  GetResourceRequest,
  IngestResourceRequest,
  ResourceRecord
} from "@wanex/protocol"

export interface WanexAppResourceCommands {
  ingestResource(
    request: IngestResourceRequest
  ): Promise<ResourceRecord>
  readResource(
    request: GetResourceRequest
  ): Promise<ResourceRecord | null>
}
