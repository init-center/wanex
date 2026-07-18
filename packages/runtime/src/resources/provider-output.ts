import type {
  IngestResourceRequest,
  ResourceKind,
  ResourceSource
} from "@wanex/protocol"
import { stableResourceLogicalPath } from "./path.js"
import type {
  ProviderArtifactBase,
  ProviderArtifactOutput
} from "./types.js"

export function providerOutputToIngestRequest(
  output: ProviderArtifactOutput
): IngestResourceRequest {
  switch (output.kindOfOutput) {
    case "base64": {
      const bytes = Buffer.from(output.data, "base64")
      return commonRequest(output, bytes)
    }
    case "inline_bytes":
      return commonRequest(output, output.bytes)
    case "provider_file": {
      const provider = requireProvider(output.provider, output.kindOfOutput)
      const text =
        output.placeholderText ??
        `provider file reference: ${provider}/${output.fileId}\n`
      return commonRequest(output, new TextEncoder().encode(text), {
        provider,
        providerFileId: output.fileId
      })
    }
    case "remote_url": {
      const text =
        output.placeholderText ?? `remote resource reference: ${output.url}\n`
      return commonRequest(output, new TextEncoder().encode(text), {
        ...(output.provider === undefined ? {} : { provider: output.provider }),
        sourceUrl: output.url,
        ...(output.expiresAt === undefined
          ? {}
          : { sourceExpiresAt: output.expiresAt })
      })
    }
    case "async_operation": {
      const provider = requireProvider(output.provider, output.kindOfOutput)
      const text =
        output.placeholderText ??
        `provider operation reference: ${provider}/${output.operationId}\n`
      return commonRequest(output, new TextEncoder().encode(text), {
        provider,
        providerOperationId: output.operationId
      })
    }
  }
}

function commonRequest(
  output: ProviderArtifactBase,
  bytes: Uint8Array,
  source?: ResourceSource
): IngestResourceRequest {
  const kind = output.kind ?? kindForMediaType(output.mediaType)
  return {
    logicalPath: stableResourceLogicalPath(kind, bytes, output.mediaType),
    content: bytes,
    ...(output.mediaType === undefined ? {} : { mediaType: output.mediaType }),
    kind,
    origin: output.origin ?? "model_output",
    ...(output.label === undefined ? {} : { label: output.label }),
    ...(source === undefined ? {} : { source }),
    ...(output.metadata === undefined ? {} : { metadata: output.metadata }),
    ...(output.width === undefined ? {} : { width: output.width }),
    ...(output.height === undefined ? {} : { height: output.height }),
    ...(output.durationMs === undefined ? {} : { durationMs: output.durationMs })
  }
}

function kindForMediaType(mediaType: string | undefined): ResourceKind {
  if (mediaType?.startsWith("image/")) {
    return "image"
  }
  if (mediaType?.startsWith("video/")) {
    return "video"
  }
  if (mediaType?.startsWith("audio/")) {
    return "audio"
  }
  if (mediaType === "application/pdf" || mediaType?.startsWith("text/")) {
    return "document"
  }
  return "artifact"
}

function requireProvider(
  provider: string | undefined,
  outputKind: ProviderArtifactOutput["kindOfOutput"]
): string {
  if (provider === undefined || provider.length === 0) {
    throw new Error(`provider is required for ${outputKind} resource output`)
  }
  return provider
}
