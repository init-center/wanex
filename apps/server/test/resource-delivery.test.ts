import { createHash } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createResourceDeliveryPort,
  REMOTE_ASSISTANT_RESOURCE_GRANT_HEADER,
  type LocalAttachmentUploadPort,
  type ResourceDeliveryPort
} from "@wanex/assistant-host"
import { createRemoteAgentHostHttpHandler } from "@wanex/runtime/host"
import type { BootstrappedWanexStorage } from "@wanex/runtime/bootstrap"
import type { AssistantHost } from "@wanex/assistant-host/application"
import {
  listenWanexServer,
  type WanexServerListener
} from "../src/listener.js"
import { startWanexServerInternal } from "../src/start.js"
import {
  createHttpsFetch,
  createTestCertificate,
  type TestCertificate
} from "./support/tls.js"

const TOKEN = `wrd_${"r".repeat(43)}`
const content = new Uint8Array(700_000)
for (let index = 0; index < content.length; index += 1) content[index] = index % 251
const sha256 = createHash("sha256").update(content).digest("hex")
const resource = {
  id: "resource_server_delivery",
  logicalPath: "resources/server-delivery.png",
  kind: "image" as const,
  origin: "model_output" as const,
  state: "available" as const,
  mediaType: "image/png",
  sizeBytes: content.byteLength,
  sha256,
  createdAt: 1,
  updatedAt: 1
}

const listeners: WanexServerListener[] = []
const certificates: TestCertificate[] = []
const handlers: Array<ReturnType<typeof createRemoteAgentHostHttpHandler>> = []
const ports: ResourceDeliveryPort[] = []
const tempDirs: string[] = []

afterEach(async () => {
  while (listeners.length > 0) {
    const listener = listeners.pop()
    listener?.destroyConnections()
    await listener?.close()
  }
  while (handlers.length > 0) await handlers.pop()?.close()
  while (ports.length > 0) ports.pop()?.close()
  while (certificates.length > 0) await certificates.pop()?.close()
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory !== undefined) await rm(directory, { recursive: true, force: true })
  }
})

describe("Wanex Server Resource delivery", () => {
  it("streams authenticated GET, HEAD, Range, and ETag responses on the Server listener", async () => {
    const reads: Array<{ readonly offset: number; readonly limit: number }> = []
    const port = testResourcePort(reads)
    const { listener, fetch } = await startListener(port)
    const prepared = await port.prepare({
      audience: "server-resource-subject",
      resourceId: resource.id,
      expectedSha256: resource.sha256,
      purpose: "preview"
    })
    const headers = deliveryHeaders(prepared.token)

    const head = await fetch(listener.endpoint.resourceDeliveryUrl, {
      method: "HEAD",
      headers
    })
    expect(head.status).toBe(200)
    expect(head.headers.get("content-length")).toBe(String(content.byteLength))
    expect(head.headers.get("content-type")).toBe("image/png")
    expect(head.headers.get("accept-ranges")).toBe("bytes")
    expect(head.headers.get("digest")).toBe(
      `sha-256=${Buffer.from(sha256, "hex").toString("base64")}`
    )
    expect(head.headers.get("cache-control")).toBe("no-store")
    expect(head.headers.get("x-content-type-options")).toBe("nosniff")
    expect(reads).toEqual([])

    const range = await fetch(listener.endpoint.resourceDeliveryUrl, {
      headers: { ...headers, range: "bytes=100-399" }
    })
    expect(range.status).toBe(206)
    expect(range.headers.get("content-range")).toBe(
      `bytes 100-399/${content.byteLength}`
    )
    expect(new Uint8Array(await range.arrayBuffer())).toEqual(content.slice(100, 400))
    expect(reads).toEqual([{ offset: 100, limit: 300 }])

    reads.length = 0
    const complete = await fetch(listener.endpoint.resourceDeliveryUrl, { headers })
    expect(complete.status).toBe(200)
    expect(new Uint8Array(await complete.arrayBuffer())).toEqual(content)
    expect(reads.length).toBeGreaterThan(1)
    expect(Math.max(...reads.map(({ limit }) => limit))).toBeLessThanOrEqual(256 * 1024)

    const notModified = await fetch(listener.endpoint.resourceDeliveryUrl, {
      headers: { ...headers, "if-none-match": head.headers.get("etag") ?? "" }
    })
    expect(notModified.status).toBe(304)
    expect(await notModified.text()).toBe("")
  })

  it("fails closed for credentials, audience, grant, method, body, and query input", async () => {
    const port = testResourcePort([])
    const { listener, fetch } = await startListener(port)
    const prepared = await port.prepare({
      audience: "server-resource-subject",
      resourceId: resource.id,
      expectedSha256: resource.sha256,
      purpose: "preview"
    })
    const url = listener.endpoint.resourceDeliveryUrl

    const missingBearer = await fetch(url, {
      headers: { [REMOTE_ASSISTANT_RESOURCE_GRANT_HEADER]: prepared.token }
    })
    expect(missingBearer.status).toBe(401)

    const wrongAudience = await fetch(url, {
      headers: deliveryHeaders(prepared.token, "other-resource-token")
    })
    expect(wrongAudience.status).toBe(403)
    expect(await wrongAudience.json()).toMatchObject({
      error: { code: "unauthorized" }
    })

    const malformedGrant = await fetch(url, {
      headers: deliveryHeaders("not-a-grant")
    })
    expect(malformedGrant.status).toBe(400)

    const method = await fetch(url, {
      method: "POST",
      headers: deliveryHeaders(prepared.token)
    })
    expect(method.status).toBe(405)
    expect(method.headers.get("allow")).toBe("GET, HEAD")

    const body = await fetch(url, {
      method: "GET",
      headers: { ...deliveryHeaders(prepared.token), "content-length": "1" },
      body: "x"
    })
    expect(body.status).toBe(400)

    const query = await fetch(`${url}?token=${prepared.token}`, {
      headers: deliveryHeaders(prepared.token)
    })
    expect(query.status).toBe(400)
    expect(await query.text()).not.toContain(prepared.token)

    expect(listener.endpoint.resourceDeliveryUrl).not.toContain(prepared.token)
  })

  it("propagates a disconnected client into the Resource delivery AbortSignal", async () => {
    const delivery = abortObservedPort()
    const port = delivery.port
    const { listener, fetch } = await startListener(port)
    const controller = new AbortController()
    const response = await fetch(listener.endpoint.resourceDeliveryUrl, {
      headers: deliveryHeaders(TOKEN),
      signal: controller.signal
    })
    const reader = response.body?.getReader()
    await expect(reader?.read()).resolves.toMatchObject({ done: false })
    controller.abort()
    await delivery.aborted
    expect(delivery.signal()?.aborted).toBe(true)
  })

  it("rejects another account before opening even a correctly audience-bound grant", async () => {
    let opens = 0
    const underlying = testResourcePort([])
    const prepared = await underlying.prepare({
      audience: "other-resource-subject", resourceId: resource.id,
      expectedSha256: resource.sha256, purpose: "preview"
    })
    const { listener, fetch } = await startListener({
      ...underlying,
      async open(request) { opens += 1; return await underlying.open(request) }
    })
    const response = await fetch(listener.endpoint.resourceDeliveryUrl, {
      headers: deliveryHeaders(prepared.token, "other-resource-token")
    })
    expect(response.status).toBe(403)
    expect(opens).toBe(0)
  })

  it("aborts an active Resource response when the owning Server closes", async () => {
    const certificate = await createTestCertificate()
    certificates.push(certificate)
    const dataRoot = await mkdtemp(join(tmpdir(), "wanex-server-resource-close-"))
    tempDirs.push(dataRoot)
    const delivery = abortObservedPort()
    const assistant = fakeAssistant(delivery.port)
    const runtime = {
      storage: {} as BootstrappedWanexStorage["storage"],
      transport: {} as BootstrappedWanexStorage["transport"],
      artifacts: {},
      async dispose() {}
    } satisfies BootstrappedWanexStorage
    const server = await startWanexServerInternal({
      config: {
        dataRoot,
        profileId: "resource-close",
        listener: { hostname: "127.0.0.1", port: 0 }
      },
      tls: certificate,
      authentication: { ownerSubjectId: "server-resource-subject", authenticateBearerToken: authenticate }
    }, {
      bootstrapStorage: async () => runtime,
      startAssistant: async () => assistant
    })
    const fetch = createHttpsFetch(certificate.cert)
    const response = await fetch(server.endpoint.resourceDeliveryUrl, {
      headers: deliveryHeaders(TOKEN)
    })
    await expect(response.body?.getReader().read()).resolves.toMatchObject({
      done: false
    })

    const closing = server.close()
    await delivery.aborted
    await closing
    expect(delivery.signal()?.aborted).toBe(true)
    expect(server.state).toBe("closed")
  })
})

function testResourcePort(
  reads: Array<{ readonly offset: number; readonly limit: number }>
): ResourceDeliveryPort {
  const port = createResourceDeliveryPort({
    async readResource() {
      return resource
    },
    async readResourceContent(request) {
      reads.push({ offset: request.offset, limit: request.limit })
      const bytes = content.slice(request.offset, request.offset + request.limit)
      return {
        resourceId: resource.id,
        sha256,
        totalSizeBytes: content.byteLength,
        offset: request.offset,
        content: bytes,
        eof: request.offset + bytes.byteLength === content.byteLength
      }
    }
  }, {
    authorizer: { authorize: async () => true },
    createToken: () => TOKEN
  })
  ports.push(port)
  return port
}

async function startListener(deliveries: ResourceDeliveryPort): Promise<{
  readonly listener: WanexServerListener
  readonly fetch: typeof globalThis.fetch
}> {
  const certificate = await createTestCertificate()
  certificates.push(certificate)
  const handler = createRemoteAgentHostHttpHandler({
    authenticateBearerToken: authenticate,
    resolveHost: async () => null
  })
  handlers.push(handler)
  const listener = await listenWanexServer({
    config: { hostname: "127.0.0.1", port: 0 },
    tls: certificate,
    handler,
    authentication: { ownerSubjectId: "server-resource-subject", authenticateBearerToken: authenticate },
    attachments: unusedAttachments,
    resourceDeliveries: deliveries
  })
  listeners.push(listener)
  return { listener, fetch: createHttpsFetch(certificate.cert) }
}

const unusedAttachments: LocalAttachmentUploadPort = {
  async uploadAttachment() {
    throw new Error("attachment upload is not used in Resource delivery tests")
  }
}

async function authenticate(token: string) {
  const subjectId = token === "valid-resource-token"
    ? "server-resource-subject"
    : token === "other-resource-token"
      ? "other-resource-subject"
      : undefined
  return subjectId === undefined
    ? null
    : { subjectId, expiresAt: Date.now() + 60_000 }
}

function deliveryHeaders(
  token: string,
  bearer = "valid-resource-token"
): Record<string, string> {
  return {
    authorization: `Bearer ${bearer}`,
    [REMOTE_ASSISTANT_RESOURCE_GRANT_HEADER]: token
  }
}

function abortObservedPort(): {
  readonly port: ResourceDeliveryPort
  readonly aborted: Promise<void>
  readonly signal: () => AbortSignal | undefined
} {
  let openedSignal: AbortSignal | undefined
  let observedAbort: (() => void) | undefined
  const aborted = new Promise<void>((resolve) => {
    observedAbort = resolve
  })
  const port: ResourceDeliveryPort = {
    async prepare() {
      throw new Error("prepare is not used in this route test")
    },
    async open(request) {
      openedSignal = request.signal
      return {
        kind: "assistant-host.resource-delivery-read",
        statusCode: 200,
        resourceId: resource.id,
        sha256,
        resourceKind: "image",
        mediaType: "image/png",
        totalSizeBytes: content.byteLength,
        contentLength: content.byteLength,
        etag: `"sha256-${sha256}"`,
        digest: `sha-256=${Buffer.from(sha256, "hex").toString("base64")}`,
        expiresAt: Date.now() + 60_000,
        body: (async function* () {
          yield content.slice(0, 64 * 1024)
          await new Promise<void>((resolve) => {
            request.signal?.addEventListener("abort", () => {
              observedAbort?.()
              resolve()
            }, { once: true })
          })
        })()
      }
    },
    revoke: () => false,
    close() {},
    activeGrantCount: () => 0
  }
  return { port, aborted, signal: () => openedSignal }
}

function fakeAssistant(resourceDeliveries: ResourceDeliveryPort): AssistantHost {
  return {
    shell: {} as AssistantHost["shell"],
    surface: {} as AssistantHost["surface"],
    teamConversations: {} as AssistantHost["teamConversations"],
    schedules: {} as AssistantHost["schedules"],
    modelEndpoints: {} as AssistantHost["modelEndpoints"],
    secretResolver: {} as AssistantHost["secretResolver"],
    mcpSettings: {} as AssistantHost["mcpSettings"],
    attachments: {} as AssistantHost["attachments"],
    resourceDeliveries,
    async close() {
      resourceDeliveries.close()
    }
  }
}
