import type {
  ProductAppSurfaceCommand,
  ProductAppSurfaceError,
  ProductAppSurfaceEvent
} from "./types-surface.js"

export interface ProductAppSurfaceClientEventFactory {
  rejected(request: {
    readonly command: ProductAppSurfaceCommand
    readonly requestId: string | undefined
    readonly error: ProductAppSurfaceError
  }): ProductAppSurfaceEvent
}

export function createProductAppSurfaceClientEventFactory(
  now: () => number
): ProductAppSurfaceClientEventFactory {
  let sequence = 0
  return {
    rejected(request) {
      sequence += 1
      return {
        id: `product_app_surface_client_event_${sequence}`,
        sequence,
        type: "product-app.surface.command_rejected",
        command: request.command,
        at: now(),
        ...(request.requestId === undefined
          ? {}
          : { requestId: request.requestId }),
        error: request.error
      }
    }
  }
}
