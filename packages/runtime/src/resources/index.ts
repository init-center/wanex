import type {
  IngestResourceRequest,
  ResourceRecord
} from "@wanex/protocol"
import type { RuntimeStore } from "@wanex/storage"
import { providerOutputToIngestRequest } from "./provider-output.js"
import type {
  ProviderArtifactOutput,
  WanexResourceRuntimeOptions
} from "./types.js"

export const WANEX_RUNTIME_RESOURCES = "wanex-runtime-resources" as const

export type {
  ArtifactBundle,
  ContextResourceSummary,
  ProviderArtifactBase,
  ProviderArtifactOutput,
  ProviderAsyncOperationArtifactOutput,
  ProviderBase64ArtifactOutput,
  ProviderFileArtifactOutput,
  ProviderInlineBytesArtifactOutput,
  ProviderRemoteUrlArtifactOutput,
  ProviderResourceInputAsyncOperationSource,
  ProviderResourceInputBase,
  ProviderResourceInputLocalResourceSource,
  ProviderResourceInputProviderFileSource,
  ProviderResourceInputRemoteUrlSource,
  ProviderResourceInputSource,
  ResourcePreviewKind,
  ResourceUiDescriptor,
  WanexResourceRuntimeOptions
} from "./types.js"
export { sha256Bytes, stableResourceLogicalPath } from "./path.js"
export { providerOutputToIngestRequest } from "./provider-output.js"
export {
  admitUserMessage,
  assertTurnResourcesMatchBinding,
  prepareProviderReplayResources,
  readExactResourceBytes,
  resourceInputModality
} from "./input.js"
export {
  resourceToContextSummary,
  resourceToMessagePart,
  resourceToProviderInput,
  resourceToUiDescriptor,
  resourcesToArtifactBundle
} from "./projections.js"

export class WanexResourceRuntime {
  private readonly storage: RuntimeStore

  constructor(options: WanexResourceRuntimeOptions) {
    this.storage = options.storage
  }

  async ingestProviderOutput(
    output: ProviderArtifactOutput
  ): Promise<ResourceRecord> {
    return await this.storage.ingestResource(
      providerOutputToIngestRequest(output)
    )
  }

  async ingestBytes(request: IngestResourceRequest): Promise<ResourceRecord> {
    return await this.storage.ingestResource(request)
  }
}
