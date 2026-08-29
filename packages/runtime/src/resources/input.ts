import { createHash } from "node:crypto"
import type {
  MessagePart,
  ModelEndpoint,
  ModelInputModality,
  ProviderProtocolDescriptor,
  ResourceInputEvidence,
  ResourceMessagePart,
  ResourceRecord,
  ToolResultContentPart,
  ToolResultMessagePart,
  UserMessageInputPart
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type {
  PreparedProviderResourcePart,
  PreparedProviderReplayMessage,
  PreparedProviderReplayPart,
  PreparedProviderToolResultContentPart,
  PreparedProviderToolResultPart,
  ProviderReplayMessage
} from "../provider/types.js"
import {
  normalizeToolResultContent,
  toolResultContentDigest
} from "../tools/parts.js"

const RESOURCE_CHUNK_BYTES = 256 * 1024
const MAX_RESOURCE_BYTES = 25 * 1024 * 1024
const MAX_PROVIDER_REPLAY_RESOURCE_BYTES = 50 * 1024 * 1024

export interface AdmittedUserMessage {
  readonly content: readonly MessagePart[]
  readonly resources: readonly ResourceInputEvidence[]
}

/**
 * Assigns stable message-part ids before durable Session admission. Provider
 * capability checks remain in admitUserMessage; this function only turns the
 * caller-facing input into the canonical durable representation.
 */
export async function canonicalizeUserMessageInput(
  storage: Pick<CoreStore, "getResource">,
  input: readonly UserMessageInputPart[]
): Promise<AdmittedUserMessage> {
  if (input.length === 0) {
    throw new Error("agent runtime turn content must not be empty")
  }
  const content: MessagePart[] = []
  const resources: ResourceInputEvidence[] = []
  const resourceIds = new Set<string>()
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
    const evidence = resourceEvidence(resource)
    resources.push(evidence)
    content.push({ type: "resource", id: `user_resource_${index}`, ...evidence })
  }
  return { content, resources }
}

export async function admitUserMessage(
  storage: Pick<CoreStore, "getResource">,
  endpoint: ModelEndpoint,
  input: readonly UserMessageInputPart[]
): Promise<AdmittedUserMessage> {
  const admitted = await canonicalizeUserMessageInput(storage, input)
  let totalResourceBytes = 0
  for (const evidence of admitted.resources) {
    const resource = await storage.getResource({ resourceId: evidence.resourceId })
    if (resource === null) {
      throw new Error(`agent runtime resource not found: ${evidence.resourceId}`)
    }
    totalResourceBytes = validateResourceForEndpoint(
      endpoint,
      resource,
      evidence,
      totalResourceBytes
    )
  }
  assertResourceCount(endpoint, admitted.resources.length)
  return admitted
}

export async function validateCanonicalUserMessage(
  storage: Pick<CoreStore, "getResource">,
  endpoint: ModelEndpoint,
  content: readonly MessagePart[]
): Promise<readonly ResourceInputEvidence[]> {
  if (content.length === 0) {
    throw new Error("canonical user message content must not be empty")
  }
  const resources: ResourceInputEvidence[] = []
  const resourceIds = new Set<string>()
  let totalResourceBytes = 0
  for (const [index, part] of content.entries()) {
    if (part.visibility === "internal" || part.visibility === "provider_replay_only") {
      throw new Error(`canonical user message part ${index} must be public`)
    }
    if (part.type === "text") {
      if (part.text.length === 0) {
        throw new Error(`canonical user message text part ${index} must not be empty`)
      }
      continue
    }
    if (part.type !== "resource") {
      throw new Error("canonical user message supports only text and resource parts")
    }
    const evidence = resourcePartEvidence(part)
    if (resourceIds.has(evidence.resourceId)) {
      throw new Error(`canonical user message resource is duplicated: ${evidence.resourceId}`)
    }
    resourceIds.add(evidence.resourceId)
    const resource = await storage.getResource({ resourceId: evidence.resourceId })
    if (resource === null) {
      throw new Error(`canonical user message resource not found: ${evidence.resourceId}`)
    }
    totalResourceBytes = validateResourceForEndpoint(
      endpoint,
      resource,
      evidence,
      totalResourceBytes
    )
    resources.push(evidence)
  }
  assertResourceCount(endpoint, resources.length)
  return resources
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
  provider: {
    readonly protocol: ProviderProtocolDescriptor
    readonly inputModalities: readonly ModelInputModality[]
  },
  messages: readonly ProviderReplayMessage[]
): Promise<PreparedProviderReplayMessage[]> {
  let totalResourceBytes = 0
  const preparedMessages: PreparedProviderReplayMessage[] = []
  for (const message of messages) {
    const content: PreparedProviderReplayPart[] = []
    for (const part of message.content) {
      if (part.type === "resource") {
        if (message.role !== "user") {
          throw new Error("provider resource input is only valid in user messages")
        }
        assertProviderSupportsResource(provider.inputModalities, part)
        totalResourceBytes = addReplayResourceBytes(totalResourceBytes, part)
        const bytes = await readExactResourceBytes(storage, part)
        content.push({ ...part, bytes } satisfies PreparedProviderResourcePart)
        continue
      }
      if (part.type === "tool_result") {
        if (message.role !== "tool") {
          throw new Error("provider tool result is only valid in tool messages")
        }
        const prepared = await prepareToolResult(
          storage,
          provider,
          part,
          totalResourceBytes
        )
        totalResourceBytes = prepared.totalResourceBytes
        content.push(prepared.part)
        continue
      }
      content.push(part)
    }
    preparedMessages.push({ role: message.role, content })
  }
  return preparedMessages
}

async function prepareToolResult(
  storage: Pick<CoreStore, "getResource" | "readResourceContent">,
  provider: {
    readonly protocol: ProviderProtocolDescriptor
    readonly inputModalities: readonly ModelInputModality[]
  },
  part: ToolResultMessagePart,
  initialResourceBytes: number
): Promise<{
  readonly part: PreparedProviderToolResultPart
  readonly totalResourceBytes: number
}> {
  const normalized = normalizeToolResultContent(part.content)
  if (toolResultContentDigest(normalized) !== part.contentDigest) {
    throw new Error(`tool result content digest mismatch: ${part.toolCallId}`)
  }
  let totalResourceBytes = initialResourceBytes
  const content: PreparedProviderToolResultContentPart[] = []
  for (const item of normalized) {
    if (item.type !== "resource") {
      content.push(item)
      continue
    }
    totalResourceBytes = addReplayResourceBytes(totalResourceBytes, item)
    await assertExactResourceEvidence(storage, item)
    if (!usesNativeToolResultResource(provider, item)) {
      content.push(item)
      continue
    }
    const bytes = await readExactResourceBytes(storage, item)
    content.push({ ...item, bytes })
  }
  return {
    part: { ...part, content },
    totalResourceBytes
  }
}

function assertProviderSupportsResource(
  inputModalities: readonly ModelInputModality[],
  resource: ResourceInputEvidence
): void {
  const modality = resourceInputModality(resource)
  if (!inputModalities.includes(modality)) {
    throw new Error(
      `provider does not support ${modality} input for resource ${resource.resourceId}`
    )
  }
}

function addReplayResourceBytes(
  total: number,
  resource: ResourceInputEvidence
): number {
  if (!Number.isSafeInteger(resource.sizeBytes) || resource.sizeBytes <= 0) {
    throw new Error(`resource has invalid size: ${resource.resourceId}`)
  }
  if (resource.sizeBytes > MAX_RESOURCE_BYTES) {
    throw new Error(
      `resource ${resource.resourceId} exceeds the ${MAX_RESOURCE_BYTES} byte input limit`
    )
  }
  const next = total + resource.sizeBytes
  if (next > MAX_PROVIDER_REPLAY_RESOURCE_BYTES) {
    throw new Error(
      `provider replay resources exceed the ${MAX_PROVIDER_REPLAY_RESOURCE_BYTES} byte input limit`
    )
  }
  return next
}

function usesNativeToolResultResource(
  provider: {
    readonly protocol: ProviderProtocolDescriptor
    readonly inputModalities: readonly ModelInputModality[]
  },
  resource: ResourceInputEvidence
): boolean {
  if (provider.protocol.id !== "anthropic-messages") return false
  const modality = resourceInputModality(resource)
  if (!provider.inputModalities.includes(modality)) return false
  return (
    (resource.kind === "image" && isAnthropicImageType(resource.mediaType)) ||
    (resource.kind === "document" && resource.mediaType === "application/pdf")
  )
}

function isAnthropicImageType(mediaType: string | undefined): boolean {
  return mediaType === "image/jpeg" ||
    mediaType === "image/png" ||
    mediaType === "image/gif" ||
    mediaType === "image/webp"
}

async function assertExactResourceEvidence(
  storage: Pick<CoreStore, "getResource">,
  evidence: ResourceInputEvidence
): Promise<void> {
  const resource = await storage.getResource({ resourceId: evidence.resourceId })
  if (resource === null) {
    throw new Error(`resource not found while preparing provider input: ${evidence.resourceId}`)
  }
  assertResourceMatchesEvidence(resource, evidence)
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
): ModelInputModality {
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

function validateResourceForEndpoint(
  endpoint: ModelEndpoint,
  resource: ResourceRecord,
  evidence: ResourceInputEvidence,
  totalResourceBytes: number
): number {
  assertResourceMatchesEvidence(resource, evidence)
  const modality = resourceInputModality(resource)
  if (!endpoint.model.inputModalities.includes(modality)) {
    throw new Error(
      `model endpoint ${endpoint.id} does not support ${modality} input for resource ${resource.id}`
    )
  }
  if (resource.sizeBytes > MAX_RESOURCE_BYTES) {
    throw new Error(
      `resource ${resource.id} exceeds the ${MAX_RESOURCE_BYTES} byte input limit`
    )
  }
  const nextTotal = totalResourceBytes + resource.sizeBytes
  if (nextTotal > MAX_PROVIDER_REPLAY_RESOURCE_BYTES) {
    throw new Error(
      `turn resources exceed the ${MAX_PROVIDER_REPLAY_RESOURCE_BYTES} byte input limit`
    )
  }
  return nextTotal
}

function assertResourceCount(endpoint: ModelEndpoint, count: number): void {
  const maxInputResources = endpoint.model.limits?.maxInputResources
  if (maxInputResources !== undefined && count > maxInputResources) {
    throw new Error(
      `model endpoint ${endpoint.id} accepts at most ${maxInputResources} input resources`
    )
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
