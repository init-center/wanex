import type {
  SurfaceClientTransport,
  SurfaceClientTransportResult
} from "./client-model.js"
import type {
  ReadSurfaceEventsRequest,
  SurfaceAdapter,
  SurfaceCommandRequest,
  SurfaceDescriptor,
  SurfaceEnvelope,
  SurfaceError,
  SurfaceEvent,
  SurfaceEventListener,
  SurfaceEventPage,
  SurfaceEventUnsubscribe
} from "./model.js"
import {
  invalidTransportResponseError,
  isSurfaceDescriptor,
  isSurfaceEnvelope,
  isSurfaceEvent,
  isSurfaceEventPage,
  surfaceClientTransportError,
  transportFailureError
} from "./validation.js"

export const SURFACE_TRANSPORT_OPERATIONS = {
  descriptor: "descriptor",
  dispatchSurfaceCommand: "dispatchSurfaceCommand",
  readSurfaceEvents: "readSurfaceEvents"
} as const

export type SurfaceTransportOperation =
  (typeof SURFACE_TRANSPORT_OPERATIONS)[keyof typeof SURFACE_TRANSPORT_OPERATIONS]

export type SurfaceTransportRequest =
  | SurfaceDescriptorTransportRequest
  | SurfaceCommandTransportRequest
  | SurfaceEventsTransportRequest

export interface SurfaceDescriptorTransportRequest {
  readonly kind: "product.surface-transport.request"
  readonly operation: typeof SURFACE_TRANSPORT_OPERATIONS.descriptor
  readonly requestId?: string
}

export interface SurfaceCommandTransportRequest {
  readonly kind: "product.surface-transport.request"
  readonly operation: typeof SURFACE_TRANSPORT_OPERATIONS.dispatchSurfaceCommand
  readonly requestId?: string
  readonly command: SurfaceCommandRequest
}

export interface SurfaceEventsTransportRequest {
  readonly kind: "product.surface-transport.request"
  readonly operation: typeof SURFACE_TRANSPORT_OPERATIONS.readSurfaceEvents
  readonly requestId?: string
  readonly input?: ReadSurfaceEventsRequest
}

export type SurfaceTransportResponse =
  | SurfaceDescriptorTransportResponse
  | SurfaceCommandTransportResponse
  | SurfaceEventsTransportResponse

export type SurfaceDescriptorTransportResponse =
  SurfaceTransportEnvelope<SurfaceDescriptor>

export type SurfaceCommandTransportResponse =
  SurfaceTransportEnvelope<SurfaceEnvelope>

export type SurfaceEventsTransportResponse =
  SurfaceTransportEnvelope<SurfaceEventPage>

export type SurfaceTransportEnvelope<T> =
  | {
      readonly ok: true
      readonly kind: "product.surface-transport.response"
      readonly operation: SurfaceTransportOperation
      readonly requestId?: string
      readonly value: T
    }
  | {
      readonly ok: false
      readonly kind: "product.surface-transport.response"
      readonly operation: SurfaceTransportOperation | "unknown"
      readonly requestId?: string
      readonly error: SurfaceError
    }

export type SurfaceTransportSender = (
  request: SurfaceTransportRequest
) => SurfaceClientTransportResult<SurfaceTransportResponse>

export type SurfaceTransportSubscriber = (
  listener: SurfaceEventListener
) => SurfaceEventUnsubscribe

export interface MessageSurfaceClientTransportOptions {
  readonly send: SurfaceTransportSender
  readonly subscribe: SurfaceTransportSubscriber
}

export async function handleSurfaceTransportRequest(
  surface: SurfaceAdapter,
  input: unknown
): Promise<SurfaceTransportResponse> {
  const parsed = parseSurfaceTransportRequest(input)
  if (!parsed.ok) {
    return rejectedSurfaceTransportResponse({
      operation: parsed.operation,
      requestId: parsed.requestId,
      error: parsed.error
    })
  }

  const request = parsed.request
  try {
    switch (request.operation) {
      case SURFACE_TRANSPORT_OPERATIONS.descriptor:
        return acceptedSurfaceTransportResponse({
          operation: request.operation,
          requestId: request.requestId,
          value: surface.descriptor()
        })
      case SURFACE_TRANSPORT_OPERATIONS.dispatchSurfaceCommand:
        return acceptedSurfaceTransportResponse({
          operation: request.operation,
          requestId: request.requestId,
          value: await surface.dispatchSurfaceCommand(request.command)
        })
      case SURFACE_TRANSPORT_OPERATIONS.readSurfaceEvents:
        return acceptedSurfaceTransportResponse({
          operation: request.operation,
          requestId: request.requestId,
          value: surface.readSurfaceEvents(request.input)
        })
    }
  } catch {
    return rejectedSurfaceTransportResponse({
      operation: request.operation,
      requestId: request.requestId,
      error: transportFailureError("surface transport handler failed")
    })
  }
}

export function createMessageSurfaceClientTransport(
  options: MessageSurfaceClientTransportOptions
): SurfaceClientTransport {
  return {
    async descriptor() {
      const response = await options.send({
        kind: "product.surface-transport.request",
        operation: SURFACE_TRANSPORT_OPERATIONS.descriptor
      })
      const envelope = expectSurfaceTransportResponse(
        response,
        SURFACE_TRANSPORT_OPERATIONS.descriptor
      )
      if (!envelope.ok) {
        throw surfaceClientTransportError(envelope.error)
      }
      if (!isSurfaceDescriptor(envelope.value)) {
        throw surfaceClientTransportError(
          invalidTransportResponseError()
        )
      }
      return envelope.value
    },
    async dispatchSurfaceCommand(request) {
      const response = await options.send({
        kind: "product.surface-transport.request",
        operation:
          SURFACE_TRANSPORT_OPERATIONS.dispatchSurfaceCommand,
        ...(request.requestId === undefined
          ? {}
          : { requestId: request.requestId }),
        command: request
      })
      const envelope = expectSurfaceTransportResponse(
        response,
        SURFACE_TRANSPORT_OPERATIONS.dispatchSurfaceCommand
      )
      if (!envelope.ok) {
        throw surfaceClientTransportError(envelope.error)
      }
      if (!isSurfaceEnvelope(envelope.value, request.command)) {
        throw surfaceClientTransportError(
          invalidTransportResponseError()
        )
      }
      return envelope.value
    },
    async readSurfaceEvents(request) {
      const response = await options.send({
        kind: "product.surface-transport.request",
        operation: SURFACE_TRANSPORT_OPERATIONS.readSurfaceEvents,
        ...(request === undefined ? {} : { input: request })
      })
      const envelope = expectSurfaceTransportResponse(
        response,
        SURFACE_TRANSPORT_OPERATIONS.readSurfaceEvents
      )
      if (!envelope.ok) {
        throw surfaceClientTransportError(envelope.error)
      }
      if (!isSurfaceEventPage(envelope.value)) {
        throw surfaceClientTransportError(
          invalidTransportResponseError()
        )
      }
      return envelope.value
    },
    subscribeSurfaceEvents(listener) {
      return options.subscribe((event) => {
        if (isSurfaceEvent(event)) {
          listener(event)
        }
      })
    }
  }
}

function parseSurfaceTransportRequest(input: unknown):
  | {
      readonly ok: true
      readonly request: SurfaceTransportRequest
    }
  | {
      readonly ok: false
      readonly operation: SurfaceTransportOperation | "unknown"
      readonly requestId?: string
      readonly error: SurfaceError
    } {
  if (!isRecord(input)) {
    return invalidSurfaceTransportRequest("request must be an object")
  }
  const requestId = optionalRequestId(input.requestId)
  if (requestId.ok === false) {
    return invalidSurfaceTransportRequest(
      "request.requestId must be a string",
      "unknown"
    )
  }
  if (input.kind !== "product.surface-transport.request") {
    return invalidSurfaceTransportRequest(
      "request.kind must be product.surface-transport.request",
      "unknown",
      requestId.value
    )
  }
  if (typeof input.operation !== "string") {
    return invalidSurfaceTransportRequest(
      "request.operation must be a string",
      "unknown",
      requestId.value
    )
  }

  switch (input.operation) {
    case SURFACE_TRANSPORT_OPERATIONS.descriptor:
      return {
        ok: true,
        request: {
          kind: "product.surface-transport.request",
          operation: input.operation,
          ...(requestId.value === undefined
            ? {}
            : { requestId: requestId.value })
        }
      }
    case SURFACE_TRANSPORT_OPERATIONS.dispatchSurfaceCommand:
      const command = parseSurfaceCommandTransportCommand(input.command)
      if (!command.ok) {
        return invalidSurfaceTransportRequest(
          command.message,
          input.operation,
          requestId.value
        )
      }
      return {
        ok: true,
        request: {
          kind: "product.surface-transport.request",
          operation: input.operation,
          ...(requestId.value === undefined
            ? {}
            : { requestId: requestId.value }),
          command: command.value
        }
      }
    case SURFACE_TRANSPORT_OPERATIONS.readSurfaceEvents:
      if (input.input !== undefined && !isRecord(input.input)) {
        return invalidSurfaceTransportRequest(
          "readSurfaceEvents request.input must be an object when present",
          input.operation,
          requestId.value
        )
      }
      if (
        isRecord(input.input) &&
        input.input.limit !== undefined &&
        !isPositiveInteger(input.input.limit)
      ) {
        return invalidSurfaceTransportRequest(
          "readSurfaceEvents request.input.limit must be a positive integer",
          input.operation,
          requestId.value
        )
      }
      if (
        isRecord(input.input) &&
        input.input.streamId !== undefined &&
        (typeof input.input.streamId !== "string" ||
          input.input.streamId.trim().length === 0)
      ) {
        return invalidSurfaceTransportRequest(
          "readSurfaceEvents request.input.streamId must be a non-empty string",
          input.operation,
          requestId.value
        )
      }
      if (
        isRecord(input.input) &&
        input.input.afterSequence !== undefined &&
        !isNonNegativeInteger(input.input.afterSequence)
      ) {
        return invalidSurfaceTransportRequest(
          "readSurfaceEvents request.input.afterSequence must be a non-negative integer",
          input.operation,
          requestId.value
        )
      }
      return {
        ok: true,
        request: {
          kind: "product.surface-transport.request",
          operation: input.operation,
          ...(requestId.value === undefined
            ? {}
            : { requestId: requestId.value }),
          ...(input.input === undefined
            ? {}
            : {
                input:
                  input.input as ReadSurfaceEventsRequest
              })
        }
      }
    default:
      return invalidSurfaceTransportRequest(
        `unsupported surface transport operation: ${input.operation}`,
        "unknown",
        requestId.value
      )
  }
}

function expectSurfaceTransportResponse(
  input: unknown,
  operation: SurfaceTransportOperation
): SurfaceTransportResponse {
  if (
    !isRecord(input) ||
    input.kind !== "product.surface-transport.response" ||
    input.operation !== operation
  ) {
    throw surfaceClientTransportError(invalidTransportResponseError())
  }
  if (input.ok === true) {
    return input as SurfaceTransportResponse
  }
  if (input.ok === false && isSurfaceTransportError(input.error)) {
    return input as SurfaceTransportResponse
  }
  throw surfaceClientTransportError(invalidTransportResponseError())
}

function parseSurfaceCommandTransportCommand(input: unknown):
  | {
      readonly ok: true
      readonly value: SurfaceCommandRequest
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

function acceptedSurfaceTransportResponse<T>(request: {
  readonly operation: SurfaceTransportOperation
  readonly requestId: string | undefined
  readonly value: T
}): SurfaceTransportEnvelope<T> {
  return {
    ok: true,
    kind: "product.surface-transport.response",
    operation: request.operation,
    ...(request.requestId === undefined
      ? {}
      : { requestId: request.requestId }),
    value: request.value
  }
}

function rejectedSurfaceTransportResponse(request: {
  readonly operation: SurfaceTransportOperation | "unknown"
  readonly requestId: string | undefined
  readonly error: SurfaceError
}): Extract<SurfaceTransportEnvelope<unknown>, { ok: false }> {
  return {
    ok: false,
    kind: "product.surface-transport.response",
    operation: request.operation,
    ...(request.requestId === undefined
      ? {}
      : { requestId: request.requestId }),
    error: request.error
  }
}

function invalidSurfaceTransportRequest(
  message: string,
  operation: SurfaceTransportOperation | "unknown" = "unknown",
  requestId?: string
): {
  readonly ok: false
  readonly operation: SurfaceTransportOperation | "unknown"
  readonly requestId?: string
  readonly error: SurfaceError
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

function isSurfaceTransportError(
  value: unknown
): value is SurfaceError {
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
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
