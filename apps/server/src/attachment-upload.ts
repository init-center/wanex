import type { IncomingMessage, ServerResponse } from "node:http"
import {
  AttachmentUploadHttpError,
  LocalAttachmentUploadError,
  MAX_CONVERSATION_ATTACHMENT_BYTES,
  REMOTE_ASSISTANT_ATTACHMENT_UPLOAD_PATH,
  readAttachmentUploadHttpRequest,
  type LocalAttachmentUploadPort
} from "@wanex/assistant-host"
import {
  authenticateWanexServerRequest,
  WanexServerAuthenticationError
} from "./authentication.js"
import type { WanexServerAuthentication } from "./model.js"

export interface WanexServerAttachmentUploadHandler {
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>
}

export function createWanexServerAttachmentUploadHandler(options: {
  readonly authentication: WanexServerAuthentication
  readonly attachments: LocalAttachmentUploadPort
  readonly maxAttachmentBytes?: number
  readonly now?: () => number
}): WanexServerAttachmentUploadHandler {
  const maxAttachmentBytes = options.maxAttachmentBytes ??
    MAX_CONVERSATION_ATTACHMENT_BYTES
  return Object.freeze({ handle })

  async function handle(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<boolean> {
    const url = parseRequestUrl(request.url)
    if (url.pathname !== REMOTE_ASSISTANT_ATTACHMENT_UPLOAD_PATH) return false
    try {
      if (url.search.length !== 0) {
        throw new AttachmentUploadRouteError(
          400,
          "invalid_attachment_upload",
          "Attachment upload does not accept query parameters"
        )
      }
      if (request.method !== "POST") {
        response.setHeader("allow", "POST")
        throw new AttachmentUploadRouteError(
          405,
          "method_not_allowed",
          "Attachment upload requires POST"
        )
      }
      await authenticateWanexServerRequest({
        input: request,
        authentication: options.authentication,
        operation: "Attachment upload",
        ...(options.now === undefined ? {} : { now: options.now })
      })
      const upload = await readAttachmentUploadHttpRequest({
        input: request,
        maxAttachmentBytes
      })
      const result = await options.attachments.uploadAttachment(upload)
      writeJson(response, 201, {
        kind: "wanex.server.attachment-uploaded",
        attachment: result.attachment
      })
    } catch (error) {
      if (response.headersSent || response.destroyed) {
        response.destroy(error instanceof Error ? error : undefined)
      } else {
        writeError(response, error)
      }
    }
    return true
  }
}

class AttachmentUploadRouteError extends Error {
  constructor(
    readonly statusCode: 400 | 405,
    readonly code: "invalid_attachment_upload" | "method_not_allowed",
    message: string
  ) {
    super(message)
    this.name = "AttachmentUploadRouteError"
  }
}

function parseRequestUrl(value: string | undefined): URL {
  try {
    return new URL(value ?? "/", "https://wanex.invalid")
  } catch {
    return new URL("/", "https://wanex.invalid")
  }
}

function writeError(response: ServerResponse, error: unknown): void {
  const normalized = normalizeError(error)
  if (normalized.statusCode === 401) {
    response.setHeader("www-authenticate", "Bearer")
  }
  writeJson(response, normalized.statusCode, {
    kind: "wanex.server.attachment-upload.error",
    error: {
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.statusCode === 503
    }
  })
}

function normalizeError(error: unknown): {
  readonly statusCode: number
  readonly code: string
  readonly message: string
} {
  if (
    error instanceof WanexServerAuthenticationError ||
    error instanceof AttachmentUploadHttpError ||
    error instanceof LocalAttachmentUploadError ||
    error instanceof AttachmentUploadRouteError
  ) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: boundedMessage(error.message)
    }
  }
  return {
    statusCode: 500,
    code: "application_failure",
    message: "Attachment upload failed"
  }
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown
): void {
  setSecurityHeaders(response)
  response.statusCode = statusCode
  response.setHeader("content-type", "application/json; charset=utf-8")
  response.end(JSON.stringify(value))
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("cache-control", "no-store")
  response.setHeader("vary", "authorization")
  response.setHeader("x-content-type-options", "nosniff")
  response.setHeader("referrer-policy", "no-referrer")
}

function boundedMessage(message: string): string {
  return message.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 512) ||
    "Attachment upload failed"
}
