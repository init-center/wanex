import type {
  ResourceMessagePart,
  ResourceRecord
} from "@wanex/protocol"
import type {
  ArtifactBundle,
  ContextResourceSummary,
  ProviderResourceInputBase,
  ProviderResourceInputSource,
  ResourcePreviewKind,
  ResourceUiDescriptor
} from "./types.js"

export function resourceToMessagePart(
  resource: ResourceRecord,
  id?: string
): ResourceMessagePart {
  return {
    type: "resource",
    id: id ?? `resource_${resource.id}`,
    resourceId: resource.id,
    ...(resource.mediaType === undefined ? {} : { mediaType: resource.mediaType })
  }
}

export function resourceToUiDescriptor(
  resource: ResourceRecord
): ResourceUiDescriptor {
  return {
    resourceId: resource.id,
    kind: resource.kind,
    previewKind: previewKindForResource(resource),
    ...(resource.label === undefined ? {} : { label: resource.label }),
    ...(resource.mediaType === undefined ? {} : { mediaType: resource.mediaType }),
    sizeBytes: resource.sizeBytes,
    sha256: resource.sha256,
    ...(resource.width === undefined ? {} : { width: resource.width }),
    ...(resource.height === undefined ? {} : { height: resource.height }),
    ...(resource.durationMs === undefined ? {} : { durationMs: resource.durationMs }),
    state: resource.state,
    origin: resource.origin,
    ...(resource.source === undefined ? {} : { source: resource.source }),
    ...(resource.metadata === undefined ? {} : { metadata: resource.metadata })
  }
}

export function resourceToProviderInput(
  resource: ResourceRecord
): ProviderResourceInputSource {
  const base = providerInputBase(resource)
  if (resource.source?.providerFileId !== undefined) {
    return {
      ...base,
      sourceKind: "provider_file",
      provider: requireProvider(resource.source.provider, "provider_file"),
      providerFileId: resource.source.providerFileId
    }
  }
  if (resource.source?.sourceUrl !== undefined) {
    return {
      ...base,
      sourceKind: "remote_url",
      url: resource.source.sourceUrl,
      ...(resource.source.sourceExpiresAt === undefined
        ? {}
        : { expiresAt: resource.source.sourceExpiresAt })
    }
  }
  if (resource.source?.providerOperationId !== undefined) {
    return {
      ...base,
      sourceKind: "async_operation",
      provider: requireProvider(resource.source.provider, "async_operation"),
      operationId: resource.source.providerOperationId
    }
  }
  return {
    ...base,
    sourceKind: "local_resource",
    sha256: resource.sha256,
    sizeBytes: resource.sizeBytes
  }
}

export function resourceToContextSummary(
  resource: ResourceRecord
): ContextResourceSummary {
  const parts = [
    resource.label ?? resource.kind,
    resource.mediaType,
    dimensionsText(resource),
    durationText(resource),
    `${resource.sizeBytes} bytes`,
    `resourceId=${resource.id}`
  ].filter((part): part is string => part !== undefined && part.length > 0)
  const text = `[resource: ${parts.join(", ")}]`
  return {
    resourceId: resource.id,
    text,
    tokenEstimate: Math.max(1, Math.ceil(text.length / 4))
  }
}

export function resourcesToArtifactBundle(
  resources: readonly ResourceRecord[]
): ArtifactBundle {
  return {
    resources: resources.map(resourceToUiDescriptor),
    providerInputs: resources.map(resourceToProviderInput),
    contextSummaries: resources.map(resourceToContextSummary)
  }
}

function previewKindForResource(resource: ResourceRecord): ResourcePreviewKind {
  switch (resource.kind) {
    case "image":
      return "image"
    case "video":
      return "video"
    case "audio":
      return "audio"
    case "document":
      return resource.mediaType?.startsWith("text/") ? "text" : "document"
    case "patch":
      return "patch"
    case "log":
      return "log"
    case "url":
      return "url"
    case "file":
    case "artifact":
      return "artifact"
  }
}

function providerInputBase(
  resource: ResourceRecord
): ProviderResourceInputBase {
  return {
    resourceId: resource.id,
    kind: resource.kind,
    ...(resource.mediaType === undefined ? {} : { mediaType: resource.mediaType }),
    ...(resource.label === undefined ? {} : { label: resource.label }),
    ...(resource.width === undefined ? {} : { width: resource.width }),
    ...(resource.height === undefined ? {} : { height: resource.height }),
    ...(resource.durationMs === undefined ? {} : { durationMs: resource.durationMs }),
    ...(resource.metadata === undefined ? {} : { metadata: resource.metadata })
  }
}

function dimensionsText(resource: ResourceRecord): string | undefined {
  if (resource.width === undefined || resource.height === undefined) {
    return undefined
  }
  return `${resource.width}x${resource.height}`
}

function durationText(resource: ResourceRecord): string | undefined {
  if (resource.durationMs === undefined) {
    return undefined
  }
  return `${resource.durationMs}ms`
}

function requireProvider(provider: string | undefined, sourceKind: string): string {
  if (provider === undefined || provider.length === 0) {
    throw new Error(`provider is required for ${sourceKind} resource output`)
  }
  return provider
}
