import { createHash, randomBytes } from "node:crypto"
import type { Shell } from "@wanex/product"
import { parseLocalResourceRange } from "./range.js"
import { validateResourceDeliveryRecord } from "./policy.js"
import {
  LocalResourceDeliveryError,
  type LocalOpenResourceDeliveryRequest,
  type LocalPreparedResourceDelivery,
  type LocalPrepareResourceDeliveryRequest,
  type LocalResourceDeliveryAuthorizer,
  type LocalResourceDeliveryPort,
  type LocalResourceDeliveryRead
} from "./model.js"

export * from "./authorizer.js"
export * from "./policy.js"
export * from "./range.js"
export * from "./model.js"

export const DEFAULT_RESOURCE_PREVIEW_DELIVERY_TTL_MS = 60_000
export const DEFAULT_RESOURCE_MEDIA_DELIVERY_TTL_MS = 15 * 60_000
export const DEFAULT_RESOURCE_DELIVERY_CAPACITY = 1_024

const RESOURCE_DELIVERY_CHUNK_BYTES = 256 * 1024

type TrustedResourceReads = Pick<
  Shell["trustedResources"],
  "readResource" | "readResourceContent"
>

interface ResourceDeliveryGrant {
  readonly audience: string
  readonly resourceId: string
  readonly sha256: string
  readonly resourceKind: LocalPreparedResourceDelivery["resourceKind"]
  readonly mediaType: string
  readonly sizeBytes: number
  readonly purpose: LocalPreparedResourceDelivery["purpose"]
  readonly sessionId?: string
  readonly expiresAt: number
  readonly abort: AbortController
}

export interface CreateLocalResourceDeliveryPortOptions {
  readonly authorizer: LocalResourceDeliveryAuthorizer
  readonly previewTtlMs?: number
  readonly mediaTtlMs?: number
  readonly capacity?: number
  readonly now?: () => number
  readonly createToken?: () => string
}

export function createLocalResourceDeliveryPort(
  resources: TrustedResourceReads,
  options: CreateLocalResourceDeliveryPortOptions
): LocalResourceDeliveryPort {
  const previewTtlMs = boundedPositiveInteger(
    options.previewTtlMs ?? DEFAULT_RESOURCE_PREVIEW_DELIVERY_TTL_MS,
    "resource preview delivery ttlMs"
  )
  const mediaTtlMs = boundedPositiveInteger(
    options.mediaTtlMs ?? DEFAULT_RESOURCE_MEDIA_DELIVERY_TTL_MS,
    "resource media delivery ttlMs"
  )
  const capacity = boundedPositiveInteger(
    options.capacity ?? DEFAULT_RESOURCE_DELIVERY_CAPACITY,
    "resource delivery capacity"
  )
  const now = options.now ?? Date.now
  const createToken = options.createToken ?? randomDeliveryToken
  const grants = new Map<string, ResourceDeliveryGrant>()
  let closed = false

  return {
    async prepare(request) {
      assertOpen(closed)
      const normalized = normalizePrepareRequest(request)
      cleanupExpiredGrants(grants, now())
      if (!(await options.authorizer.authorize(normalized))) {
        throw deliveryError(
          403,
          "resource_delivery_forbidden",
          "resource is not authorized for this Product scope"
        )
      }
      const resource = await resources.readResource({
        resourceId: normalized.resourceId
      })
      const validatedResource = validateResourceDeliveryRecord({
        resource,
        resourceId: normalized.resourceId,
        expectedSha256: normalized.expectedSha256,
        purpose: normalized.purpose
      })
      const issuedAt = now()
      cleanupExpiredGrants(grants, issuedAt)
      if (grants.size >= capacity) {
        throw deliveryError(
          429,
          "resource_delivery_capacity_exceeded",
          "resource delivery grant capacity is exhausted"
        )
      }
      const token = requiredToken(createToken())
      const tokenHash = hashToken(token)
      if (grants.has(tokenHash)) {
        throw deliveryError(
          409,
          "invalid_resource_delivery",
          "resource delivery token generator returned a duplicate token"
        )
      }
      const grant: ResourceDeliveryGrant = {
        audience: normalized.audience,
        resourceId: validatedResource.id,
        sha256: validatedResource.sha256,
        resourceKind: validatedResource.kind,
        mediaType: validatedResource.mediaType,
        sizeBytes: validatedResource.sizeBytes,
        purpose: normalized.purpose,
        ...(normalized.sessionId === undefined
          ? {}
          : { sessionId: normalized.sessionId }),
        expiresAt: issuedAt + (
          normalized.purpose === "preview" ? previewTtlMs : mediaTtlMs
        ),
        abort: new AbortController()
      }
      grants.set(tokenHash, grant)
      return preparedDelivery(token, grant)
    },
    async open(request) {
      assertOpen(closed)
      const token = requiredToken(request.token)
      const openedAt = now()
      const tokenHash = hashToken(token)
      const grant = grants.get(tokenHash)
      if (grant === undefined) {
        cleanupExpiredGrants(grants, openedAt)
        throw deliveryError(
          404,
          "resource_delivery_not_found",
          "resource delivery grant was not found"
        )
      }
      if (grant.expiresAt <= openedAt) {
        grant.abort.abort()
        grants.delete(tokenHash)
        throw deliveryError(
          410,
          "resource_delivery_expired",
          "resource delivery grant has expired"
        )
      }
      if (request.audience !== undefined && request.audience !== grant.audience) {
        throw deliveryError(
          403,
          "resource_delivery_audience_mismatch",
          "resource delivery audience does not match"
        )
      }
      return openDelivery(resources, grant, {
        ...request,
        signal: request.signal === undefined
          ? grant.abort.signal
          : AbortSignal.any([request.signal, grant.abort.signal])
      })
    },
    revoke(token) {
      try {
        const tokenHash = hashToken(requiredToken(token))
        const grant = grants.get(tokenHash)
        if (grant === undefined) return false
        grant.abort.abort()
        return grants.delete(tokenHash)
      } catch {
        return false
      }
    },
    close() {
      if (closed) return
      closed = true
      for (const grant of grants.values()) grant.abort.abort()
      grants.clear()
    },
    activeGrantCount() {
      cleanupExpiredGrants(grants, now())
      return grants.size
    }
  }
}

async function openDelivery(
  resources: TrustedResourceReads,
  grant: ResourceDeliveryGrant,
  request: LocalOpenResourceDeliveryRequest
): Promise<LocalResourceDeliveryRead> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw deliveryError(
      400,
      "invalid_resource_delivery",
      "resource delivery method must be GET or HEAD"
    )
  }
  const etag = `"sha256-${grant.sha256}"`
  const digest = `sha-256=${Buffer.from(grant.sha256, "hex").toString("base64")}`
  if (matchesEtag(request.ifNoneMatch, etag)) {
    return {
      kind: "local-host.resource-delivery-read",
      statusCode: 304,
      resourceId: grant.resourceId,
      sha256: grant.sha256,
      resourceKind: grant.resourceKind,
      mediaType: grant.mediaType,
      totalSizeBytes: grant.sizeBytes,
      contentLength: 0,
      etag,
      digest,
      expiresAt: grant.expiresAt
    }
  }
  const range = parseLocalResourceRange(request.range, grant.sizeBytes)
  const start = range?.start ?? 0
  const end = range?.end ?? grant.sizeBytes - 1
  const contentLength = end - start + 1
  const base = {
    kind: "local-host.resource-delivery-read" as const,
    statusCode: range === undefined ? 200 as const : 206 as const,
    resourceId: grant.resourceId,
    sha256: grant.sha256,
    resourceKind: grant.resourceKind,
    mediaType: grant.mediaType,
    totalSizeBytes: grant.sizeBytes,
    contentLength,
    etag,
    digest,
    expiresAt: grant.expiresAt,
    ...(range === undefined ? {} : { range })
  }
  if (request.method === "HEAD") return base
  return {
    ...base,
    body: streamResourceRange(resources, grant, start, contentLength, request.signal)
  }
}

async function* streamResourceRange(
  resources: TrustedResourceReads,
  grant: ResourceDeliveryGrant,
  start: number,
  contentLength: number,
  signal: AbortSignal | undefined
): AsyncIterable<Uint8Array> {
  let offset = start
  let remaining = contentLength
  while (remaining > 0) {
    assertNotAborted(signal)
    const limit = Math.min(RESOURCE_DELIVERY_CHUNK_BYTES, remaining)
    const chunk = await resources.readResourceContent({
      resourceId: grant.resourceId,
      expectedSha256: grant.sha256,
      offset,
      limit
    })
    assertNotAborted(signal)
    if (chunk === null) {
      throw contentMismatch("resource disappeared while reading content")
    }
    if (
      chunk.resourceId !== grant.resourceId ||
      chunk.sha256 !== grant.sha256 ||
      chunk.totalSizeBytes !== grant.sizeBytes ||
      chunk.offset !== offset ||
      !(chunk.content instanceof Uint8Array) ||
      chunk.content.byteLength === 0 ||
      chunk.content.byteLength > limit ||
      chunk.content.byteLength > remaining
    ) {
      throw contentMismatch("resource chunk evidence does not match")
    }
    const nextOffset = offset + chunk.content.byteLength
    if (chunk.eof !== (nextOffset === grant.sizeBytes)) {
      throw contentMismatch("resource chunk EOF evidence does not match")
    }
    offset = nextOffset
    remaining -= chunk.content.byteLength
    yield chunk.content
  }
}

function normalizePrepareRequest(
  request: LocalPrepareResourceDeliveryRequest
): LocalPrepareResourceDeliveryRequest {
  return {
    audience: requiredIdentifier(request.audience, "audience"),
    resourceId: requiredIdentifier(request.resourceId, "resourceId"),
    expectedSha256: requiredSha256(request.expectedSha256),
    purpose: requiredPurpose(request.purpose),
    ...(request.sessionId === undefined
      ? {}
      : { sessionId: requiredIdentifier(request.sessionId, "sessionId") })
  }
}

function requiredIdentifier(value: string, label: string): string {
  if (typeof value !== "string") {
    throw deliveryError(400, "invalid_resource_delivery", `${label} must be a string`)
  }
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > 512 || /\p{Cc}/u.test(normalized)) {
    throw deliveryError(400, "invalid_resource_delivery", `${label} is invalid`)
  }
  return normalized
}

function requiredSha256(value: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw deliveryError(
      400,
      "invalid_resource_delivery",
      "expectedSha256 must be a lowercase SHA-256 digest"
    )
  }
  return value
}

function requiredPurpose(
  value: LocalPrepareResourceDeliveryRequest["purpose"]
): LocalPrepareResourceDeliveryRequest["purpose"] {
  if (value !== "preview" && value !== "media") {
    throw deliveryError(
      400,
      "invalid_resource_delivery",
      "resource delivery purpose must be preview or media"
    )
  }
  return value
}

function requiredToken(value: string): string {
  if (typeof value !== "string" || !/^wrd_[A-Za-z0-9_-]{43}$/.test(value)) {
    throw deliveryError(
      400,
      "invalid_resource_delivery",
      "resource delivery token is invalid"
    )
  }
  return value
}

function randomDeliveryToken(): string {
  return `wrd_${randomBytes(32).toString("base64url")}`
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function preparedDelivery(
  token: string,
  grant: ResourceDeliveryGrant
): LocalPreparedResourceDelivery {
  return {
    kind: "local-host.resource-delivery",
    token,
    resourceId: grant.resourceId,
    sha256: grant.sha256,
    resourceKind: grant.resourceKind,
    mediaType: grant.mediaType,
    sizeBytes: grant.sizeBytes,
    purpose: grant.purpose,
    ...(grant.sessionId === undefined ? {} : { sessionId: grant.sessionId }),
    expiresAt: grant.expiresAt
  }
}

function cleanupExpiredGrants(
  grants: Map<string, ResourceDeliveryGrant>,
  now: number
): void {
  for (const [tokenHash, grant] of grants) {
    if (grant.expiresAt <= now) {
      grant.abort.abort()
      grants.delete(tokenHash)
    }
  }
}

function matchesEtag(value: string | undefined, etag: string): boolean {
  if (value === undefined) return false
  return value.split(",").some((candidate) => {
    const normalized = candidate.trim()
    return normalized === "*" || normalized === etag
  })
}

function boundedPositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`)
  }
  return value
}

function assertOpen(closed: boolean): void {
  if (closed) {
    throw deliveryError(
      410,
      "resource_delivery_closed",
      "resource delivery port is closed"
    )
  }
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw deliveryError(
      409,
      "resource_delivery_aborted",
      "resource delivery was aborted"
    )
  }
}

function contentMismatch(message: string): LocalResourceDeliveryError {
  return deliveryError(409, "resource_content_mismatch", message)
}

function deliveryError(
  statusCode: LocalResourceDeliveryError["statusCode"],
  code: LocalResourceDeliveryError["code"],
  message: string
): LocalResourceDeliveryError {
  return new LocalResourceDeliveryError(statusCode, code, message)
}
