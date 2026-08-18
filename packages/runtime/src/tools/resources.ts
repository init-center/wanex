import { createHash } from "node:crypto"
import type {
  ResourceInputEvidence,
  ResourceKind,
  ResourceRecord,
  ToolResultResourceContentPart
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type {
  ToolInvocationIdentity,
  ToolOutputResourceRequest,
  ToolResourceOutputPort
} from "./types.js"

const MAX_TOOL_OUTPUT_BYTES = 25 * 1024 * 1024
const MAX_INPUT_RESOURCES = 64

interface ToolResourcePortIdentity extends ToolInvocationIdentity {
  readonly executionId: string
  readonly sourceMessageId: string
  readonly toolCallId: string
}

export function createToolResourceOutputPort(
  storage: Pick<CoreStore, "getResource" | "ingestResource" | "recordResourceProvenance">,
  identity: ToolResourcePortIdentity
): ToolResourceOutputPort {
  return Object.freeze({
    async publish(request: ToolOutputResourceRequest) {
      validatePublishRequest(request)
      const inputResources = await resolveInputResources(
        storage,
        request.inputResourceIds ?? []
      )
      const bytes = Uint8Array.from(request.content)
      const kind = request.kind ?? kindForMediaType(request.mediaType)
      const sha256 = createHash("sha256").update(bytes).digest("hex")
      const resource = await storage.ingestResource({
        content: bytes,
        kind,
        origin: "tool_output",
        expectedSha256: sha256,
        ...(request.mediaType === undefined ? {} : { mediaType: request.mediaType }),
        ...(request.label === undefined ? {} : { label: request.label }),
        ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
        ...(request.width === undefined ? {} : { width: request.width }),
        ...(request.height === undefined ? {} : { height: request.height }),
        ...(request.durationMs === undefined ? {} : { durationMs: request.durationMs })
      })
      const evidence = resourceEvidence(resource)
      await storage.recordResourceProvenance({
        resource: evidence,
        cause: {
          kind: "tool_execution",
          executionId: identity.executionId,
          sessionId: identity.sessionId,
          turnId: identity.turnId,
          sourceMessageId: identity.sourceMessageId,
          toolCallId: identity.toolCallId
        },
        inputResources
      })
      return { type: "resource" as const, ...evidence }
    },
    async reference(resourceId: string) {
      if (resourceId.length === 0) throw new Error("tool resourceId must not be empty")
      const resource = await storage.getResource({ resourceId })
      if (resource === null) throw new Error(`tool resource not found: ${resourceId}`)
      return { type: "resource" as const, ...resourceEvidence(resource) }
    }
  })
}

async function resolveInputResources(
  storage: Pick<CoreStore, "getResource">,
  resourceIds: readonly string[]
): Promise<ResourceInputEvidence[]> {
  if (resourceIds.length > MAX_INPUT_RESOURCES) {
    throw new Error(`tool output accepts at most ${MAX_INPUT_RESOURCES} input resources`)
  }
  const seen = new Set<string>()
  const resources: ResourceInputEvidence[] = []
  for (const resourceId of resourceIds) {
    if (resourceId.length === 0 || seen.has(resourceId)) {
      throw new Error(`tool output input resource is invalid or duplicated: ${resourceId}`)
    }
    seen.add(resourceId)
    const resource = await storage.getResource({ resourceId })
    if (resource === null) throw new Error(`tool input resource not found: ${resourceId}`)
    resources.push(resourceEvidence(resource))
  }
  return resources
}

function resourceEvidence(resource: ResourceRecord): ResourceInputEvidence {
  if (resource.state !== "available") {
    throw new Error(`tool resource is not available: ${resource.id}`)
  }
  if (!Number.isSafeInteger(resource.sizeBytes) || resource.sizeBytes <= 0) {
    throw new Error(`tool resource has invalid size: ${resource.id}`)
  }
  if (!/^[0-9a-f]{64}$/.test(resource.sha256)) {
    throw new Error(`tool resource has invalid sha256: ${resource.id}`)
  }
  return {
    resourceId: resource.id,
    sha256: resource.sha256,
    sizeBytes: resource.sizeBytes,
    kind: resource.kind,
    ...(resource.mediaType === undefined ? {} : { mediaType: resource.mediaType })
  }
}

function validatePublishRequest(request: ToolOutputResourceRequest): void {
  if (request.content.byteLength === 0 || request.content.byteLength > MAX_TOOL_OUTPUT_BYTES) {
    throw new Error(`tool output content must contain 1 to ${MAX_TOOL_OUTPUT_BYTES} bytes`)
  }
  if (request.mediaType !== undefined && request.mediaType.length === 0) {
    throw new Error("tool output mediaType must not be empty")
  }
}

function kindForMediaType(mediaType: string | undefined): ResourceKind {
  if (mediaType?.startsWith("image/")) return "image"
  if (mediaType?.startsWith("video/")) return "video"
  if (mediaType?.startsWith("audio/")) return "audio"
  if (mediaType === "application/pdf" || mediaType?.startsWith("text/")) return "document"
  return "artifact"
}
