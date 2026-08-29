import type { SurfaceError } from "../model.js";

export function invalidTransportResponseError(): SurfaceError {
  return {
    code: "invalid_transport_response",
    category: "runtime",
    message: "surface transport returned an invalid response",
  };
}

export class SurfaceClientTransportError extends Error {
  readonly surfaceError: SurfaceError;

  constructor(surfaceError: SurfaceError) {
    super(surfaceError.message);
    this.name = "SurfaceClientTransportError";
    this.surfaceError = surfaceError;
  }
}

export function surfaceClientTransportError(
  surfaceError: SurfaceError,
): SurfaceClientTransportError {
  return new SurfaceClientTransportError(surfaceError);
}

export function normalizeSurfaceClientTransportFailure(
  error: unknown,
  fallbackMessage: string,
): SurfaceError {
  if (error instanceof SurfaceClientTransportError) {
    return error.surfaceError;
  }
  return transportFailureError(fallbackMessage);
}

export function transportFailureError(message: string): SurfaceError {
  return { code: "command_error", category: "runtime", message };
}
