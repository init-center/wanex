import type { JsonValue } from "@wanex/protocol"
import { SystemServiceClientError } from "./errors.js"
import type {
  StorageRpcErrorEnvelope,
  StorageRpcSuccessEnvelope
} from "./generated/storage-rpc.js"

export function parseResponseEnvelope(
  response: StorageRpcSuccessEnvelope | StorageRpcErrorEnvelope
): JsonValue {
  if (!response.ok) {
    throw new SystemServiceClientError(response.error.message, {
      code: response.error.code
    })
  }
  return response.value as JsonValue
}
