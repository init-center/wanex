import type {
  SurfaceAdapter,
  SurfaceEventListener,
  SurfaceEventUnsubscribe
} from "./model.js"
import {
  SURFACE_TRANSPORT_OPERATIONS,
  handleSurfaceTransportRequest,
  type SurfaceTransportOperation,
  type SurfaceTransportResponse
} from "./transport.js"
import {
  transportFailureError
} from "./validation.js"

export interface SurfaceHostEndpoint {
  send(request: unknown): Promise<SurfaceTransportResponse>
  subscribe(
    listener: SurfaceEventListener
  ): SurfaceEventUnsubscribe
}

export interface SurfaceHostEndpointOptions {
  readonly surface: SurfaceAdapter
  readonly observeRequest?: (request: unknown) => void
}

export function createSurfaceHostEndpoint(
  options: SurfaceHostEndpointOptions
): SurfaceHostEndpoint {
  return {
    async send(request) {
      try {
        options.observeRequest?.(request)
        return await handleSurfaceTransportRequest(
          options.surface,
          request
        )
      } catch {
        return {
          ok: false,
          kind: "product.surface-transport.response",
          operation: readKnownOperation(request),
          ...readRequestId(request),
          error: transportFailureError("surface host endpoint failed")
        }
      }
    },
    subscribe(listener) {
      return options.surface.subscribeSurfaceEvents(listener)
    }
  }
}

function readKnownOperation(
  request: unknown
): SurfaceTransportOperation | "unknown" {
  if (!isRecord(request) || typeof request.operation !== "string") {
    return "unknown"
  }
  return isSurfaceTransportOperation(request.operation)
    ? request.operation
    : "unknown"
}

function readRequestId(request: unknown): { readonly requestId?: string } {
  if (!isRecord(request) || typeof request.requestId !== "string") {
    return {}
  }
  return request.requestId.trim().length === 0
    ? {}
    : { requestId: request.requestId }
}

function isSurfaceTransportOperation(
  value: string
): value is SurfaceTransportOperation {
  return (
    value === SURFACE_TRANSPORT_OPERATIONS.descriptor ||
    value ===
      SURFACE_TRANSPORT_OPERATIONS.dispatchSurfaceCommand ||
    value === SURFACE_TRANSPORT_OPERATIONS.readSurfaceEvents
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
