import { randomUUID } from "node:crypto"
import {
  STORAGE_RPC_SCHEMA_SHA256,
  type StorageRpcCommand,
  type StorageRpcDescriptor,
  type StorageRpcErrorEnvelope,
  type StorageRpcRequestEnvelope,
  type StorageRpcSuccessEnvelope
} from "./generated/storage-rpc.js"
import { StorageTransportError } from "./errors.js"
import type {
  StorageProtocolTransportOptions,
  StorageTransport,
  StorageWireTransport
} from "./transport-types.js"

const STORAGE_RPC_VERSION = 1 as const

export class ProtocolStorageTransport implements StorageTransport {
  private readonly createRequestId: () => string
  private readonly negotiation: StorageProtocolTransportOptions["negotiation"]
  private negotiationPromise: Promise<void> | undefined
  private negotiatedEpoch: number | undefined
  private negotiated = false
  private closed = false

  constructor(
    private readonly wire: StorageWireTransport,
    options: StorageProtocolTransportOptions
  ) {
    this.negotiation = options.negotiation
    this.createRequestId = options.createRequestId ?? randomUUID
  }

  async call(
    command: StorageRpcCommand
  ): Promise<StorageRpcSuccessEnvelope | StorageRpcErrorEnvelope> {
    if (this.closed) {
      throw protocolTransportError("storage_rpc_transport_closed")
    }
    if (this.negotiation !== "oneshot") {
      await this.ensureNegotiated()
    }
    this.assertOpen()
    try {
      return await this.exchange(command)
    } catch (error) {
      this.invalidateNegotiation()
      throw error
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    this.invalidateNegotiation()
    await this.wire.close?.()
  }

  private async ensureNegotiated(): Promise<void> {
    const epoch = this.wire.connectionEpoch?.()
    if (
      this.negotiated &&
      (this.negotiation !== "persistent" ||
        (epoch !== null && epoch === this.negotiatedEpoch))
    ) {
      return
    }
    if (this.negotiationPromise !== undefined) {
      return await this.negotiationPromise
    }
    this.negotiationPromise = (async () => {
      const response = await this.exchange({ command: "rpc-describe" })
      if (!response.ok) {
        throw protocolTransportError("storage_rpc_negotiation_failed")
      }
      validateDescriptor(response.value)
      this.assertOpen()
      this.negotiated = true
      this.negotiatedEpoch = this.wire.connectionEpoch?.() ?? undefined
    })()
    try {
      await this.negotiationPromise
    } finally {
      this.negotiationPromise = undefined
    }
  }

  private async exchange(
    command: StorageRpcCommand
  ): Promise<StorageRpcSuccessEnvelope | StorageRpcErrorEnvelope> {
    const requestId = this.createRequestId()
    if (requestId.length === 0) {
      throw protocolTransportError("storage_rpc_invalid_request_id")
    }
    const request: StorageRpcRequestEnvelope = {
      storage_rpc_version: STORAGE_RPC_VERSION,
      request_id: requestId,
      request: command
    }
    const response = await this.wire.exchange(request)
    return parseStorageRpcResponse(response, requestId)
  }

  private invalidateNegotiation(): void {
    this.negotiated = false
    this.negotiatedEpoch = undefined
    this.negotiationPromise = undefined
  }

  private assertOpen(): void {
    if (this.closed) {
      throw protocolTransportError("storage_rpc_transport_closed")
    }
  }
}

function parseStorageRpcResponse(
  value: unknown,
  requestId: string
): StorageRpcSuccessEnvelope | StorageRpcErrorEnvelope {
  if (!isRecord(value)) {
    throw protocolTransportError("storage_rpc_invalid_response")
  }
  if (value.storage_rpc_version !== STORAGE_RPC_VERSION) {
    throw protocolTransportError("storage_rpc_response_version_mismatch")
  }
  if (value.request_id !== requestId) {
    throw protocolTransportError("storage_rpc_request_id_mismatch")
  }
  if (value.ok === true) {
    if (!hasExactKeys(value, ["storage_rpc_version", "request_id", "ok", "value"])) {
      throw protocolTransportError("storage_rpc_invalid_response")
    }
    return value as unknown as StorageRpcSuccessEnvelope
  }
  if (value.ok === false) {
    if (
      !hasExactKeys(value, ["storage_rpc_version", "request_id", "ok", "error"]) ||
      !isRecord(value.error) ||
      !hasExactKeys(value.error, ["code", "message"]) ||
      typeof value.error.code !== "string" ||
      typeof value.error.message !== "string"
    ) {
      throw protocolTransportError("storage_rpc_invalid_response")
    }
    return value as unknown as StorageRpcErrorEnvelope
  }
  throw protocolTransportError("storage_rpc_invalid_response")
}

function validateDescriptor(value: unknown): asserts value is StorageRpcDescriptor {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "selected_version",
      "supported_versions",
      "service_version",
      "schema_sha256",
      "capabilities"
    ]) ||
    value.selected_version !== STORAGE_RPC_VERSION ||
    !Array.isArray(value.supported_versions) ||
    !value.supported_versions.includes(STORAGE_RPC_VERSION) ||
    typeof value.service_version !== "string" ||
    value.service_version.length === 0 ||
    value.schema_sha256 !== STORAGE_RPC_SCHEMA_SHA256 ||
    !Array.isArray(value.capabilities) ||
    !value.capabilities.every((item) => typeof item === "string")
  ) {
    throw protocolTransportError("storage_rpc_incompatible_descriptor")
  }
}

function protocolTransportError(code: string): StorageTransportError {
  return new StorageTransportError(`storage RPC protocol failure: ${code}`, {
    code
  })
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[]
): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === expected.length &&
    [...expected].sort().every((key, index) => actual[index] === key)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
