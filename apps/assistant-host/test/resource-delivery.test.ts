import { createHash } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import type { ResourceRecord } from "@wanex/protocol"
import {
  DEFAULT_RESOURCE_MEDIA_DELIVERY_TTL_MS,
  DEFAULT_RESOURCE_PREVIEW_DELIVERY_TTL_MS,
  MAX_IMAGE_PREVIEW_BYTES,
  createLocalResourceDeliveryPort,
  parseLocalResourceRange
} from "../src/resources/delivery.js"

const TOKEN_A = `wrd_${"a".repeat(43)}`
const TOKEN_B = `wrd_${"b".repeat(43)}`

describe("Assistant Host resource delivery", () => {
  it("authorizes one immutable resource and streams complete bytes with integrity headers", async () => {
    const content = new Uint8Array([1, 2, 3, 4, 5])
    const resource = imageResource(content)
    const reads: Array<{ readonly offset: number; readonly limit: number }> = []
    const authorize = vi.fn(async () => true)
    const port = createLocalResourceDeliveryPort(
      resourceReads(resource, content, reads),
      {
        authorizer: { authorize },
        now: () => 1_000,
        createToken: () => TOKEN_A
      }
    )

    const prepared = await port.prepare({
      audience: "host-session-a",
      sessionId: "session-a",
      resourceId: resource.id,
      expectedSha256: resource.sha256,
      purpose: "preview"
    })
    expect(prepared).toEqual({
      kind: "assistant-host.resource-delivery",
      token: TOKEN_A,
      resourceId: resource.id,
      sha256: resource.sha256,
      resourceKind: "image",
      mediaType: "image/png",
      sizeBytes: content.byteLength,
      purpose: "preview",
      sessionId: "session-a",
      expiresAt: 61_000
    })
    expect(authorize).toHaveBeenCalledWith({
      audience: "host-session-a",
      sessionId: "session-a",
      resourceId: resource.id,
      expectedSha256: resource.sha256,
      purpose: "preview"
    })

    const opened = await port.open({
      token: TOKEN_A,
      audience: "host-session-a",
      method: "GET"
    })
    expect(opened).toMatchObject({
      statusCode: 200,
      contentLength: content.byteLength,
      totalSizeBytes: content.byteLength,
      etag: `"sha256-${resource.sha256}"`,
      digest: `sha-256=${Buffer.from(resource.sha256, "hex").toString("base64")}`
    })
    expect(await collect(opened.body)).toEqual(content)
    expect(reads).toEqual([{ offset: 0, limit: content.byteLength }])
  })

  it("supports HEAD, strong ETag, and one bounded byte Range without whole-file reads", async () => {
    const content = new Uint8Array([10, 20, 30, 40, 50, 60])
    const resource = imageResource(content)
    const reads: Array<{ readonly offset: number; readonly limit: number }> = []
    const port = createLocalResourceDeliveryPort(
      resourceReads(resource, content, reads),
      allowAll({ tokens: [TOKEN_A] })
    )
    const prepared = await prepareImage(port, resource)

    const head = await port.open({ token: prepared.token, method: "HEAD" })
    expect(head).toMatchObject({ statusCode: 200, contentLength: 6 })
    expect(head.body).toBeUndefined()
    expect(reads).toEqual([])

    const notModified = await port.open({
      token: prepared.token,
      method: "GET",
      ifNoneMatch: head.etag
    })
    expect(notModified).toMatchObject({ statusCode: 304, contentLength: 0 })
    expect(notModified.body).toBeUndefined()

    const range = await port.open({
      token: prepared.token,
      method: "GET",
      range: "bytes=2-4"
    })
    expect(range).toMatchObject({
      statusCode: 206,
      contentLength: 3,
      range: { start: 2, end: 4 }
    })
    expect(await collect(range.body)).toEqual(new Uint8Array([30, 40, 50]))
    expect(reads).toEqual([{ offset: 2, limit: 3 }])
  })

  it("uses separate bounded expiry policies for preview and media grants", async () => {
    const imageContent = new Uint8Array([1, 2, 3])
    const audioContent = new Uint8Array([4, 5, 6, 7])
    const image = imageResource(imageContent)
    const audio: ResourceRecord = {
      ...imageResource(audioContent),
      id: "resource_audio",
      logicalPath: "resources/audio.mp3",
      kind: "audio",
      mediaType: "audio/mpeg"
    }
    const resources = new Map([
      [image.id, { resource: image, content: imageContent }],
      [audio.id, { resource: audio, content: audioContent }]
    ])
    const port = createLocalResourceDeliveryPort({
      async readResource(request) {
        return resources.get(request.resourceId)?.resource ?? null
      },
      async readResourceContent(request) {
        const entry = resources.get(request.resourceId)
        if (entry === undefined) return null
        const content = entry.content.slice(request.offset, request.offset + request.limit)
        return {
          resourceId: entry.resource.id,
          sha256: entry.resource.sha256,
          totalSizeBytes: entry.content.byteLength,
          offset: request.offset,
          content,
          eof: request.offset + content.byteLength === entry.content.byteLength
        }
      }
    }, {
      authorizer: { authorize: async () => true },
      now: () => 5_000,
      createToken: (() => {
        const tokens = [TOKEN_A, TOKEN_B]
        return () => tokens.shift() ?? TOKEN_B
      })()
    })

    const preview = await port.prepare({
      audience: "host-session",
      resourceId: image.id,
      expectedSha256: image.sha256,
      purpose: "preview"
    })
    const media = await port.prepare({
      audience: "host-session",
      resourceId: audio.id,
      expectedSha256: audio.sha256,
      purpose: "media"
    })

    expect(preview.expiresAt).toBe(
      5_000 + DEFAULT_RESOURCE_PREVIEW_DELIVERY_TTL_MS
    )
    expect(media.expiresAt).toBe(
      5_000 + DEFAULT_RESOURCE_MEDIA_DELIVERY_TTL_MS
    )
    expect(media.expiresAt).toBeGreaterThan(preview.expiresAt)
  })

  it("fails closed for authorization, audience, expiration, revocation, close, and capacity", async () => {
    const content = new Uint8Array([1])
    const resource = imageResource(content)
    const denied = createLocalResourceDeliveryPort(
      resourceReads(resource, content),
      { authorizer: { authorize: async () => false } }
    )
    await expect(prepareImage(denied, resource)).rejects.toMatchObject({
      statusCode: 403,
      code: "resource_delivery_forbidden"
    })

    let now = 100
    const tokens = [TOKEN_A, TOKEN_B]
    const port = createLocalResourceDeliveryPort(
      resourceReads(resource, content),
      {
        authorizer: { authorize: async () => true },
        now: () => now,
        previewTtlMs: 10,
        capacity: 1,
        createToken: () => tokens.shift() ?? TOKEN_B
      }
    )
    const first = await prepareImage(port, resource)
    await expect(prepareImage(port, resource)).rejects.toMatchObject({
      statusCode: 429,
      code: "resource_delivery_capacity_exceeded"
    })
    await expect(port.open({
      token: first.token,
      audience: "other-host-session",
      method: "GET"
    })).rejects.toMatchObject({ code: "resource_delivery_audience_mismatch" })
    now = 110
    await expect(port.open({ token: first.token, method: "GET" })).rejects.toMatchObject({
      statusCode: 410,
      code: "resource_delivery_expired"
    })

    now = 111
    const second = await prepareImage(port, resource)
    expect(port.revoke(second.token)).toBe(true)
    await expect(port.open({ token: second.token, method: "GET" })).rejects.toMatchObject({
      code: "resource_delivery_not_found"
    })
    port.close()
    expect(port.activeGrantCount()).toBe(0)
    await expect(prepareImage(port, resource)).rejects.toMatchObject({
      code: "resource_delivery_closed"
    })
  })

  it("rejects stale, unsupported, unavailable, empty, and oversized resources before reading bytes", async () => {
    const content = new Uint8Array([1])
    const base = imageResource(content)
    let current: ResourceRecord | null = null
    let contentReads = 0
    const port = createLocalResourceDeliveryPort({
      async readResource() {
        return current
      },
      async readResourceContent() {
        contentReads += 1
        throw new Error("content must not be read")
      }
    }, allowAll({ tokens: [TOKEN_A, TOKEN_B, TOKEN_A, TOKEN_B, TOKEN_A] }))

    await expect(prepareImage(port, base)).rejects.toMatchObject({ code: "resource_not_found" })
    current = { ...base, state: "failed" }
    await expect(prepareImage(port, base)).rejects.toMatchObject({ code: "resource_not_available" })
    current = base
    await expect(port.prepare({
      audience: "host-session",
      resourceId: base.id,
      expectedSha256: "f".repeat(64),
      purpose: "preview"
    })).rejects.toMatchObject({ code: "resource_evidence_mismatch" })
    current = { ...base, mediaType: "image/svg+xml" }
    await expect(prepareImage(port, base)).rejects.toMatchObject({ code: "unsupported_resource_delivery" })
    current = { ...base, sizeBytes: 0 }
    await expect(prepareImage(port, base)).rejects.toMatchObject({ code: "resource_evidence_mismatch" })
    current = { ...base, sizeBytes: MAX_IMAGE_PREVIEW_BYTES + 1 }
    await expect(prepareImage(port, base)).rejects.toMatchObject({ code: "resource_too_large" })
    expect(contentReads).toBe(0)
  })

  it("stops requesting chunks after cancellation", async () => {
    const content = new Uint8Array(300_000).fill(7)
    const resource = imageResource(content)
    const reads: Array<{ readonly offset: number; readonly limit: number }> = []
    const port = createLocalResourceDeliveryPort(
      resourceReads(resource, content, reads),
      allowAll({ tokens: [TOKEN_A] })
    )
    const prepared = await prepareImage(port, resource)
    const abort = new AbortController()
    const opened = await port.open({
      token: prepared.token,
      method: "GET",
      signal: abort.signal
    })
    const iterator = opened.body?.[Symbol.asyncIterator]()
    expect(iterator).toBeDefined()
    await expect(iterator!.next()).resolves.toMatchObject({ done: false })
    abort.abort()
    await expect(iterator!.next()).rejects.toMatchObject({
      code: "resource_delivery_aborted"
    })
    expect(reads).toHaveLength(1)
  })

  it("serializes capacity after async authorization and aborts an opened body on revoke", async () => {
    const content = new Uint8Array(300_000).fill(8)
    const resource = imageResource(content)
    let releaseAuthorization: (() => void) | undefined
    const authorization = new Promise<void>((resolve) => {
      releaseAuthorization = resolve
    })
    const tokens = [TOKEN_A, TOKEN_B]
    const port = createLocalResourceDeliveryPort(
      resourceReads(resource, content),
      {
        authorizer: {
          async authorize() {
            await authorization
            return true
          }
        },
        capacity: 1,
        createToken: () => tokens.shift() ?? TOKEN_B
      }
    )
    const firstPrepare = prepareImage(port, resource)
    const secondPrepare = prepareImage(port, resource)
    releaseAuthorization?.()
    const results = await Promise.allSettled([firstPrepare, secondPrepare])
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    expect(results.filter((result) => result.status === "rejected")).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({
          statusCode: 429,
          code: "resource_delivery_capacity_exceeded"
        })
      })
    ])
    const fulfilled = results.find((result) => result.status === "fulfilled")
    if (fulfilled?.status !== "fulfilled") {
      throw new Error("one delivery grant should be prepared")
    }
    const prepared = fulfilled.value
    const opened = await port.open({ token: prepared.token, method: "GET" })
    const iterator = opened.body?.[Symbol.asyncIterator]()
    await expect(iterator?.next()).resolves.toMatchObject({ done: false })
    expect(port.revoke(prepared.token)).toBe(true)
    await expect(iterator?.next()).rejects.toMatchObject({
      code: "resource_delivery_aborted"
    })
  })
})

describe("Assistant Host resource Range parser", () => {
  it("supports closed, open-ended, and suffix ranges", () => {
    expect(parseLocalResourceRange("bytes=2-4", 10)).toEqual({ start: 2, end: 4 })
    expect(parseLocalResourceRange("bytes=7-", 10)).toEqual({ start: 7, end: 9 })
    expect(parseLocalResourceRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 })
    expect(parseLocalResourceRange("bytes=8-20", 10)).toEqual({ start: 8, end: 9 })
  })

  it("rejects invalid, unsatisfiable, and multi-range values", () => {
    for (const range of ["items=0-1", "bytes=", "bytes=9-2", "bytes=10-", "bytes=-0", "bytes=0-1,4-5"]) {
      expect(() => parseLocalResourceRange(range, 10)).toThrowError(
        expect.objectContaining({
          statusCode: 416,
          code: "resource_range_not_satisfiable",
          totalSizeBytes: 10
        })
      )
    }
  })
})

function allowAll(options: { readonly tokens: string[] }) {
  const tokens = [...options.tokens]
  return {
    authorizer: { authorize: async () => true },
    now: () => 1_000,
    createToken: () => tokens.shift() ?? TOKEN_A
  }
}

async function prepareImage(
  port: ReturnType<typeof createLocalResourceDeliveryPort>,
  resource: ResourceRecord
) {
  return await port.prepare({
    audience: "host-session",
    sessionId: "session-a",
    resourceId: resource.id,
    expectedSha256: resource.sha256,
    purpose: "preview"
  })
}

function resourceReads(
  resource: ResourceRecord,
  content: Uint8Array,
  reads: Array<{ readonly offset: number; readonly limit: number }> = []
) {
  return {
    async readResource() {
      return resource
    },
    async readResourceContent(request: {
      readonly resourceId: string
      readonly expectedSha256: string
      readonly offset: number
      readonly limit: number
    }) {
      reads.push({ offset: request.offset, limit: request.limit })
      const bytes = content.slice(request.offset, request.offset + request.limit)
      return {
        resourceId: resource.id,
        sha256: resource.sha256,
        totalSizeBytes: content.byteLength,
        offset: request.offset,
        content: bytes,
        eof: request.offset + bytes.byteLength === content.byteLength
      }
    }
  }
}

async function collect(
  body: AsyncIterable<Uint8Array> | undefined
): Promise<Uint8Array> {
  if (body === undefined) throw new Error("resource delivery body is missing")
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of body) {
    chunks.push(chunk)
    size += chunk.byteLength
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function imageResource(content: Uint8Array): ResourceRecord {
  return {
    id: "res_assistant_local_delivery",
    logicalPath: "resources/assistant-local-delivery.png",
    kind: "image",
    origin: "model_output",
    state: "available",
    mediaType: "image/png",
    sizeBytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
    createdAt: 1,
    updatedAt: 1
  }
}
