import { connect, type TLSSocket } from "node:tls"
import { afterEach, describe, expect, it } from "vitest"
import {
  LocalAttachmentUploadError,
  type LocalAttachmentUploadPort,
  type LocalAttachmentUploadRequest,
  type ResourceDeliveryPort
} from "@wanex/assistant-host"
import { createRemoteAgentHostHttpHandler } from "@wanex/runtime/host"
import {
  listenWanexServer,
  type WanexServerListener
} from "../src/listener.js"
import {
  createHttpsFetch,
  createTestCertificate,
  type TestCertificate
} from "./support/tls.js"

const listeners: WanexServerListener[] = []
const certificates: TestCertificate[] = []
const handlers: Array<ReturnType<typeof createRemoteAgentHostHttpHandler>> = []
const sockets: TLSSocket[] = []

afterEach(async () => {
  while (sockets.length > 0) sockets.pop()?.destroy()
  while (listeners.length > 0) {
    const listener = listeners.pop()
    listener?.destroyConnections()
    await listener?.close()
  }
  while (handlers.length > 0) await handlers.pop()?.close()
  while (certificates.length > 0) await certificates.pop()?.close()
})

describe("Wanex Server attachment upload", () => {
  it("authenticates, validates, bounds, and returns canonical Host evidence", async () => {
    const requests: LocalAttachmentUploadRequest[] = []
    const attachments = attachmentPort(requests)
    const { listener, fetch } = await startListener(attachments, 4)
    const url = listener.endpoint.attachmentUploadUrl

    const unauthenticated = await fetch(url, {
      method: "POST",
      headers: uploadHeaders(false),
      body: new Uint8Array([1])
    })
    expect(unauthenticated.status).toBe(401)
    await expect(unauthenticated.json()).resolves.toMatchObject({
      error: { code: "unauthenticated", retryable: false }
    })
    expect(requests).toEqual([])

    const otherAccount = await fetch(url, {
      method: "POST",
      headers: { ...uploadHeaders(), authorization: "Bearer other-attachment-token" },
      body: new Uint8Array([1])
    })
    expect(otherAccount.status).toBe(403)
    await expect(otherAccount.json()).resolves.toMatchObject({ error: { code: "unauthorized" } })
    expect(requests).toEqual([])

    const wrongMethod = await fetch(url, {
      method: "PUT",
      headers: uploadHeaders(),
      body: new Uint8Array([1])
    })
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get("allow")).toBe("POST")

    const query = await fetch(`${url}?resource=attacker`, {
      method: "POST",
      headers: uploadHeaders(),
      body: new Uint8Array([1])
    })
    expect(query.status).toBe(400)
    expect(await query.text()).not.toContain("attacker")

    const unsupportedType = await fetch(url, {
      method: "POST",
      headers: {
        ...uploadHeaders(),
        "content-type": "application/json"
      },
      body: "{}"
    })
    expect(unsupportedType.status).toBe(415)
    await expect(unsupportedType.json()).resolves.toMatchObject({
      error: { code: "unsupported_media_type" }
    })

    const oversized = await fetch(url, {
      method: "POST",
      headers: uploadHeaders(),
      body: new Uint8Array([1, 2, 3, 4, 5])
    })
    expect(oversized.status).toBe(413)
    await expect(oversized.json()).resolves.toMatchObject({
      error: { code: "attachment_too_large" }
    })
    expect(requests).toEqual([])

    const first = await upload(fetch, url)
    const retry = await upload(fetch, url)
    expect(first.status).toBe(201)
    expect(retry.status).toBe(201)
    const firstBody = await first.json()
    const retryBody = await retry.json()
    expect(firstBody).toEqual(retryBody)
    expect(firstBody).toMatchObject({
      kind: "wanex.server.attachment-uploaded",
      attachment: {
        resourceId: "res_remote_attachment",
        label: "remote.png",
        mediaType: "image/png"
      }
    })
    expect(requests).toHaveLength(2)
    expect(requests[0]).toMatchObject({
      mediaType: "image/png",
      kind: "image",
      label: "remote.png",
      sessionId: "ses_remote_attachment"
    })
    expect(Array.from(requests[0]?.content ?? [])).toEqual([1, 2, 3, 4])

    const unsupported = await fetch(url, {
      method: "POST",
      headers: {
        ...uploadHeaders(),
        "x-wanex-media-type": encodeURIComponent("image/gif")
      },
      body: new Uint8Array([1])
    })
    expect(unsupported.status).toBe(415)
    await expect(unsupported.json()).resolves.toMatchObject({
      error: { code: "unsupported_attachment", retryable: false }
    })
  })

  it("does not invoke Host authority for an interrupted body", async () => {
    const requests: LocalAttachmentUploadRequest[] = []
    const { listener } = await startListener(attachmentPort(requests))
    const socket = connect({
      host: listener.endpoint.hostname,
      port: listener.endpoint.port,
      rejectUnauthorized: false
    })
    sockets.push(socket)
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", resolve)
      socket.once("error", reject)
    })
    socket.write([
      "POST /v1/assistant/attachment HTTP/1.1",
      `Host: ${listener.endpoint.hostname}:${listener.endpoint.port}`,
      "Authorization: Bearer valid-attachment-token",
      "Content-Type: application/octet-stream",
      `X-Wanex-Media-Type: ${encodeURIComponent("image/png")}`,
      "Content-Length: 100",
      "Connection: close",
      "",
      "x"
    ].join("\r\n"))
    socket.destroy()
    listener.destroyConnections()
    await listener.close()
    listeners.splice(listeners.indexOf(listener), 1)
    expect(requests).toEqual([])
  })
})

async function upload(
  fetch: typeof globalThis.fetch,
  url: string
): Promise<Response> {
  return await fetch(url, {
    method: "POST",
    headers: uploadHeaders(),
    body: new Uint8Array([1, 2, 3, 4])
  })
}

function uploadHeaders(authenticated = true): Record<string, string> {
  return {
    ...(authenticated
      ? { authorization: "Bearer valid-attachment-token" }
      : {}),
    "content-type": "application/octet-stream",
    "x-wanex-media-type": encodeURIComponent("image/png"),
    "x-wanex-resource-kind": "image",
    "x-wanex-attachment-label": encodeURIComponent("remote.png"),
    "x-wanex-session-id": "ses_remote_attachment"
  }
}

function attachmentPort(
  requests: LocalAttachmentUploadRequest[]
): LocalAttachmentUploadPort {
  return {
    async uploadAttachment(request) {
      if (request.mediaType === "image/gif") {
        throw new LocalAttachmentUploadError(
          415,
          "unsupported_attachment",
          "active provider does not support image attachment input"
        )
      }
      requests.push(request)
      return {
        kind: "assistant-host.attachment-uploaded",
        attachment: {
          kind: "assistant.attachment",
          resourceId: "res_remote_attachment",
          resourceKind: "image",
          previewKind: "image",
          state: "available",
          sizeBytes: request.content.byteLength,
          sha256: "a".repeat(64),
          mediaType: request.mediaType,
          ...(request.label === undefined ? {} : { label: request.label }),
          addedAt: 1
        },
        attachments: {
          kind: "assistant.conversation-attachments",
          draftKey: request.sessionId ?? "__new__",
          ...(request.sessionId === undefined
            ? {}
            : { sessionId: request.sessionId }),
          attachments: []
        }
      }
    }
  }
}

async function startListener(
  attachments: LocalAttachmentUploadPort,
  maxAttachmentBytes?: number
): Promise<{
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
    authentication: { ownerSubjectId: "server-attachment-subject", authenticateBearerToken: authenticate },
    attachments,
    resourceDeliveries: unusedDeliveries,
    ...(maxAttachmentBytes === undefined ? {} : { maxAttachmentBytes })
  })
  listeners.push(listener)
  return { listener, fetch: createHttpsFetch(certificate.cert) }
}

async function authenticate(token: string) {
  return token === "valid-attachment-token"
    ? { subjectId: "server-attachment-subject", expiresAt: Date.now() + 60_000 }
    : token === "other-attachment-token"
      ? { subjectId: "other-attachment-subject", expiresAt: Date.now() + 60_000 }
      : null
}

const unusedDeliveries: ResourceDeliveryPort = {
  async prepare() {
    throw new Error("Resource delivery is not used in attachment tests")
  },
  async open() {
    throw new Error("Resource delivery is not used in attachment tests")
  },
  revoke: () => false,
  close() {},
  activeGrantCount: () => 0
}
