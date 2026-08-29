import type { IncomingMessage, ServerResponse } from "node:http"
import type { Controller } from "@wanex/assistant-ui"
import type { ResourceKind } from "@wanex/protocol"
import { MAX_ATTACHMENT_UPLOAD_BYTES } from "../../resources/attachment.js"
import { sendJson } from "../response.js"
import type { WebNodeRequestHandlerOptions } from "../types.js"
import { WebHostHttpError } from "../http-error.js"

export async function handleAttachmentUpload(request: {
  readonly controller: Controller
  readonly attachments: WebNodeRequestHandlerOptions["attachments"]
  readonly maxAttachmentBytes: number
  readonly request: IncomingMessage
  readonly response: ServerResponse
}): Promise<void> {
  const contentType = header(request.request, "content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase()
  if (contentType !== "application/octet-stream") {
    throw new WebHostHttpError(
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
  const snapshot = await request.controller.refresh()
  sendJson(request.response, 201, {
    ok: true,
    kind: "web.attachment-upload-response",
    upload: uploaded,
    snapshot
  })
}

export function normalizeMaxAttachmentBytes(value: number | undefined): number {
  const normalized = value ?? MAX_ATTACHMENT_UPLOAD_BYTES
  if (
    !Number.isSafeInteger(normalized) ||
    normalized <= 0 ||
    normalized > MAX_ATTACHMENT_UPLOAD_BYTES
  ) {
    throw new Error(
      `maxAttachmentBytes must be an integer from 1 to ${MAX_ATTACHMENT_UPLOAD_BYTES}`
    )
  }
  return normalized
}

async function readBinaryBody(
  request: IncomingMessage,
  maxBodyBytes: number
): Promise<Uint8Array> {
  const declaredLength = header(request, "content-length")
  if (declaredLength !== undefined) {
    const size = Number(declaredLength)
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new WebHostHttpError(
        400,
        "invalid_content_length",
        "attachment content-length is invalid"
      )
    }
    if (size > maxBodyBytes) throw attachmentTooLarge(maxBodyBytes)
  }
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.byteLength
    if (totalBytes > maxBodyBytes) throw attachmentTooLarge(maxBodyBytes)
    chunks.push(buffer)
  }
  if (totalBytes === 0) {
    throw new WebHostHttpError(
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
  throw new WebHostHttpError(
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
    throw new WebHostHttpError(
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
    if (decoded.length === 0) throw new Error("empty")
    return decoded
  } catch {
    throw new WebHostHttpError(
      400,
      "invalid_attachment_header",
      `${name} header is invalid`
    )
  }
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name]
  if (Array.isArray(value)) {
    throw new WebHostHttpError(
      400,
      "invalid_attachment_header",
      `${name} header must occur once`
    )
  }
  return value
}

function attachmentTooLarge(maxBodyBytes: number): WebHostHttpError {
  return new WebHostHttpError(
    413,
    "attachment_too_large",
    `attachment body exceeds ${maxBodyBytes} bytes`
  )
}
