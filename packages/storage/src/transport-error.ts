import { StorageTransportError } from "./errors.js"

export function storageTransportError(
  code: string,
  message: string,
  cause: unknown
): StorageTransportError {
  const detail = cause instanceof Error ? `: ${cause.message}` : ""
  return new StorageTransportError(`${message}${detail}`, { code })
}
