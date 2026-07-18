import type {
  ProductAppSurfaceAdapter
} from "./types-surface.js"
import {
  PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS,
  handleProductAppSurfaceTransportRequest,
  type ProductAppSurfaceTransportOperation,
  type ProductAppSurfaceTransportResponse
} from "./surface-transport.js"
import {
  transportFailureError
} from "./surface-client-validation.js"

export interface ProductAppSurfaceHostEndpoint {
  send(request: unknown): Promise<ProductAppSurfaceTransportResponse>
}

export interface ProductAppSurfaceHostEndpointOptions {
  readonly surface: ProductAppSurfaceAdapter
  readonly observeRequest?: (request: unknown) => void
}

export function createProductAppSurfaceHostEndpoint(
  options: ProductAppSurfaceHostEndpointOptions
): ProductAppSurfaceHostEndpoint {
  return {
    async send(request) {
      try {
        options.observeRequest?.(request)
        return await handleProductAppSurfaceTransportRequest(
          options.surface,
          request
        )
      } catch {
        return {
          ok: false,
          kind: "product-app.surface-transport.response",
          operation: readKnownOperation(request),
          ...readRequestId(request),
          error: transportFailureError("surface host endpoint failed")
        }
      }
    }
  }
}

function readKnownOperation(
  request: unknown
): ProductAppSurfaceTransportOperation | "unknown" {
  if (!isRecord(request) || typeof request.operation !== "string") {
    return "unknown"
  }
  return isProductAppSurfaceTransportOperation(request.operation)
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

function isProductAppSurfaceTransportOperation(
  value: string
): value is ProductAppSurfaceTransportOperation {
  return (
    value === PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.descriptor ||
    value ===
      PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.dispatchSurfaceCommand ||
    value === PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS.readSurfaceEvents
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
