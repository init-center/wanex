import type {
  SurfaceCommand,
  SurfaceError,
  SurfaceEvent
} from "./model.js"

export interface SurfaceClientEventFactory {
  rejected(request: {
    readonly command: SurfaceCommand
    readonly requestId: string | undefined
    readonly error: SurfaceError
  }): SurfaceEvent
}

export function createSurfaceClientEventFactory(
  now: () => number
): SurfaceClientEventFactory {
  let sequence = 0
  return {
    rejected(request) {
      sequence += 1
      return {
        id: `assistant_app_surface_client_event_${sequence}`,
        sequence,
        type: "assistant.surface.command_rejected",
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
