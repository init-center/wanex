import type {
  ProductAppSurfaceClientTransport,
  ProductAppSurfaceClientTransportResult
} from "./types-surface-client.js"
import type {
  ProductAppReadSurfaceEventsRequest,
  ProductAppSurfaceAdapter,
  ProductAppSurfaceCommandRequest,
  ProductAppSurfaceDescriptor,
  ProductAppSurfaceEnvelope,
  ProductAppSurfaceError,
  ProductAppSurfaceEvent
} from "./types-surface.js"
import {
  invalidTransportResponseError,
  isProductAppSurfaceDescriptor,
  isProductAppSurfaceEnvelope,
  isProductAppSurfaceEvent,
  productAppSurfaceClientTransportError,
  transportFailureError
} from "./surface-client-validation.js"

export const PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS = {
  descriptor: "descriptor",
  dispatchSurfaceCommand: "dispatchSurfaceCommand",
  readSurfaceEvents: "readSurfaceEvents"
} as const

export type ProductAppSurfaceTransportOperation =
  (typeof PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS)[keyof typeof PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS]

export type ProductAppSurfaceTransportRequest =
  | ProductAppSurfaceDescriptorTransportRequest
  | ProductAppSurfaceCommandTransportRequest
  | ProductAppSurfaceEventsTransportRequest

export interface ProductAppSurfaceDescriptorTransportRequest {
  readonly kind: "product-app.surface-transport.request"
  readonly operation: typeof PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.descriptor
  readonly requestId?: string
}

export interface ProductAppSurfaceCommandTransportRequest {
  readonly kind: "product-app.surface-transport.request"
  readonly operation: typeof PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.dispatchSurfaceCommand
  readonly requestId?: string
  readonly command: ProductAppSurfaceCommandRequest
}

export interface ProductAppSurfaceEventsTransportRequest {
  readonly kind: "product-app.surface-transport.request"
  readonly operation: typeof PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.readSurfaceEvents
  readonly requestId?: string
  readonly input?: ProductAppReadSurfaceEventsRequest
}

export type ProductAppSurfaceTransportResponse =
  | ProductAppSurfaceDescriptorTransportResponse
  | ProductAppSurfaceCommandTransportResponse
  | ProductAppSurfaceEventsTransportResponse

export type ProductAppSurfaceDescriptorTransportResponse =
  ProductAppSurfaceTransportEnvelope<ProductAppSurfaceDescriptor>

export type ProductAppSurfaceCommandTransportResponse =
  ProductAppSurfaceTransportEnvelope<ProductAppSurfaceEnvelope>

export type ProductAppSurfaceEventsTransportResponse =
  ProductAppSurfaceTransportEnvelope<readonly ProductAppSurfaceEvent[]>

export type ProductAppSurfaceTransportEnvelope<T> =
  | {
      readonly ok: true
      readonly kind: "product-app.surface-transport.response"
      readonly operation: ProductAppSurfaceTransportOperation
      readonly requestId?: string
      readonly value: T
    }
  | {
      readonly ok: false
      readonly kind: "product-app.surface-transport.response"
      readonly operation: ProductAppSurfaceTransportOperation | "unknown"
      readonly requestId?: string
      readonly error: ProductAppSurfaceError
    }

export type ProductAppSurfaceTransportSender = (
  request: ProductAppSurfaceTransportRequest
) => ProductAppSurfaceClientTransportResult<ProductAppSurfaceTransportResponse>

export async function handleProductAppSurfaceTransportRequest(
  surface: ProductAppSurfaceAdapter,
  input: unknown
): Promise<ProductAppSurfaceTransportResponse> {
  const parsed = parseProductAppSurfaceTransportRequest(input)
  if (!parsed.ok) {
    return rejectedProductAppSurfaceTransportResponse({
      operation: parsed.operation,
      requestId: parsed.requestId,
      error: parsed.error
    })
  }

  const request = parsed.request
  try {
    switch (request.operation) {
      case PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.descriptor:
        return acceptedProductAppSurfaceTransportResponse({
          operation: request.operation,
          requestId: request.requestId,
          value: surface.descriptor()
        })
      case PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.dispatchSurfaceCommand:
        return acceptedProductAppSurfaceTransportResponse({
          operation: request.operation,
          requestId: request.requestId,
          value: await surface.dispatchSurfaceCommand(request.command)
        })
      case PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.readSurfaceEvents:
        return acceptedProductAppSurfaceTransportResponse({
          operation: request.operation,
          requestId: request.requestId,
          value: surface.readSurfaceEvents(request.input)
        })
    }
  } catch {
    return rejectedProductAppSurfaceTransportResponse({
      operation: request.operation,
      requestId: request.requestId,
      error: transportFailureError("surface transport handler failed")
    })
  }
}

export function createMessageProductAppSurfaceClientTransport(
  send: ProductAppSurfaceTransportSender
): ProductAppSurfaceClientTransport {
  return {
    async descriptor() {
      const response = await send({
        kind: "product-app.surface-transport.request",
        operation: PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.descriptor
      })
      const envelope = expectProductAppSurfaceTransportResponse(
        response,
        PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.descriptor
      )
      if (!envelope.ok) {
        throw productAppSurfaceClientTransportError(envelope.error)
      }
      if (!isProductAppSurfaceDescriptor(envelope.value)) {
        throw productAppSurfaceClientTransportError(
          invalidTransportResponseError()
        )
      }
      return envelope.value
    },
    async dispatchSurfaceCommand(request) {
      const response = await send({
        kind: "product-app.surface-transport.request",
        operation:
          PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.dispatchSurfaceCommand,
        ...(request.requestId === undefined
          ? {}
          : { requestId: request.requestId }),
        command: request
      })
      const envelope = expectProductAppSurfaceTransportResponse(
        response,
        PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.dispatchSurfaceCommand
      )
      if (!envelope.ok) {
        throw productAppSurfaceClientTransportError(envelope.error)
      }
      if (!isProductAppSurfaceEnvelope(envelope.value, request.command)) {
        throw productAppSurfaceClientTransportError(
          invalidTransportResponseError()
        )
      }
      return envelope.value
    },
    async readSurfaceEvents(request) {
      const response = await send({
        kind: "product-app.surface-transport.request",
        operation: PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.readSurfaceEvents,
        ...(request === undefined ? {} : { input: request })
      })
      const envelope = expectProductAppSurfaceTransportResponse(
        response,
        PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.readSurfaceEvents
      )
      if (!envelope.ok) {
        throw productAppSurfaceClientTransportError(envelope.error)
      }
      if (
        !Array.isArray(envelope.value) ||
        envelope.value.some((event) => !isProductAppSurfaceEvent(event))
      ) {
        throw productAppSurfaceClientTransportError(
          invalidTransportResponseError()
        )
      }
      return envelope.value
    }
  }
}

function parseProductAppSurfaceTransportRequest(input: unknown):
  | {
      readonly ok: true
      readonly request: ProductAppSurfaceTransportRequest
    }
  | {
      readonly ok: false
      readonly operation: ProductAppSurfaceTransportOperation | "unknown"
      readonly requestId?: string
      readonly error: ProductAppSurfaceError
    } {
  if (!isRecord(input)) {
    return invalidProductAppSurfaceTransportRequest("request must be an object")
  }
  const requestId = optionalRequestId(input.requestId)
  if (requestId.ok === false) {
    return invalidProductAppSurfaceTransportRequest(
      "request.requestId must be a string",
      "unknown"
    )
  }
  if (input.kind !== "product-app.surface-transport.request") {
    return invalidProductAppSurfaceTransportRequest(
      "request.kind must be product-app.surface-transport.request",
      "unknown",
      requestId.value
    )
  }
  if (typeof input.operation !== "string") {
    return invalidProductAppSurfaceTransportRequest(
      "request.operation must be a string",
      "unknown",
      requestId.value
    )
  }

  switch (input.operation) {
    case PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.descriptor:
      return {
        ok: true,
        request: {
          kind: "product-app.surface-transport.request",
          operation: input.operation,
          ...(requestId.value === undefined
            ? {}
            : { requestId: requestId.value })
        }
      }
    case PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.dispatchSurfaceCommand:
      const command = parseProductAppSurfaceCommandTransportCommand(input.command)
      if (!command.ok) {
        return invalidProductAppSurfaceTransportRequest(
          command.message,
          input.operation,
          requestId.value
        )
      }
      return {
        ok: true,
        request: {
          kind: "product-app.surface-transport.request",
          operation: input.operation,
          ...(requestId.value === undefined
            ? {}
            : { requestId: requestId.value }),
          command: command.value
        }
      }
    case PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.readSurfaceEvents:
      if (input.input !== undefined && !isRecord(input.input)) {
        return invalidProductAppSurfaceTransportRequest(
          "readSurfaceEvents request.input must be an object when present",
          input.operation,
          requestId.value
        )
      }
      if (
        isRecord(input.input) &&
        input.input.limit !== undefined &&
        !isNonNegativeInteger(input.input.limit)
      ) {
        return invalidProductAppSurfaceTransportRequest(
          "readSurfaceEvents request.input.limit must be a non-negative integer",
          input.operation,
          requestId.value
        )
      }
      if (
        isRecord(input.input) &&
        input.input.afterSequence !== undefined &&
        !isNonNegativeInteger(input.input.afterSequence)
      ) {
        return invalidProductAppSurfaceTransportRequest(
          "readSurfaceEvents request.input.afterSequence must be a non-negative integer",
          input.operation,
          requestId.value
        )
      }
      return {
        ok: true,
        request: {
          kind: "product-app.surface-transport.request",
          operation: input.operation,
          ...(requestId.value === undefined
            ? {}
            : { requestId: requestId.value }),
          ...(input.input === undefined
            ? {}
            : {
                input:
                  input.input as ProductAppReadSurfaceEventsRequest
              })
        }
      }
    default:
      return invalidProductAppSurfaceTransportRequest(
        `unsupported product app surface transport operation: ${input.operation}`,
        "unknown",
        requestId.value
      )
  }
}

function expectProductAppSurfaceTransportResponse(
  input: unknown,
  operation: ProductAppSurfaceTransportOperation
): ProductAppSurfaceTransportResponse {
  if (
    !isRecord(input) ||
    input.kind !== "product-app.surface-transport.response" ||
    input.operation !== operation
  ) {
    throw productAppSurfaceClientTransportError(invalidTransportResponseError())
  }
  if (input.ok === true) {
    return input as ProductAppSurfaceTransportResponse
  }
  if (input.ok === false && isProductAppSurfaceTransportError(input.error)) {
    return input as ProductAppSurfaceTransportResponse
  }
  throw productAppSurfaceClientTransportError(invalidTransportResponseError())
}

function parseProductAppSurfaceCommandTransportCommand(input: unknown):
  | {
      readonly ok: true
      readonly value: ProductAppSurfaceCommandRequest
    }
  | {
      readonly ok: false
      readonly message: string
    } {
  if (!isRecord(input)) {
    return {
      ok: false,
      message: "dispatchSurfaceCommand request.command must be an object"
    }
  }
  if (typeof input.command !== "string" || input.command.trim().length === 0) {
    return {
      ok: false,
      message:
        "dispatchSurfaceCommand request.command.command must be a non-empty string"
    }
  }
  if (
    input.requestId !== undefined &&
    (typeof input.requestId !== "string" || input.requestId.trim().length === 0)
  ) {
    return {
      ok: false,
      message:
        "dispatchSurfaceCommand request.command.requestId must be a non-empty string"
    }
  }
  return {
    ok: true,
    value: {
      command: input.command,
      ...("input" in input ? { input: input.input } : {}),
      ...(input.requestId === undefined
        ? {}
        : { requestId: input.requestId })
    }
  }
}

function acceptedProductAppSurfaceTransportResponse<T>(request: {
  readonly operation: ProductAppSurfaceTransportOperation
  readonly requestId: string | undefined
  readonly value: T
}): ProductAppSurfaceTransportEnvelope<T> {
  return {
    ok: true,
    kind: "product-app.surface-transport.response",
    operation: request.operation,
    ...(request.requestId === undefined
      ? {}
      : { requestId: request.requestId }),
    value: request.value
  }
}

function rejectedProductAppSurfaceTransportResponse(request: {
  readonly operation: ProductAppSurfaceTransportOperation | "unknown"
  readonly requestId: string | undefined
  readonly error: ProductAppSurfaceError
}): Extract<ProductAppSurfaceTransportEnvelope<unknown>, { ok: false }> {
  return {
    ok: false,
    kind: "product-app.surface-transport.response",
    operation: request.operation,
    ...(request.requestId === undefined
      ? {}
      : { requestId: request.requestId }),
    error: request.error
  }
}

function invalidProductAppSurfaceTransportRequest(
  message: string,
  operation: ProductAppSurfaceTransportOperation | "unknown" = "unknown",
  requestId?: string
): {
  readonly ok: false
  readonly operation: ProductAppSurfaceTransportOperation | "unknown"
  readonly requestId?: string
  readonly error: ProductAppSurfaceError
} {
  return {
    ok: false,
    operation,
    ...(requestId === undefined ? {} : { requestId }),
    error: {
      code: "validation_error",
      category: "validation",
      message
    }
  }
}

function isProductAppSurfaceTransportError(
  value: unknown
): value is ProductAppSurfaceError {
  return (
    isRecord(value) &&
    (value.code === "unknown_command" ||
      value.code === "validation_error" ||
      value.code === "command_error" ||
      value.code === "invalid_transport_response") &&
    (value.category === "validation" || value.category === "runtime") &&
    typeof value.message === "string"
  )
}

function optionalRequestId(input: unknown):
  | {
      readonly ok: true
      readonly value: string | undefined
    }
  | {
      readonly ok: false
    } {
  if (input === undefined) {
    return { ok: true, value: undefined }
  }
  if (typeof input !== "string" || input.trim().length === 0) {
    return { ok: false }
  }
  return { ok: true, value: input }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
