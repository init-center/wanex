import { once } from "node:events"
import type { IncomingMessage, ServerResponse } from "node:http"
import type {
  LocalResourceDeliveryPort,
  LocalResourceDeliveryPurpose
} from "../resources/delivery.js"
import { LocalResourceDeliveryError } from "../resources/delivery.js"
import { readJsonBody } from "./request-body.js"
import {
  sendJson,
  setWebSecurityHeaders
} from "./response.js"
import {
  requireWebHostSessionCookie,
  requireWebHostSessionToken
} from "./session-token.js"

export async function handleResourceDeliveryPrepare(request: {
  readonly deliveries: LocalResourceDeliveryPort
  readonly audience: string
  readonly deliveryPath: string
  readonly maxBodyBytes: number
  readonly request: IncomingMessage
  readonly response: ServerResponse
}): Promise<void> {
  const body = parsePrepareBody(
    await readJsonBody(request.request, request.maxBodyBytes)
  )
  const prepared = await request.deliveries.prepare({
    audience: request.audience,
    resourceId: body.resourceId,
    expectedSha256: body.sha256,
    purpose: body.purpose,
    ...(body.sessionId === undefined ? {} : { sessionId: body.sessionId })
  })
  const url = new URL(request.deliveryPath, "http://127.0.0.1")
  url.searchParams.set("token", prepared.token)
  sendJson(request.response, 200, {
    ok: true,
    delivery: {
      kind: "web.resource-delivery",
      url: `${url.pathname}${url.search}`,
      resourceId: prepared.resourceId,
      sha256: prepared.sha256,
      resourceKind: prepared.resourceKind,
      mediaType: prepared.mediaType,
      sizeBytes: prepared.sizeBytes,
      purpose: prepared.purpose,
      ...(prepared.sessionId === undefined
        ? {}
        : { sessionId: prepared.sessionId }),
      expiresAt: prepared.expiresAt
    }
  })
}

export async function handleResourceDelivery(request: {
  readonly deliveries: LocalResourceDeliveryPort
  readonly expectedHostSessionToken: string
  readonly request: IncomingMessage
  readonly response: ServerResponse
}): Promise<void> {
  requireWebHostSessionCookie({
    request: request.request,
    expected: request.expectedHostSessionToken
  })
  const url = new URL(request.request.url ?? "/", "http://127.0.0.1")
  const token = requiredSingleQuery(url, "token")
  const method = request.request.method
  if (method === "DELETE") {
    requireWebHostSessionToken({
      request: request.request,
      expected: request.expectedHostSessionToken
    })
    request.deliveries.revoke(token)
    setWebSecurityHeaders(request.response)
    request.response.setHeader("cache-control", "private, no-store")
    request.response.writeHead(204)
    request.response.end()
    return
  }
  if (method !== "GET" && method !== "HEAD") {
    throw new LocalResourceDeliveryError(
      400,
      "invalid_resource_delivery",
      "resource delivery endpoint requires GET, HEAD, or DELETE"
    )
  }
  const abort = new AbortController()
  const onAborted = () => abort.abort()
  const onClosed = () => {
    if (!request.response.writableEnded) abort.abort()
  }
  request.request.once("aborted", onAborted)
  request.response.once("close", onClosed)
  try {
    const delivery = await request.deliveries.open({
      token,
      method,
      ...optionalHeader(request.request, "range"),
      ...optionalHeader(request.request, "if-none-match", "ifNoneMatch"),
      signal: abort.signal
    })
    setWebSecurityHeaders(request.response)
    request.response.setHeader("cache-control", "private, no-store")
    request.response.setHeader("accept-ranges", "bytes")
    request.response.setHeader("content-type", delivery.mediaType)
    request.response.setHeader("etag", delivery.etag)
    request.response.setHeader("digest", delivery.digest)
    request.response.setHeader("x-wanex-resource-sha256", delivery.sha256)
    if (delivery.statusCode === 304) {
      request.response.writeHead(304)
      request.response.end()
      return
    }
    request.response.setHeader("content-length", String(delivery.contentLength))
    if (delivery.range !== undefined) {
      request.response.setHeader(
        "content-range",
        `bytes ${delivery.range.start}-${delivery.range.end}/${delivery.totalSizeBytes}`
      )
    }
    request.response.writeHead(delivery.statusCode)
    if (method === "HEAD" || delivery.body === undefined) {
      request.response.end()
      return
    }
    for await (const chunk of delivery.body) {
      if (!request.response.write(chunk)) {
        await once(request.response, "drain")
      }
    }
    request.response.end()
  } catch (error) {
    if (request.response.headersSent) {
      request.response.destroy(error instanceof Error ? error : undefined)
      return
    }
    throw error
  } finally {
    request.request.off("aborted", onAborted)
    request.response.off("close", onClosed)
  }
}

function parsePrepareBody(value: unknown): {
  readonly resourceId: string
  readonly sha256: string
  readonly purpose: LocalResourceDeliveryPurpose
  readonly sessionId?: string
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidPrepare("resource delivery prepare body must be an object")
  }
  const record = value as Readonly<Record<string, unknown>>
  const allowed = new Set(["resourceId", "sha256", "purpose", "sessionId"])
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw invalidPrepare(`resource delivery prepare body contains unknown field: ${key}`)
    }
  }
  const resourceId = requiredString(record.resourceId, "resourceId")
  const sha256 = requiredString(record.sha256, "sha256")
  const purpose = record.purpose
  if (purpose !== "preview" && purpose !== "media") {
    throw invalidPrepare("resource delivery purpose must be preview or media")
  }
  const sessionId = optionalString(record.sessionId, "sessionId")
  return {
    resourceId,
    sha256,
    purpose,
    ...(sessionId === undefined ? {} : { sessionId })
  }
}

function requiredSingleQuery(url: URL, name: string): string {
  const values = url.searchParams.getAll(name)
  if (values.length !== 1 || values[0] === undefined || values[0].length === 0) {
    throw new LocalResourceDeliveryError(
      400,
      "invalid_resource_delivery",
      `resource delivery query requires exactly one ${name}`
    )
  }
  return values[0]
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw invalidPrepare(`resource delivery ${label} must be a non-empty string`)
  }
  return value
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined
  return requiredString(value, label)
}

function optionalHeader(
  request: IncomingMessage,
  headerName: string,
  propertyName: "range" | "ifNoneMatch" = "range"
): { readonly range?: string; readonly ifNoneMatch?: string } {
  const value = request.headers[headerName]
  if (value === undefined) return {}
  if (Array.isArray(value)) {
    throw new LocalResourceDeliveryError(
      400,
      "invalid_resource_delivery",
      `resource delivery ${headerName} header must be singular`
    )
  }
  return propertyName === "ifNoneMatch"
    ? { ifNoneMatch: value }
    : { range: value }
}

function invalidPrepare(message: string): LocalResourceDeliveryError {
  return new LocalResourceDeliveryError(
    400,
    "invalid_resource_delivery",
    message
  )
}
