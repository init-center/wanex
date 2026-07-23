import { createHash } from "node:crypto"
import type {
  MessagePart,
  ProviderCapabilities,
  ProviderInputModality,
  ProviderProfile,
  ResourceInputEvidence,
  ResourceMessagePart,
  ResourceRecord,
  UserMessageInputPart
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type {
  PreparedProviderResourcePart,
  PreparedProviderReplayMessage,
  ProviderReplayMessage
} from "../provider/types.js"

const RESOURCE_CHUNK_BYTES = 256 * 1024
const MAX_RESOURCE_BYTES = 25 * 1024 * 1024
const MAX_TURN_RESOURCE_BYTES = 50 * 1024 * 1024

export interface AdmittedUserMessage {
  readonly content: readonly MessagePart[]
  readonly resources: readonly ResourceInputEvidence[]
}

export async function admitUserMessage(
  storage: Pick<CoreStore, "getResource">,
  profile: ProviderProfile,
  input: readonly UserMessageInputPart[]
): Promise<AdmittedUserMessage> {
  if (input.length === 0) {
    throw new Error("agent runtime turn content must not be empty")
  }
  const content: MessagePart[] = []
  const resources: ResourceInputEvidence[] = []
  const resourceIds = new Set<string>()
  let totalResourceBytes = 0
  for (const [index, part] of input.entries()) {
    if (part.type === "text") {
      if (part.text.length === 0) {
        throw new Error(`agent runtime text part ${index} must not be empty`)
      }
      content.push({ type: "text", id: `user_text_${index}`, text: part.text })
      continue
    }
    if (part.resourceId.length === 0) {
      throw new Error(`agent runtime resource part ${index} must have a resourceId`)
    }
    if (resourceIds.has(part.resourceId)) {
      throw new Error(`agent runtime resource is duplicated: ${part.resourceId}`)
    }
    resourceIds.add(part.resourceId)
    const resource = await storage.getResource({ resourceId: part.resourceId })
    if (resource === null) {
      throw new Error(`agent runtime resource not found: ${part.resourceId}`)
    }
    assertResourceAvailable(resource)
    const modality = resourceInputModality(resource)
    if (!profile.capabilities.input.includes(modality)) {
      throw new Error(
        `provider ${profile.id} does not support ${modality} input for resource ${resource.id}`
      )
    }
    if (resource.sizeBytes > MAX_RESOURCE_BYTES) {
      throw new Error(
        `resource ${resource.id} exceeds the ${MAX_RESOURCE_BYTES} byte input limit`
      )
    }
    totalResourceBytes += resource.sizeBytes
    if (totalResourceBytes > MAX_TURN_RESOURCE_BYTES) {
      throw new Error(
        `turn resources exceed the ${MAX_TURN_RESOURCE_BYTES} byte input limit`
      )
    }
    const evidence = resourceEvidence(resource)
    resources.push(evidence)
    content.push({ type: "resource", id: `user_resource_${index}`, ...evidence })
  }
  return { content, resources }
}

export function assertTurnResourcesMatchBinding(
  content: readonly MessagePart[],
  resources: readonly ResourceInputEvidence[]
): void {
  const messageResources = content
    .filter((part): part is ResourceMessagePart => part.type === "resource")
    .map(resourcePartEvidence)
  if (
    messageResources.length !== resources.length ||
    messageResources.some((resource, index) =>
      !sameResourceEvidence(resource, resources[index]!)
    )
  ) {
    throw new Error("turn resource content does not match its execution binding")
  }
}

function sameResourceEvidence(
  left: ResourceInputEvidence,
  right: ResourceInputEvidence
): boolean {
  return left.resourceId === right.resourceId &&
    left.sha256 === right.sha256 &&
    left.sizeBytes === right.sizeBytes &&
    left.kind === right.kind &&
    left.mediaType === right.mediaType
}

export async function prepareProviderReplayResources(
  storage: Pick<CoreStore, "getResource" | "readResourceContent">,
  capabilities: ProviderCapabilities,
  messages: readonly ProviderReplayMessage[]
): Promise<PreparedProviderReplayMessage[]> {
  return await Promise.all(
    messages.map(async (message) => ({
      role: message.role,
      content: await Promise.all(
        message.content.map(async (part) => {
          if (part.type !== "resource") return part
          if (message.role !== "user") {
            throw new Error("provider resource input is only valid in user messages")
          }
          const modality = resourceInputModality(part)
          if (!capabilities.input.includes(modality)) {
            throw new Error(
              `provider does not support ${modality} input for resource ${part.resourceId}`
            )
          }
          const bytes = await readExactResourceBytes(storage, part)
          return { ...part, bytes } satisfies PreparedProviderResourcePart
        })
      )
    }))
  )
}

export async function readExactResourceBytes(
  storage: Pick<CoreStore, "getResource" | "readResourceContent">,
  evidence: ResourceInputEvidence
): Promise<Uint8Array> {
  const resource = await storage.getResource({ resourceId: evidence.resourceId })
  if (resource === null) {
    throw new Error(`resource not found while preparing provider input: ${evidence.resourceId}`)
  }
  assertResourceMatchesEvidence(resource, evidence)
  const content = new Uint8Array(evidence.sizeBytes)
  let offset = 0
  while (offset < evidence.sizeBytes) {
    const chunk = await storage.readResourceContent({
      resourceId: evidence.resourceId,
      expectedSha256: evidence.sha256,
      offset,
      limit: Math.min(RESOURCE_CHUNK_BYTES, evidence.sizeBytes - offset)
    })
    if (chunk === null) {
      throw new Error(`resource disappeared while reading: ${evidence.resourceId}`)
    }
    if (
      chunk.resourceId !== evidence.resourceId ||
      chunk.sha256 !== evidence.sha256 ||
      chunk.totalSizeBytes !== evidence.sizeBytes ||
      chunk.offset !== offset ||
      chunk.content.byteLength === 0
    ) {
      throw new Error(`resource chunk evidence mismatch: ${evidence.resourceId}`)
    }
    content.set(chunk.content, offset)
    offset += chunk.content.byteLength
    if (chunk.eof !== (offset === evidence.sizeBytes)) {
      throw new Error(`resource chunk eof mismatch: ${evidence.resourceId}`)
    }
  }
  const actualSha256 = createHash("sha256").update(content).digest("hex")
  if (actualSha256 !== evidence.sha256) {
    throw new Error(
      `resource bytes changed: ${evidence.resourceId} expected ${evidence.sha256}, got ${actualSha256}`
    )
  }
  return content
}

export function resourceInputModality(
  resource: Pick<ResourceRecord, "kind" | "mediaType"> | ResourceInputEvidence
): ProviderInputModality {
  if (resource.kind === "image") return "image"
  if (resource.kind === "audio") return "audio"
  if (resource.kind === "video") return "video"
  if (resource.kind === "document") return "document"
  const mediaType = resource.mediaType
  if (mediaType?.startsWith("image/")) return "image"
  if (mediaType?.startsWith("audio/")) return "audio"
  if (mediaType?.startsWith("video/")) return "video"
  if (mediaType === "application/pdf" || mediaType?.startsWith("text/")) {
    return "document"
  }
  throw new Error(
    `resource kind ${resource.kind} with media type ${mediaType ?? "unknown"} is not a provider input modality`
  )
}

function assertResourceAvailable(resource: ResourceRecord): void {
  if (resource.state !== "available") {
    throw new Error(`resource is not available: ${resource.id} (${resource.state})`)
  }
  if (!Number.isSafeInteger(resource.sizeBytes) || resource.sizeBytes <= 0) {
    throw new Error(`resource has invalid size: ${resource.id}`)
  }
  if (!/^[a-f0-9]{64}$/.test(resource.sha256)) {
    throw new Error(`resource has invalid sha256: ${resource.id}`)
  }
}

function assertResourceMatchesEvidence(
  resource: ResourceRecord,
  evidence: ResourceInputEvidence
): void {
  assertResourceAvailable(resource)
  if (
    resource.sha256 !== evidence.sha256 ||
    resource.sizeBytes !== evidence.sizeBytes ||
    resource.kind !== evidence.kind ||
    resource.mediaType !== evidence.mediaType
  ) {
    throw new Error(`resource metadata changed: ${evidence.resourceId}`)
  }
}

function resourceEvidence(resource: ResourceRecord): ResourceInputEvidence {
  return {
    resourceId: resource.id,
    sha256: resource.sha256,
    sizeBytes: resource.sizeBytes,
    kind: resource.kind,
    ...(resource.mediaType === undefined ? {} : { mediaType: resource.mediaType })
  }
}

function resourcePartEvidence(part: ResourceMessagePart): ResourceInputEvidence {
  return {
    resourceId: part.resourceId,
    sha256: part.sha256,
    sizeBytes: part.sizeBytes,
    kind: part.kind,
    ...(part.mediaType === undefined ? {} : { mediaType: part.mediaType })
  }
}
