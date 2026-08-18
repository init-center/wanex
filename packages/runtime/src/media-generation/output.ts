import type {
  IngestResourceRequest,
  MediaGenerationOutputReferenceRecord,
  ResourceKind
} from "@wanex/protocol"
import { sha256Bytes } from "../resources/index.js"
import type {
  MediaGenerationMaterializedOutput,
  MediaGenerationProviderOutput,
  MediaGenerationProviderOutputBase
} from "./types.js"

type ReferenceOutput = Extract<
  MediaGenerationProviderOutput,
  { kindOfOutput: "provider_file" | "remote_url" }
>

export function isReferenceOutput(
  output: MediaGenerationProviderOutput
): output is ReferenceOutput {
  return (
    output.kindOfOutput === "provider_file" ||
    output.kindOfOutput === "remote_url"
  )
}

export function toOutputReference(
  output: ReferenceOutput
): MediaGenerationOutputReferenceRecord {
  if (output.kindOfOutput === "provider_file") {
    return {
      kindOfReference: "provider_file",
      provider: output.provider,
      providerFileId: output.fileId,
      ...outputMetadata(output)
    }
  }
  return {
    kindOfReference: "remote_url",
    ...(output.provider === undefined ? {} : { provider: output.provider }),
    sourceUrl: output.url,
    ...(output.expiresAt === undefined
      ? {}
      : { sourceExpiresAt: output.expiresAt }),
    ...outputMetadata(output)
  }
}

export function toProviderReference(output: ReferenceOutput) {
  if (output.kindOfOutput === "provider_file") {
    return {
      kindOfReference: "provider_file" as const,
      provider: output.provider,
      fileId: output.fileId,
      ...outputMetadata(output)
    }
  }
  return {
    kindOfReference: "remote_url" as const,
    url: output.url,
    ...(output.expiresAt === undefined ? {} : { expiresAt: output.expiresAt }),
    ...outputMetadata(output)
  }
}

export function referenceToOutput(
  reference: MediaGenerationOutputReferenceRecord
): MediaGenerationProviderOutput {
  if (reference.kindOfReference === "provider_file") {
    if (
      reference.provider === undefined ||
      reference.providerFileId === undefined
    ) {
      throw new Error("provider file output reference is incomplete")
    }
    return {
      kindOfOutput: "provider_file",
      provider: reference.provider,
      fileId: reference.providerFileId,
      ...outputMetadata(reference)
    }
  }
  if (reference.sourceUrl === undefined) {
    throw new Error("remote URL output reference is incomplete")
  }
  return {
    kindOfOutput: "remote_url",
    ...(reference.provider === undefined
      ? {}
      : { provider: reference.provider }),
    url: reference.sourceUrl,
    ...(reference.sourceExpiresAt === undefined
      ? {}
      : { expiresAt: reference.sourceExpiresAt }),
    ...outputMetadata(reference)
  }
}

export function materializedOutputToIngestRequest(
  output: MediaGenerationMaterializedOutput
): IngestResourceRequest {
  const kind = output.kind ?? kindForMediaType(output.mediaType)
  return {
    content: output.bytes,
    kind,
    origin: "model_output",
    ...outputMetadata(output),
    expectedSha256: sha256Bytes(output.bytes)
  }
}

function outputMetadata(output: MediaGenerationProviderOutputBase) {
  return {
    ...(output.mediaType === undefined ? {} : { mediaType: output.mediaType }),
    ...(output.kind === undefined ? {} : { kind: output.kind }),
    ...(output.label === undefined ? {} : { label: output.label }),
    ...(output.metadata === undefined ? {} : { metadata: output.metadata }),
    ...(output.width === undefined ? {} : { width: output.width }),
    ...(output.height === undefined ? {} : { height: output.height }),
    ...(output.durationMs === undefined
      ? {}
      : { durationMs: output.durationMs })
  }
}

function kindForMediaType(mediaType: string | undefined): ResourceKind {
  if (mediaType?.startsWith("image/")) return "image"
  if (mediaType?.startsWith("video/")) return "video"
  if (mediaType?.startsWith("audio/")) return "audio"
  return "artifact"
}
