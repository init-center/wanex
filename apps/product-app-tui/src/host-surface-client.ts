import type {
  ProductAppSurfaceAdapter
} from "@wanex/product-app"
import {
  createProductAppSurfaceHostEndpoint,
  createMessageProductAppSurfaceClientTransport,
  createProductAppSurfaceClient,
  type ProductAppSurfaceClient,
  type ProductAppSurfaceTransportRequest,
  type ProductAppSurfaceTransportResponse
} from "@wanex/product-app/surface-client"

export interface ProductAppTuiHostSurfaceClientOptions {
  readonly surface: ProductAppSurfaceAdapter
  readonly observeRequest?: (request: ProductAppSurfaceTransportRequest) => void
}

export function createProductAppTuiHostSurfaceClient(
  options: ProductAppTuiHostSurfaceClientOptions
): ProductAppSurfaceClient {
  const endpoint = createProductAppSurfaceHostEndpoint({
    surface: options.surface,
    observeRequest(request) {
      options.observeRequest?.(request as ProductAppSurfaceTransportRequest)
    }
  })
  return createProductAppSurfaceClient(
    createMessageProductAppSurfaceClientTransport(async (request) => {
      return await endpoint.send(request)
    })
  )
}

export async function sendProductAppTuiHostSurfaceMessage(
  surface: ProductAppSurfaceAdapter,
  request: ProductAppSurfaceTransportRequest
): Promise<ProductAppSurfaceTransportResponse> {
  return await createProductAppSurfaceHostEndpoint({ surface }).send(request)
}
