import type { RuntimeAbortSignal } from "@wanex/protocol"
import type { ProviderStreamBody } from "./sse.js"
import type { ProviderErrorEvent } from "./types.js"

export interface ProviderFetch {
  (
    input: string,
    init: {
      readonly method: "POST"
      readonly headers: Readonly<Record<string, string>>
      readonly body: string
      readonly signal?: RuntimeAbortSignal
    }
  ): Promise<ProviderFetchResponse>
}

export interface ProviderFetchResponse {
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  readonly body: ProviderStreamBody | null
  readonly headers?: { get(name: string): string | null }
  text(): Promise<string>
}

export function globalProviderFetch(
  input: string,
  init: Parameters<ProviderFetch>[1]
): Promise<ProviderFetchResponse> {
  const fetchImpl = (globalThis as unknown as { readonly fetch?: ProviderFetch }).fetch
  if (fetchImpl === undefined) {
    throw new Error("global fetch is not available")
  }
  return fetchImpl(input, init)
}

export async function httpProviderError(options: {
  readonly response: ProviderFetchResponse
  readonly providerId: string
  readonly modelId: string
}): Promise<ProviderErrorEvent> {
  const status = options.response.status
  const retryAfter = options.response.headers?.get("retry-after")
  const retryAfterMs = parseRetryAfter(retryAfter)
  return {
    type: "error",
    error: {
      category:
        status === 401
          ? "authentication"
          : status === 403
            ? "authorization"
            : status === 404
              ? "not_found"
              : status === 409
                ? "conflict"
                : status === 429
                  ? "rate_limit"
                  : status >= 500
                    ? "server"
                    : "invalid_request",
      message: `provider request failed: ${status} ${options.response.statusText} ${await options.response.text()}`.trim(),
      retryable: status === 408 || status === 409 || status === 429 || status >= 500,
      providerId: options.providerId,
      modelId: options.modelId,
      phase: "request",
      statusCode: status,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs })
    }
  }
}

function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || value.length === 0) {
    return undefined
  }
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000)
  }
  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now())
}
