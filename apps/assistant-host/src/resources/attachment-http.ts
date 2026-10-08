import type { IncomingMessage } from "node:http"
import type { ResourceKind } from "@wanex/protocol"
import { MAX_CONVERSATION_ATTACHMENT_BYTES } from "@wanex/assistant/attachments"
import type { LocalAttachmentUploadRequest } from "./attachment.js"

export { MAX_CONVERSATION_ATTACHMENT_BYTES }

const MAX_ENCODED_HEADER_BYTES = 2 * 1024

export class AttachmentUploadHttpError extends Error {
  constructor(
    readonly statusCode: 400 | 413 | 415,
    readonly code:
      | "empty_attachment"
      | "invalid_attachment_header"
      | "invalid_content_length"
      | "missing_attachment_header"
      | "unsupported_media_type"
      | "attachment_too_large",
    message: string
  ) {
    super(message)
    this.name = "AttachmentUploadHttpError"
  }
}

export function normalizeMaxAttachmentBytes(value: number | undefined): number {
  const normalized = value ?? MAX_CONVERSATION_ATTACHMENT_BYTES
  if (
    !Number.isSafeInteger(normalized) ||
    normalized <= 0 ||
    normalized > MAX_CONVERSATION_ATTACHMENT_BYTES
  ) {
    throw new Error(
      `maxAttachmentBytes must be an integer from 1 to ${MAX_CONVERSATION_ATTACHMENT_BYTES}`
    )
  }
  return normalized
}

export async function readAttachmentUploadHttpRequest(request: {
  readonly input: IncomingMessage
  readonly maxAttachmentBytes?: number
}): Promise<LocalAttachmentUploadRequest> {
  const maxAttachmentBytes = normalizeMaxAttachmentBytes(
    request.maxAttachmentBytes
  )
  const contentType = singleHeader(request.input, "content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase()
  if (contentType !== "application/octet-stream") {
    throw new AttachmentUploadHttpError(
      415,
      "unsupported_media_type",
      "attachment request content-type must be application/octet-stream"
    )
  }
  const mediaType = requiredDecodedHeader(request.input, "x-wanex-media-type")
  const kind = optionalResourceKindHeader(request.input)
  const label = optionalDecodedHeader(request.input, "x-wanex-attachment-label")
  const sessionId = optionalDecodedHeader(request.input, "x-wanex-session-id")
  const content = await readBinaryBody(request.input, maxAttachmentBytes)
  return {
    content,
    mediaType,
    ...(kind === undefined ? {} : { kind }),
    ...(label === undefined ? {} : { label }),
    ...(sessionId === undefined ? {} : { sessionId })
  }
}

async function readBinaryBody(
  request: IncomingMessage,
  maxBodyBytes: number
): Promise<Uint8Array> {
  const declaredLength = singleHeader(request, "content-length")
  if (declaredLength !== undefined) {
    const size = Number(declaredLength)
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new AttachmentUploadHttpError(
        400,
        "invalid_content_length",
        "attachment content-length is invalid"
      )
    }
    if (size > maxBodyBytes) throw attachmentTooLarge(maxBodyBytes)
  }
  const chunks: Buffer[] = []
  let totalBytes = 0
  let aborted = request.aborted
  const onAborted = (): void => {
    aborted = true
  }
  request.once("aborted", onAborted)
  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      totalBytes += buffer.byteLength
      if (totalBytes > maxBodyBytes) throw attachmentTooLarge(maxBodyBytes)
      chunks.push(buffer)
    }
  } finally {
    request.off("aborted", onAborted)
  }
  if (aborted || !request.complete) {
    throw new AttachmentUploadHttpError(
      400,
      "invalid_content_length",
      "attachment body was interrupted"
    )
  }
  if (totalBytes === 0) {
    throw new AttachmentUploadHttpError(
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
  throw new AttachmentUploadHttpError(
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
    throw new AttachmentUploadHttpError(
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
  const value = singleHeader(request, name)
  if (value === undefined) return undefined
  if (Buffer.byteLength(value, "utf8") > MAX_ENCODED_HEADER_BYTES) {
    throw invalidHeader(name)
  }
  try {
    const decoded = decodeURIComponent(value).trim()
    if (decoded.length === 0) throw new Error("empty")
    return decoded
  } catch {
    throw invalidHeader(name)
  }
}

function singleHeader(
  request: IncomingMessage,
  name: string
): string | undefined {
  let occurrences = 0
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === name) occurrences += 1
  }
  if (occurrences > 1) throw invalidHeader(name, "must occur once")
  const value = request.headers[name]
  if (Array.isArray(value)) throw invalidHeader(name, "must occur once")
  return value
}

function invalidHeader(
  name: string,
  reason = "is invalid"
): AttachmentUploadHttpError {
  return new AttachmentUploadHttpError(
    400,
    "invalid_attachment_header",
    `${name} header ${reason}`
  )
}

function attachmentTooLarge(maxBodyBytes: number): AttachmentUploadHttpError {
  return new AttachmentUploadHttpError(
    413,
    "attachment_too_large",
    `attachment body exceeds ${maxBodyBytes} bytes`
  )
}
