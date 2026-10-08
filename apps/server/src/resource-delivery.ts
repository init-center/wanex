import type { IncomingMessage, ServerResponse } from "node:http"
import type { ResourceDeliveryPort } from "@wanex/assistant-host"
import {
  REMOTE_ASSISTANT_RESOURCE_DELIVERY_PATH,
  REMOTE_ASSISTANT_RESOURCE_GRANT_HEADER,
  ResourceDeliveryError
} from "@wanex/assistant-host"
import type { WanexServerAuthentication } from "./model.js"
import {
  authenticateWanexServerRequest,
  WanexServerAuthenticationError
} from "./authentication.js"

const MAX_CONDITIONAL_HEADER_BYTES = 512

export interface WanexServerResourceDeliveryHandler {
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>
}

export function createWanexServerResourceDeliveryHandler(options: {
  readonly authentication: WanexServerAuthentication
  readonly deliveries: ResourceDeliveryPort
  readonly now?: () => number
}): WanexServerResourceDeliveryHandler {
  const now = options.now ?? Date.now
  return Object.freeze({ handle })

  async function handle(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<boolean> {
    const url = parseRequestUrl(request.url)
    if (url.pathname !== REMOTE_ASSISTANT_RESOURCE_DELIVERY_PATH) return false
    try {
      await deliver(request, response, url)
    } catch (error) {
      if (response.headersSent || response.destroyed) {
        response.destroy(error instanceof Error ? error : undefined)
      } else {
        writeError(response, error)
      }
    }
    return true
  }

  async function deliver(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL
  ): Promise<void> {
    if (url.search.length !== 0) {
      throw invalidRequest("Resource delivery does not accept query parameters")
    }
    const method = request.method
    if (method !== "GET" && method !== "HEAD") {
      response.setHeader("allow", "GET, HEAD")
      throw new ResourceDeliveryHttpError(
        405,
        "method_not_allowed",
        "Resource delivery requires GET or HEAD"
      )
    }
    if (hasRequestBody(request)) {
      throw invalidRequest("Resource delivery does not accept a request body")
    }
    const subject = await authenticateWanexServerRequest({
      input: request,
      authentication: options.authentication,
      operation: "Resource delivery",
      now
    })
    const token = requiredSingleHeader(request, REMOTE_ASSISTANT_RESOURCE_GRANT_HEADER)
    if (!/^wrd_[A-Za-z0-9_-]{43}$/.test(token)) {
      throw invalidRequest("Resource delivery grant is invalid")
    }
    const range = optionalBoundedHeader(request, "range")
    const ifNoneMatch = optionalBoundedHeader(request, "if-none-match")
    const abort = new AbortController()
    const disconnect = (): void => abort.abort()
    const close = (): void => {
      if (!response.writableEnded) abort.abort()
    }
    request.once("aborted", disconnect)
    response.once("close", close)
    response.once("error", disconnect)
    try {
      const delivery = await options.deliveries.open({
        token,
        audience: subject.subjectId,
        method,
        ...(range === undefined ? {} : { range }),
        ...(ifNoneMatch === undefined ? {} : { ifNoneMatch }),
        signal: abort.signal
      })
      setDeliveryHeaders(response)
      response.setHeader("accept-ranges", "bytes")
      response.setHeader("content-type", delivery.mediaType)
      response.setHeader("etag", delivery.etag)
      response.setHeader("digest", delivery.digest)
      if (delivery.statusCode === 304) {
        response.writeHead(304)
        response.end()
        return
      }
      response.setHeader("content-length", String(delivery.contentLength))
      if (delivery.range !== undefined) {
        response.setHeader(
          "content-range",
          `bytes ${delivery.range.start}-${delivery.range.end}/${delivery.totalSizeBytes}`
        )
      }
      response.writeHead(delivery.statusCode)
      if (method === "HEAD" || delivery.body === undefined) {
        response.end()
        return
      }
      for await (const chunk of delivery.body) {
        if (abort.signal.aborted || response.destroyed) return
        if (!response.write(chunk)) await waitForWritable(response, abort)
      }
      if (!response.destroyed && !response.writableEnded) response.end()
    } finally {
      request.off("aborted", disconnect)
      response.off("close", close)
      response.off("error", disconnect)
    }
  }
}

class ResourceDeliveryHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = "ResourceDeliveryHttpError"
  }
}

function parseRequestUrl(value: string | undefined): URL {
  try {
    return new URL(value ?? "/", "https://wanex.invalid")
  } catch {
    return new URL("/", "https://wanex.invalid")
  }
}

function requiredSingleHeader(request: IncomingMessage, name: string): string {
  const value = singleHeader(request, name)
  if (value === undefined || value.length === 0) {
    throw invalidRequest(`Resource delivery ${name} header is required`)
  }
  return value
}

function optionalBoundedHeader(
  request: IncomingMessage,
  name: string
): string | undefined {
  const value = singleHeader(request, name)
  if (value === undefined) return undefined
  if (value.length === 0 || Buffer.byteLength(value, "utf8") > MAX_CONDITIONAL_HEADER_BYTES) {
    throw invalidRequest(`Resource delivery ${name} header is invalid`)
  }
  return value
}

function singleHeader(
  request: IncomingMessage,
  name: string
): string | undefined {
  let occurrences = 0
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === name) occurrences += 1
  }
  if (occurrences > 1) {
    throw invalidRequest(`Resource delivery ${name} header must be singular`)
  }
  const value = request.headers[name]
  if (Array.isArray(value)) {
    if (value.length !== 1 || value[0] === undefined) {
      throw invalidRequest(`Resource delivery ${name} header must be singular`)
    }
    return value[0]
  }
  return typeof value === "string" ? value : undefined
}

function hasRequestBody(request: IncomingMessage): boolean {
  if (request.headers["transfer-encoding"] !== undefined) return true
  const contentLength = singleHeader(request, "content-length")
  return contentLength !== undefined && contentLength !== "0"
}

function setDeliveryHeaders(response: ServerResponse): void {
  response.setHeader("cache-control", "no-store")
  response.setHeader("vary", "authorization")
  response.setHeader("x-content-type-options", "nosniff")
  response.setHeader("referrer-policy", "no-referrer")
}

function writeError(response: ServerResponse, error: unknown): void {
  const normalized = normalizeError(error)
  setDeliveryHeaders(response)
  response.statusCode = normalized.statusCode
  response.setHeader("content-type", "application/json; charset=utf-8")
  if (normalized.statusCode === 401) {
    response.setHeader("www-authenticate", "Bearer")
  }
  if (
    error instanceof ResourceDeliveryError &&
    error.statusCode === 416 &&
    error.totalSizeBytes !== undefined
  ) {
    response.setHeader("content-range", `bytes */${error.totalSizeBytes}`)
  }
  response.end(JSON.stringify({
    kind: "wanex.server.resource-delivery.error",
    error: {
      code: normalized.code,
      message: normalized.message,
      retryable: false
    }
  }))
}

function normalizeError(error: unknown): {
  readonly statusCode: number
  readonly code: string
  readonly message: string
} {
  if (error instanceof ResourceDeliveryError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: boundedMessage(error.message)
    }
  }
  if (error instanceof ResourceDeliveryHttpError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: boundedMessage(error.message)
    }
  }
  if (error instanceof WanexServerAuthenticationError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: boundedMessage(error.message)
    }
  }
  return {
    statusCode: 500,
    code: "application_failure",
    message: "Resource delivery failed"
  }
}

function invalidRequest(message: string): ResourceDeliveryHttpError {
  return new ResourceDeliveryHttpError(400, "invalid_resource_delivery", message)
}

function boundedMessage(message: string): string {
  return message.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 512) ||
    "Resource delivery failed"
}

async function waitForWritable(
  response: ServerResponse,
  abort: AbortController
): Promise<void> {
  if (response.destroyed || response.writableEnded) {
    abort.abort()
    return
  }
  await new Promise<void>((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      response.off("drain", onDrain)
      response.off("close", onClose)
      response.off("error", onError)
      resolve()
    }
    const onDrain = (): void => finish()
    const onClose = (): void => {
      abort.abort()
      finish()
    }
    const onError = (): void => {
      abort.abort()
      finish()
    }
    response.once("drain", onDrain)
    response.once("close", onClose)
    response.once("error", onError)
  })
}
