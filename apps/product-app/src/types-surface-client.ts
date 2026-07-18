import type {
  ProductAppReadSurfaceEventsRequest,
  ProductAppSurfaceCommand,
  ProductAppSurfaceCommandRequest,
  ProductAppSurfaceDescriptor,
  ProductAppSurfaceEnvelope,
  ProductAppSurfaceEvent
} from "./types-surface.js"

export interface ProductAppSurfaceClientTransport {
  descriptor(): ProductAppSurfaceClientTransportResult<ProductAppSurfaceDescriptor>
  dispatchSurfaceCommand(
    request: ProductAppSurfaceClientCommandRequest
  ): ProductAppSurfaceClientTransportResult<ProductAppSurfaceEnvelope>
  readSurfaceEvents(
    request?: ProductAppReadSurfaceEventsRequest
  ): ProductAppSurfaceClientTransportResult<readonly ProductAppSurfaceEvent[]>
}

export type ProductAppSurfaceClientCommandRequest =
  Omit<ProductAppSurfaceCommandRequest, "command"> & {
    readonly command: ProductAppSurfaceCommand
  }

export type ProductAppSurfaceClientTransportResult<T> = T | Promise<T>
