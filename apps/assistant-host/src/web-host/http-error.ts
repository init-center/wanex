import { LocalAttachmentUploadError } from "../resources/attachment.js"
import { LocalResourceDeliveryError } from "../resources/delivery.js"

export class WebHostHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = "WebHostHttpError"
  }
}

export function normalizeHttpError(error: unknown): {
  readonly statusCode: number
  readonly code: string
  readonly message: string
  readonly totalSizeBytes?: number
} {
  if (error instanceof WebHostHttpError) return error
  if (error instanceof LocalAttachmentUploadError) return error
  if (error instanceof LocalResourceDeliveryError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      ...(error.totalSizeBytes === undefined
        ? {}
        : { totalSizeBytes: error.totalSizeBytes })
    }
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    "code" in error &&
    (error as { readonly statusCode?: unknown }).statusCode === 403 &&
    (error as { readonly code?: unknown }).code === "host_session_required"
  ) {
    return {
      statusCode: 403,
      code: "host_session_required",
      message:
        error instanceof Error
          ? error.message
          : "assistant host session token is required"
    }
  }
  return {
    statusCode: 400,
    code: "invalid_http_request",
    message: error instanceof Error ? error.message : String(error)
  }
}

export function isRecord(
  value: unknown
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
