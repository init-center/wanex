import type {
  ProductAppSurfaceCommand,
  ProductAppSurfaceDescriptor,
  ProductAppSurfaceEnvelope,
  ProductAppSurfaceError,
  ProductAppSurfaceEvent
} from "./types-surface.js"

export function invalidTransportResponseError(): ProductAppSurfaceError {
  return {
    code: "invalid_transport_response",
    category: "runtime",
    message: "surface transport returned an invalid response"
  }
}

export class ProductAppSurfaceClientTransportError extends Error {
  readonly surfaceError: ProductAppSurfaceError

  constructor(surfaceError: ProductAppSurfaceError) {
    super(surfaceError.message)
    this.name = "ProductAppSurfaceClientTransportError"
    this.surfaceError = surfaceError
  }
}

export function productAppSurfaceClientTransportError(
  surfaceError: ProductAppSurfaceError
): ProductAppSurfaceClientTransportError {
  return new ProductAppSurfaceClientTransportError(surfaceError)
}

export function normalizeProductAppSurfaceClientTransportFailure(
  error: unknown,
  fallbackMessage: string
): ProductAppSurfaceError {
  if (error instanceof ProductAppSurfaceClientTransportError) {
    return error.surfaceError
  }
  return transportFailureError(fallbackMessage)
}

export function transportFailureError(
  message: string
): ProductAppSurfaceError {
  return {
    code: "command_error",
    category: "runtime",
    message
  }
}

export function isProductAppSurfaceDescriptor(
  value: unknown
): value is ProductAppSurfaceDescriptor {
  if (!isRecord(value)) {
    return false
  }
  return (
    value.kind === "product-app.surface-descriptor" &&
    value.transport === "app-owned-ipc-or-api" &&
    typeof value.commandCount === "number" &&
    isRecord(value.rendererBoundary) &&
    Array.isArray(value.commands)
  )
}

export function isProductAppSurfaceEnvelope(
  value: unknown,
  command: ProductAppSurfaceCommand
): value is ProductAppSurfaceEnvelope {
  if (!isRecord(value) || value.command !== command) {
    return false
  }
  if (value.ok === true) {
    return isProductAppSurfaceEvent(value.event)
  }
  if (value.ok === false) {
    return (
      isProductAppSurfaceError(value.error) &&
      isProductAppSurfaceEvent(value.event)
    )
  }
  return false
}

export function isProductAppSurfaceEvent(
  value: unknown
): value is ProductAppSurfaceEvent {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.id === "string" &&
    typeof value.sequence === "number" &&
    isProductAppSurfaceEventType(value.type) &&
    typeof value.command === "string" &&
    typeof value.at === "number" &&
    optionalString(value.requestId) &&
    optionalRecord(value.state) &&
    optionalConversationEvent(value.conversation) &&
    optionalSurfaceError(value.error)
  )
}

function isProductAppSurfaceError(
  value: unknown
): value is ProductAppSurfaceError {
  if (!isRecord(value)) {
    return false
  }
  return (
    isProductAppSurfaceErrorCode(value.code) &&
    (value.category === "validation" || value.category === "runtime") &&
    typeof value.message === "string"
  )
}

function isProductAppSurfaceEventType(value: unknown): boolean {
  return (
    value === "product-app.surface.command_completed" ||
    value === "product-app.surface.command_rejected" ||
    value === "product-app.surface.state_changed" ||
    value === "product-app.surface.conversation.assistant-text-delta"
  )
}

function isProductAppSurfaceErrorCode(value: unknown): boolean {
  return (
    value === "unknown_command" ||
    value === "validation_error" ||
    value === "command_error" ||
    value === "invalid_transport_response"
  )
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string"
}

function optionalRecord(value: unknown): boolean {
  return value === undefined || isRecord(value)
}

function optionalSurfaceError(value: unknown): boolean {
  return value === undefined || isProductAppSurfaceError(value)
}

function optionalConversationEvent(value: unknown): boolean {
  if (value === undefined) {
    return true
  }
  if (!isRecord(value)) {
    return false
  }
  return (
    value.kind === "product-app.conversation.assistant-text-delta" &&
    typeof value.sequence === "number" &&
    typeof value.at === "number" &&
    typeof value.operationId === "string" &&
    typeof value.sessionId === "string" &&
    typeof value.partId === "string" &&
    typeof value.text === "string" &&
    typeof value.truncated === "boolean"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
