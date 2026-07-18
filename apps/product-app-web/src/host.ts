import type {
  ProductAppSurfaceAdapter
} from "@wanex/product-app"
import {
  createMessageProductAppSurfaceClientTransport,
  createProductAppSurfaceClient,
  createProductAppSurfaceHostEndpoint,
  type ProductAppSurfaceClient,
  type ProductAppSurfaceTransportRequest,
  type ProductAppSurfaceTransportResponse
} from "@wanex/product-app/surface-client"

export interface ProductAppWebHostSurfaceClientOptions {
  readonly surface: ProductAppSurfaceAdapter
  readonly observeRequest?: (request: ProductAppSurfaceTransportRequest) => void
}

export function createProductAppWebHostSurfaceClient(
  options: ProductAppWebHostSurfaceClientOptions
): ProductAppSurfaceClient {
  const endpoint = createProductAppSurfaceHostEndpoint({
    surface: options.surface,
    observeRequest(request) {
      if (isProductAppSurfaceTransportRequest(request)) {
        options.observeRequest?.(request)
      }
    }
  })
  return createProductAppSurfaceClient(
    createMessageProductAppSurfaceClientTransport(async (request) =>
      endpoint.send(request)
    )
  )
}

export async function sendProductAppWebHostSurfaceMessage(
  surface: ProductAppSurfaceAdapter,
  request: ProductAppSurfaceTransportRequest
): Promise<ProductAppSurfaceTransportResponse> {
  return await createProductAppSurfaceHostEndpoint({ surface }).send(request)
}

function isProductAppSurfaceTransportRequest(
  value: unknown
): value is ProductAppSurfaceTransportRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "kind" in value &&
    value.kind === "product-app.surface-transport.request" &&
    "operation" in value &&
    typeof value.operation === "string"
  )
}
