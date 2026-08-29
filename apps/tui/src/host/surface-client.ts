import type {
  SurfaceAdapter
} from "@wanex/assistant"
import {
  createSurfaceHostEndpoint,
  createMessageSurfaceClientTransport,
  createSurfaceClient,
  type SurfaceClient,
  type SurfaceTransportRequest,
  type SurfaceTransportResponse
} from "@wanex/assistant/surface"

export interface TuiHostSurfaceClientOptions {
  readonly surface: SurfaceAdapter
  readonly observeRequest?: (request: SurfaceTransportRequest) => void
}

export function createTuiHostSurfaceClient(
  options: TuiHostSurfaceClientOptions
): SurfaceClient {
  const endpoint = createSurfaceHostEndpoint({
    surface: options.surface,
    observeRequest(request) {
      options.observeRequest?.(request as SurfaceTransportRequest)
    }
  })
  return createSurfaceClient(
    createMessageSurfaceClientTransport({
      async send(request) {
        return await endpoint.send(request)
      },
      subscribe(listener) {
        return endpoint.subscribe(listener)
      }
    })
  )
}

export async function sendTuiHostSurfaceMessage(
  surface: SurfaceAdapter,
  request: SurfaceTransportRequest
): Promise<SurfaceTransportResponse> {
  return await createSurfaceHostEndpoint({ surface }).send(request)
}
