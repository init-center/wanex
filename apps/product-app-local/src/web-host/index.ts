import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import {
  handleProductAppWebRequest,
  renderProductAppWebStylesheet,
  type ProductAppWebController
} from "@wanex/product-app-web"
import {
  DEFAULT_CLIENT_SCRIPT_PATH,
  DEFAULT_STYLESHEET_PATH,
  PRODUCT_APP_WEB_BROWSER_CLIENT_SCRIPT,
  renderProductAppWebNodeHostDocument
} from "./browser-client.js"
import {
  sendCss,
  sendHtml,
  sendJavascript,
  sendJson
} from "./response.js"
import type {
  ListenProductAppWebNodeHostOptions,
  ProductAppWebNodeHostServer,
  ProductAppWebNodeRequestHandler,
  ProductAppWebNodeRequestHandlerOptions
} from "./types.js"
import {
  MAX_PRODUCT_APP_ATTACHMENT_UPLOAD_BYTES
} from "../attachment-upload.js"
import type { ResourceKind } from "@wanex/protocol"

export type * from "./types.js"

const DEFAULT_REQUEST_PATH = "/wanex/product-app-web/request"
const DEFAULT_ATTACHMENT_PATH = "/wanex/product-app-web/attachment"
const DEFAULT_MAX_BODY_BYTES = 64 * 1024
const DEFAULT_POLL_INTERVAL_MS = 2_000
const MAX_POLL_INTERVAL_MS = 60_000

export function createProductAppWebNodeRequestHandler(
  options: ProductAppWebNodeRequestHandlerOptions
): ProductAppWebNodeRequestHandler {
  const requestPath = options.requestPath ?? DEFAULT_REQUEST_PATH
  const clientScriptPath = options.clientScriptPath ?? DEFAULT_CLIENT_SCRIPT_PATH
  const stylesheetPath = options.stylesheetPath ?? DEFAULT_STYLESHEET_PATH
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const attachmentPath = options.attachmentPath ?? DEFAULT_ATTACHMENT_PATH
  const maxAttachmentBytes = normalizeMaxAttachmentBytes(
    options.maxAttachmentBytes
  )
  const pollIntervalMs = normalizePollIntervalMs(options.pollIntervalMs)

  return (request, response) => {
    void handleNodeRequest({
      controller: options.controller,
      attachments: options.attachments,
      requestPath,
      clientScriptPath,
      stylesheetPath,
      maxBodyBytes,
      attachmentPath,
      maxAttachmentBytes,
      pollIntervalMs,
      request,
      response
    })
  }
}

export async function listenProductAppWebNodeHost(
  options: ListenProductAppWebNodeHostOptions
): Promise<ProductAppWebNodeHostServer> {
  const handler = createProductAppWebNodeRequestHandler(options)
  const server = createServer(handler)
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(options.port ?? 0, options.hostname ?? "127.0.0.1", () => {
      server.off("error", reject)
      resolve()
    })
  })
  return {
    server,
    url: serverUrl(server),
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    }
  }
}

async function handleNodeRequest(request: {
  readonly controller: ProductAppWebController
  readonly attachments: ProductAppWebNodeRequestHandlerOptions["attachments"]
  readonly requestPath: string
  readonly clientScriptPath: string
  readonly stylesheetPath: string
  readonly maxBodyBytes: number
  readonly attachmentPath: string
  readonly maxAttachmentBytes: number
  readonly pollIntervalMs: number
  readonly request: IncomingMessage
  readonly response: ServerResponse
}): Promise<void> {
  const path = requestPath(request.request)
  try {
    if (request.request.method === "GET" && path === "/") {
      sendHtml(
        request.response,
        renderProductAppWebNodeHostDocument({
          surfaceHtml: request.controller.document().html,
          requestPath: request.requestPath,
          clientScriptPath: request.clientScriptPath,
          stylesheetPath: request.stylesheetPath,
          attachmentPath: request.attachmentPath,
          pollIntervalMs: request.pollIntervalMs
        })
      )
      return
    }
    if (path === request.attachmentPath) {
      if (request.request.method !== "POST") {
        sendJson(request.response, 405, {
          ok: false,
          error: {
            code: "method_not_allowed",
            message: "Product App attachment endpoint requires POST"
          }
        })
        return
      }
      await handleAttachmentUpload(request)
      return
    }
    if (
      request.request.method === "GET" &&
      path === request.clientScriptPath
    ) {
      sendJavascript(request.response, PRODUCT_APP_WEB_BROWSER_CLIENT_SCRIPT)
      return
    }
    if (
      request.request.method === "GET" &&
      path === request.stylesheetPath
    ) {
      sendCss(request.response, renderProductAppWebStylesheet())
      return
    }
    if (path === request.requestPath && request.request.method !== "POST") {
      sendJson(request.response, 405, {
        ok: false,
        error: {
          code: "method_not_allowed",
          message: "Product App Web request endpoint requires POST"
        }
      })
      return
    }
    if (path !== request.requestPath) {
      sendJson(request.response, 404, {
        ok: false,
        error: {
          code: "not_found",
          message: "Product App Web route was not found"
        }
      })
      return
    }

    const body = await readJsonBody(request.request, request.maxBodyBytes)
    const response = await handleProductAppWebRequest(request.controller, body)
    sendJson(request.response, 200, response)
  } catch (error) {
    const normalized = normalizeHttpError(error)
    sendJson(request.response, normalized.statusCode, {
      ok: false,
      error: {
        code: normalized.code,
        message: normalized.message
      }
    })
  }
}

async function handleAttachmentUpload(request: {
  readonly controller: ProductAppWebController
  readonly attachments: ProductAppWebNodeRequestHandlerOptions["attachments"]
  readonly maxAttachmentBytes: number
  readonly request: IncomingMessage
  readonly response: ServerResponse
}): Promise<void> {
  const contentType = header(request.request, "content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase()
  if (contentType !== "application/octet-stream") {
    throw new ProductAppWebHostHttpError(
      415,
      "unsupported_media_type",
      "attachment request content-type must be application/octet-stream"
    )
  }
  const mediaType = requiredDecodedHeader(
    request.request,
    "x-wanex-media-type"
  )
  const kind = optionalResourceKindHeader(request.request)
  const label = optionalDecodedHeader(
    request.request,
    "x-wanex-attachment-label"
  )
  const sessionId = optionalDecodedHeader(
    request.request,
    "x-wanex-session-id"
  )
  const content = await readBinaryBody(
    request.request,
    request.maxAttachmentBytes
  )
  const uploaded = await request.attachments.uploadAttachment({
    content,
    mediaType,
    ...(kind === undefined ? {} : { kind }),
    ...(label === undefined ? {} : { label }),
    ...(sessionId === undefined ? {} : { sessionId })
  })
  const document = await request.controller.refresh()
  sendJson(request.response, 201, {
    ok: true,
    kind: "product-app-web.attachment-upload-response",
    upload: uploaded,
    document
  })
}

async function readBinaryBody(
  request: IncomingMessage,
  maxBodyBytes: number
): Promise<Uint8Array> {
  const declaredLength = header(request, "content-length")
  if (declaredLength !== undefined) {
    const size = Number(declaredLength)
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new ProductAppWebHostHttpError(
        400,
        "invalid_content_length",
        "attachment content-length is invalid"
      )
    }
    if (size > maxBodyBytes) {
      throw attachmentTooLarge(maxBodyBytes)
    }
  }
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.byteLength
    if (totalBytes > maxBodyBytes) {
      throw attachmentTooLarge(maxBodyBytes)
    }
    chunks.push(buffer)
  }
  if (totalBytes === 0) {
    throw new ProductAppWebHostHttpError(
      400,
      "empty_attachment",
      "attachment body must not be empty"
    )
  }
  return Buffer.concat(chunks)
}

function optionalResourceKindHeader(
  request: IncomingMessage
): ResourceKind | undefined {
  const value = optionalDecodedHeader(request, "x-wanex-resource-kind")
  if (value === undefined) return undefined
  if (
    value === "file" ||
    value === "image" ||
    value === "video" ||
    value === "audio" ||
    value === "document"
  ) {
    return value
  }
  throw new ProductAppWebHostHttpError(
    400,
    "invalid_attachment_header",
    "x-wanex-resource-kind header is not supported"
  )
}

function requiredDecodedHeader(
  request: IncomingMessage,
  name: string
): string {
  const value = optionalDecodedHeader(request, name)
  if (value === undefined) {
    throw new ProductAppWebHostHttpError(
      400,
      "missing_attachment_header",
      `${name} header is required`
    )
  }
  return value
}

function optionalDecodedHeader(
  request: IncomingMessage,
  name: string
): string | undefined {
  const value = header(request, name)
  if (value === undefined) return undefined
  try {
    const decoded = decodeURIComponent(value).trim()
    if (decoded.length === 0) {
      throw new Error("empty")
    }
    return decoded
  } catch {
    throw new ProductAppWebHostHttpError(
      400,
      "invalid_attachment_header",
      `${name} header is invalid`
    )
  }
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name]
  if (Array.isArray(value)) {
    throw new ProductAppWebHostHttpError(
      400,
      "invalid_attachment_header",
      `${name} header must occur once`
    )
  }
  return value
}

function attachmentTooLarge(maxBodyBytes: number): ProductAppWebHostHttpError {
  return new ProductAppWebHostHttpError(
    413,
    "attachment_too_large",
    `attachment body exceeds ${maxBodyBytes} bytes`
  )
}

function normalizeMaxAttachmentBytes(value: number | undefined): number {
  const normalized = value ?? MAX_PRODUCT_APP_ATTACHMENT_UPLOAD_BYTES
  if (
    !Number.isSafeInteger(normalized) ||
    normalized <= 0 ||
    normalized > MAX_PRODUCT_APP_ATTACHMENT_UPLOAD_BYTES
  ) {
    throw new Error(
      `maxAttachmentBytes must be an integer from 1 to ${MAX_PRODUCT_APP_ATTACHMENT_UPLOAD_BYTES}`
    )
  }
  return normalized
}

class ProductAppWebHostHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = "ProductAppWebHostHttpError"
  }
}

function normalizeHttpError(error: unknown): {
  readonly statusCode: number
  readonly code: string
  readonly message: string
} {
  if (error instanceof ProductAppWebHostHttpError) {
    return error
  }
  return {
    statusCode: 400,
    code: "invalid_http_request",
    message: error instanceof Error ? error.message : String(error)
  }
}

async function readJsonBody(
  request: IncomingMessage,
  maxBodyBytes: number
): Promise<unknown> {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.byteLength
    if (totalBytes > maxBodyBytes) {
      throw new Error(`request body exceeds ${maxBodyBytes} bytes`)
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString("utf8")
  if (text.trim().length === 0) {
    throw new Error("request body must contain JSON")
  }
  return JSON.parse(text)
}

function requestPath(request: IncomingMessage): string {
  return new URL(request.url ?? "/", "http://127.0.0.1").pathname
}

function normalizePollIntervalMs(input: number | undefined): number {
  if (input === undefined) {
    return DEFAULT_POLL_INTERVAL_MS
  }
  if (
    !Number.isSafeInteger(input) ||
    input < 0 ||
    input > MAX_POLL_INTERVAL_MS
  ) {
    throw new Error(
      `pollIntervalMs must be an integer from 0 to ${MAX_POLL_INTERVAL_MS}`
    )
  }
  return input
}

function serverUrl(server: ReturnType<typeof createServer>): string {
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("Product App Web Node host did not bind to a TCP address")
  }
  const host = address.address.includes(":")
    ? `[${address.address}]`
    : address.address
  return `http://${host}:${address.port}`
}
