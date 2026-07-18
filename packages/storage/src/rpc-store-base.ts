import type { JsonValue } from "@wanex/protocol"

import { parseResponseEnvelope } from "./envelope.js"
import type {
  StorageRpcCommand,
  StorageRpcErrorEnvelope,
  StorageRpcSuccessEnvelope
} from "./generated/storage-rpc.js"
import type { StorageTransport } from "./transport.js"

const DEFAULT_TRANSIENT_SQLITE_MAX_ATTEMPTS = 4
const DEFAULT_TRANSIENT_SQLITE_INITIAL_DELAY_MS = 10

export abstract class RpcStoreFacetBase {
  private readonly transport: StorageTransport

  constructor(options: {
    readonly transport: StorageTransport
  }) {
    this.transport = options.transport
  }

  protected async call(request: StorageRpcCommand): Promise<JsonValue> {
    let attempt = 0
    while (true) {
      const response = await this.transport.call(request)
      if (!isTransientSqliteResponse(response)) {
        return parseResponseEnvelope(response)
      }
      attempt += 1
      if (attempt >= DEFAULT_TRANSIENT_SQLITE_MAX_ATTEMPTS) {
        return parseResponseEnvelope(response)
      }
      await sleep(backoffMs(attempt))
    }
  }
}

function isTransientSqliteResponse(
  response: StorageRpcSuccessEnvelope | StorageRpcErrorEnvelope
): boolean {
  if (!isJsonRecord(response) || response.ok !== false) {
    return false
  }
  const error = response.error
  if (!isJsonRecord(error)) {
    return false
  }
  if (error.code !== "sqlite" || typeof error.message !== "string") {
    return false
  }
  const message = error.message.toLowerCase()
  return message.includes("database is locked") || message.includes("database is busy")
}

function isJsonRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function backoffMs(attempt: number): number {
  return DEFAULT_TRANSIENT_SQLITE_INITIAL_DELAY_MS * 2 ** (attempt - 1)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
