import type {
  IngestResourceRequest,
  ResourceKind,
  ResourceSource
} from "@wanex/protocol"
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
    case "provider_file":
    case "remote_url":
    case "async_operation":
      throw new Error(
        `${output.kindOfOutput} provider output must be materialized before resource ingest`
      )
  }
}

function commonRequest(
  output: ProviderArtifactBase,
  bytes: Uint8Array,
  source?: ResourceSource
): IngestResourceRequest {
  const kind = output.kind ?? kindForMediaType(output.mediaType)
  return {
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
