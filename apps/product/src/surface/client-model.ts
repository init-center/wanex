import type {
  ReadSurfaceEventsRequest,
  SurfaceCommand,
  SurfaceCommandRequest,
  SurfaceDescriptor,
  SurfaceEnvelope,
  SurfaceEventListener,
  SurfaceEventPage,
  SurfaceEventUnsubscribe
} from "./model.js"

export interface SurfaceClientTransport {
  descriptor(): SurfaceClientTransportResult<SurfaceDescriptor>
  dispatchSurfaceCommand(
    request: SurfaceClientCommandRequest
  ): SurfaceClientTransportResult<SurfaceEnvelope>
  readSurfaceEvents(
    request?: ReadSurfaceEventsRequest
  ): SurfaceClientTransportResult<SurfaceEventPage>
  subscribeSurfaceEvents(
    listener: SurfaceEventListener
  ): SurfaceEventUnsubscribe
}

export type SurfaceClientCommandRequest =
  Omit<SurfaceCommandRequest, "command"> & {
    readonly command: SurfaceCommand
  }

export type SurfaceClientTransportResult<T> = T | Promise<T>
