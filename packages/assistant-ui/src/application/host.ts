import type {
  SurfaceAdapter
} from "@wanex/assistant"
import {
  createMessageSurfaceClientTransport,
  createSurfaceClient,
  createSurfaceHostEndpoint,
  type SurfaceClient,
  type SurfaceTransportRequest,
  type SurfaceTransportResponse
} from "@wanex/assistant/surface"

export interface HostSurfaceClientOptions {
  readonly surface: SurfaceAdapter
  readonly observeRequest?: (request: SurfaceTransportRequest) => void
}

export function createHostSurfaceClient(
  options: HostSurfaceClientOptions
): SurfaceClient {
  const endpoint = createSurfaceHostEndpoint({
    surface: options.surface,
    observeRequest(request) {
      if (isSurfaceTransportRequest(request)) {
        options.observeRequest?.(request)
      }
    }
  })
  return createSurfaceClient(
    createMessageSurfaceClientTransport({
      send: async (request) => endpoint.send(request),
      subscribe: (listener) => endpoint.subscribe(listener)
    })
  )
}

export async function sendHostSurfaceMessage(
  surface: SurfaceAdapter,
  request: SurfaceTransportRequest
): Promise<SurfaceTransportResponse> {
  return await createSurfaceHostEndpoint({ surface }).send(request)
}

function isSurfaceTransportRequest(
  value: unknown
): value is SurfaceTransportRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "kind" in value &&
    value.kind === "assistant.surface-transport.request" &&
    "operation" in value &&
    typeof value.operation === "string"
  )
}
