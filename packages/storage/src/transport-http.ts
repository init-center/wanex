import type { StorageRpcRequestEnvelope } from "./generated/storage-rpc.js"
import { StorageTransportError } from "./errors.js"
import type {
  HttpStorageWireTransportOptions,
  StorageWireTransport
} from "./transport-types.js"

export class HttpStorageWireTransport implements StorageWireTransport {
  readonly endpoint: string
  private readonly token: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: HttpStorageWireTransportOptions) {
    this.endpoint = options.endpoint
    this.token = options.token
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async exchange(request: StorageRpcRequestEnvelope): Promise<unknown> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          request
        })
      })

      if (!response.ok) {
        throw new StorageTransportError(
          `remote storage request failed with HTTP ${response.status}`,
          { code: "remote_http_status" }
        )
      }

      try {
        const value: unknown = await response.json()
        return value
      } catch {
        throw new StorageTransportError(
          "remote storage returned invalid JSON",
          { code: "remote_http_invalid_json" }
        )
      }
    } catch (error) {
      if (error instanceof StorageTransportError) {
        throw error
      }
      if (controller.signal.aborted) {
        throw new StorageTransportError("remote storage request timed out", {
          code: "remote_http_timeout"
        })
      }
      throw new StorageTransportError("remote storage network request failed", {
        code: "remote_http_network"
      })
    } finally {
      clearTimeout(timeout)
    }
  }
}
