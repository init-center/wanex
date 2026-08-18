import type {
  SurfaceClientCommandRequest,
  SurfaceClientTransport,
} from "../client-model.js";
import type {
  SurfaceAdapter,
  SurfaceCommand,
  SurfaceError,
} from "../model.js";
import type { SurfaceClientEventFactory } from "../events.js";
import {
  invalidTransportResponseError,
  isSurfaceEnvelope,
  normalizeSurfaceClientTransportFailure,
} from "../validation.js";
import type {
  SurfaceClientCommandEnvelope,
  SurfaceClientDescriptorResult,
  SurfaceClientRequestOptions,
} from "./contracts.js";

export function createInProcessSurfaceClientTransport(
  surface: SurfaceAdapter,
): SurfaceClientTransport {
  return {
    descriptor() {
      return surface.descriptor();
    },
    async dispatchSurfaceCommand(request) {
      return await surface.dispatchSurfaceCommand(request);
    },
    readSurfaceEvents(request) {
      return surface.readSurfaceEvents(request);
    },
    subscribeSurfaceEvents(listener) {
      return surface.subscribeSurfaceEvents(listener);
    },
  };
}

export async function dispatchTyped<T>(request: {
  readonly transport: SurfaceClientTransport;
  readonly events: SurfaceClientEventFactory;
  readonly command: SurfaceCommand;
  readonly input?: unknown;
  readonly options: SurfaceClientRequestOptions | undefined;
}): Promise<SurfaceClientCommandEnvelope<T>> {
  const commandRequest = createCommandRequest(request);
  try {
    const response =
      await request.transport.dispatchSurfaceCommand(commandRequest);
    if (!isSurfaceEnvelope(response, request.command)) {
      return rejectedClientEnvelope({
        events: request.events,
        command: request.command,
        requestId: request.options?.requestId,
        error: invalidTransportResponseError(),
      });
    }
    return response.ok
      ? {
          ok: true,
          command: request.command,
          value: response.value as T,
          event: response.event,
        }
      : {
          ok: false,
          command: request.command,
          error: response.error,
          event: response.event,
        };
  } catch (error) {
    return rejectedClientEnvelope({
      events: request.events,
      command: request.command,
      requestId: request.options?.requestId,
      error: normalizeSurfaceClientTransportFailure(
        error,
        "surface command transport failed",
      ),
    });
  }
}

export function invalidDescriptorResult(): SurfaceClientDescriptorResult {
  return {
    ok: false,
    error: invalidTransportResponseError(),
  };
}

function createCommandRequest(request: {
  readonly command: SurfaceCommand;
  readonly input?: unknown;
  readonly options: SurfaceClientRequestOptions | undefined;
}): SurfaceClientCommandRequest {
  return {
    command: request.command,
    ...(request.input === undefined ? {} : { input: request.input }),
    ...(request.options?.requestId === undefined
      ? {}
      : { requestId: request.options.requestId }),
  };
}

function rejectedClientEnvelope<T>(request: {
  readonly events: SurfaceClientEventFactory;
  readonly command: SurfaceCommand;
  readonly requestId: string | undefined;
  readonly error: SurfaceError;
}): SurfaceClientCommandEnvelope<T> {
  return {
    ok: false,
    command: request.command,
    error: request.error,
    event: request.events.rejected(request),
  };
}
