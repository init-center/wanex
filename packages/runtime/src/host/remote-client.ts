import {
  isAgentHostServerMessage,
  type AgentHostClientMessage,
  type AgentHostClientTransport
} from "@wanex/protocol"
import {
  normalizeRemoteHostRequestLimits,
  type RemoteHostRequestLimits
} from "./remote-policy.js"
import {
  isRemoteHostOpaqueToken,
  REMOTE_AGENT_HOST_MESSAGE_PATH,
  REMOTE_AGENT_HOST_SESSION_HEADER
} from "./remote-http.js"
import {
  createRemoteAgentHostHttpEventClient,
  type RemoteAgentHostHttpClientEventStream,
  type RemoteAgentHostHttpClientEventStreamOptions,
  type RemoteAgentHostHttpClientEventStreamState
} from "./remote-event-client.js"

const MAX_BEARER_TOKEN_BYTES = 8 * 1024

export type {
  RemoteAgentHostHttpClientEventStream,
  RemoteAgentHostHttpClientEventStreamOptions,
  RemoteAgentHostHttpClientEventStreamState
} from "./remote-event-client.js"

export interface RemoteAgentHostHttpClientOptions {
  readonly messageUrl: string | URL
  readonly getBearerToken: () => string | Promise<string>
  readonly fetch?: typeof globalThis.fetch
  readonly limits?: Partial<
    Pick<
      RemoteHostRequestLimits,
      "maxBodyBytes" | "maxResponseBytes" | "requestTimeoutMs"
    >
  >
  readonly now?: () => number
}

export interface RemoteAgentHostHttpClientTransport
  extends AgentHostClientTransport {
  connectEvents(
    options?: RemoteAgentHostHttpClientEventStreamOptions
  ): RemoteAgentHostHttpClientEventStream
  close(): Promise<void>
}

export function createRemoteAgentHostHttpClientTransport(
  options: RemoteAgentHostHttpClientOptions
): RemoteAgentHostHttpClientTransport {
  const messageUrl = normalizeMessageUrl(options.messageUrl)
  const limits = normalizeRemoteHostRequestLimits(options.limits)
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== "function") {
    throw new Error("remote Agent Host HTTP client requires fetch")
  }
  const now = options.now ?? Date.now
  const listeners = new Set<(event: unknown) => void>()
  const pending = new Set<AbortController>()
  const pendingKeys = new Set<string>()
  let sessionId: string | undefined
  let closed = false
  let handshakePending = false

  const eventClient = createRemoteAgentHostHttpEventClient({
    messageUrl,
    fetch: fetchImpl,
    getBearerToken: async () => await readBearerToken(),
    getSessionId: () => sessionId,
    isClosed: () => closed,
    listeners,
    requestTimeoutMs: limits.requestTimeoutMs,
    maxFrameBytes: limits.maxResponseBytes,
    onAuthenticationFailure: () => {
      sessionId = undefined
    }
  })

  const transport: RemoteAgentHostHttpClientTransport = {
    async send(request) {
      if (closed) throw new Error("remote Agent Host HTTP client is closed")
      const key = requestKey(request)
      if (request.kind === "wanex.agent-host.handshake.request") {
        if (handshakePending || sessionId !== undefined) {
          throw new Error("remote Agent Host handshake is already established")
        }
      } else if (sessionId === undefined) {
        throw new Error("remote Agent Host handshake is required")
      }
      if (pendingKeys.has(key)) {
        throw new Error("remote Agent Host HTTP request is already pending")
      }

      pendingKeys.add(key)
      if (request.kind === "wanex.agent-host.handshake.request") {
        handshakePending = true
      }
      let controller: AbortController | undefined
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const bearer = await readBearerToken()
        const body = serializeRequest(request)
        if (Buffer.byteLength(body, "utf8") > limits.maxBodyBytes) {
          throw new Error("remote Agent Host request body exceeds its limit")
        }
        if (closed) throw new Error("remote Agent Host HTTP client is closed")

        controller = new AbortController()
        const timeoutMs = requestTimeoutMs(request, limits.requestTimeoutMs, now)
        timer = setTimeout(() => controller?.abort(), timeoutMs)
        timer.unref?.()
        pending.add(controller)
        const headers: Record<string, string> = {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json"
        }
        if (sessionId !== undefined) {
          headers[REMOTE_AGENT_HOST_SESSION_HEADER] = sessionId
        }
        const response = await fetchImpl(messageUrl, {
          method: "POST",
          headers,
          body,
          signal: controller.signal
        })
        const value = await readJsonResponse(response, limits.maxResponseBytes)
        if (closed) throw new Error("remote Agent Host HTTP client is closed")
        if (
          !response.ok &&
          !(isAgentHostServerMessage(value) && value.kind === "wanex.agent-host.error")
        ) {
          throw new Error("remote Agent Host HTTP response status is invalid")
        }
        if (request.kind === "wanex.agent-host.handshake.request") {
          if (
            isAgentHostServerMessage(value) &&
            value.kind === "wanex.agent-host.handshake.response"
          ) {
            const nextSessionId = response.headers.get(
              REMOTE_AGENT_HOST_SESSION_HEADER
            )
            if (
              nextSessionId === null ||
              !isRemoteHostOpaqueToken(nextSessionId)
            ) {
              throw new Error(
                "remote Agent Host handshake session header is invalid"
              )
            }
            sessionId = nextSessionId
          }
        } else if (
          isAgentHostServerMessage(value) &&
          value.kind === "wanex.agent-host.error" &&
          value.error.code === "unauthenticated"
        ) {
          await invalidateSession()
        }
        return value
      } catch (error) {
        if (closed) {
          throw new Error("remote Agent Host HTTP client is closed")
        }
        if (controller?.signal.aborted) {
          throw new Error("remote Agent Host HTTP request timed out")
        }
        throw toError(error)
      } finally {
        if (timer !== undefined) clearTimeout(timer)
        if (controller !== undefined) pending.delete(controller)
        pendingKeys.delete(key)
        if (request.kind === "wanex.agent-host.handshake.request") {
          handshakePending = false
        }
      }
    },
    connectEvents: eventClient.connectEvents,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async close() {
      if (closed) return
      closed = true
      for (const controller of pending) controller.abort()
      pending.clear()
      pendingKeys.clear()
      handshakePending = false
      sessionId = undefined
      listeners.clear()
      await eventClient.close()
    }
  }

  return Object.freeze(transport)

  async function invalidateSession(): Promise<void> {
    sessionId = undefined
    await eventClient.close()
  }

  async function readBearerToken(): Promise<string> {
    let value: string | Promise<string>
    try {
      value = options.getBearerToken()
    } catch {
      throw new Error("remote Agent Host bearer token is unavailable")
    }
    let token: string
    try {
      token = await value
    } catch {
      throw new Error("remote Agent Host bearer token is unavailable")
    }
    if (
      typeof token !== "string" ||
      token.length === 0 ||
      Buffer.byteLength(token, "utf8") > MAX_BEARER_TOKEN_BYTES ||
      /[\u0000-\u001f\u007f]/.test(token)
    ) {
      throw new Error("remote Agent Host bearer token is invalid")
    }
    return token
  }
}

function normalizeMessageUrl(value: string | URL): string {
  let url: URL
  try {
    url = new URL(value.toString())
  } catch {
    throw new Error("remote Agent Host message URL is invalid")
  }
  if (
    url.protocol !== "https:" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    url.pathname !== REMOTE_AGENT_HOST_MESSAGE_PATH
  ) {
    throw new Error(
      "remote Agent Host message URL must be an HTTPS message endpoint without credentials or query"
    )
  }
  return url.toString()
}

function requestKey(request: AgentHostClientMessage): string {
  return request.kind === "wanex.agent-host.handshake.request"
    ? "__handshake__"
    : request.requestId
}

function serializeRequest(request: AgentHostClientMessage): string {
  try {
    const body = JSON.stringify(request)
    if (body === undefined) throw new Error("request is not JSON serializable")
    return body
  } catch {
    throw new Error("remote Agent Host request is not JSON serializable")
  }
}

function requestTimeoutMs(
  request: AgentHostClientMessage,
  defaultTimeoutMs: number,
  now: () => number
): number {
  if (
    request.kind === "wanex.agent-host.handshake.request" ||
    request.kind === "wanex.agent-host.events.replay.request"
  ) {
    return defaultTimeoutMs
  }
  const deadlineAt = request.deadlineAt
  if (deadlineAt === undefined) return defaultTimeoutMs
  const remaining = deadlineAt - now()
  if (!Number.isSafeInteger(remaining) || remaining <= 0) {
    throw new Error("remote Agent Host request deadline has expired")
  }
  return Math.min(defaultTimeoutMs, remaining)
}

async function readJsonResponse(
  response: Response,
  maxResponseBytes: number
): Promise<unknown> {
  const contentLength = response.headers.get("content-length")
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      throw new Error("remote Agent Host response length is invalid")
    }
    const declaredLength = Number(contentLength)
    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength > maxResponseBytes
    ) {
      throw new Error("remote Agent Host response exceeds its limit")
    }
  }

  if (response.body === null) {
    const text = await response.text()
    if (Buffer.byteLength(text, "utf8") > maxResponseBytes) {
      throw new Error("remote Agent Host response exceeds its limit")
    }
    return parseJson(text)
  }

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      const chunk = Buffer.from(next.value)
      total += chunk.byteLength
      if (total > maxResponseBytes) {
        await reader.cancel()
        throw new Error("remote Agent Host response exceeds its limit")
      }
      chunks.push(chunk)
    }
  } finally {
    reader.releaseLock()
  }
  return parseJson(Buffer.concat(chunks).toString("utf8"))
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error("remote Agent Host response is not valid JSON")
  }
}

function toError(value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error("remote Agent Host HTTP request failed")
}
