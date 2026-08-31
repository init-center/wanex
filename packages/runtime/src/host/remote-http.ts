import { randomUUID } from "node:crypto"
import type {
  AgentHostClientMessage,
  AgentHostDescriptor,
  AgentHostErrorCode,
  AgentHostServerMessage
} from "@wanex/protocol"
import {
  isAgentHostClientMessage,
  isAgentHostServerMessage
} from "@wanex/protocol"
import type { InProcessAgentHostEndpoint } from "./agent-host.js"
import {
  authorizeRemoteHostDomain,
  authorizeRemoteHostRequest,
  normalizeRemoteHostRequestLimits,
  type RemoteHostAuthorizationContext,
  type RemoteHostAuthenticatedSubject,
  type RemoteHostGrant,
  type RemoteHostRequestLimits
} from "./remote-policy.js"
import {
  createRemoteAgentHostEventStream,
  parseRemoteAgentHostEventStreamCursor,
  REMOTE_AGENT_HOST_SSE_EVENT_PATH,
  type RemoteAgentHostEventStream,
} from "./remote-event-stream.js"

export const REMOTE_AGENT_HOST_MESSAGE_PATH =
  "/v1/agent-host/message" as const
export const REMOTE_AGENT_HOST_SESSION_HEADER =
  "x-wanex-host-session" as const

const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json",
  vary: "authorization"
} as const

const EVENT_STREAM_HEADERS = {
  "cache-control": "no-store",
  vary: "authorization"
} as const

export interface RemoteAgentHostHttpRequest {
  readonly method: string
  readonly path: string
  readonly headers: Readonly<Record<string, string | undefined>>
  readonly body: unknown
  readonly bodyBytes?: number
  readonly nowMs?: number
}

export interface RemoteAgentHostHttpResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: AgentHostServerMessage
}

export interface RemoteAgentHostEventStreamRequest {
  readonly method: string
  readonly path: string
  readonly headers: Readonly<Record<string, string | undefined>>
  readonly nowMs?: number
}

export interface RemoteAgentHostEventStreamResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly stream?: RemoteAgentHostEventStream
  readonly body?: AgentHostServerMessage
}

export interface RemoteAgentHostResolvedHost {
  readonly host: AgentHostDescriptor
  readonly grant: RemoteHostGrant
  readonly createEndpoint: (
    accessToken: string
  ) => InProcessAgentHostEndpoint | Promise<InProcessAgentHostEndpoint>
}

export interface RemoteAgentHostHandlerOptions {
  readonly authenticateBearerToken: (
    token: string
  ) => Promise<RemoteHostAuthenticatedSubject | null>
  readonly resolveHost: (
    subject: RemoteHostAuthenticatedSubject
  ) => RemoteAgentHostResolvedHost | Promise<RemoteAgentHostResolvedHost | null> | null
  readonly createSessionId?: () => string
  readonly createEndpointAccessToken?: () => string
  readonly limits?: Partial<RemoteHostRequestLimits>
  readonly now?: () => number
}

export interface RemoteAgentHostHttpHandler {
  handle(request: RemoteAgentHostHttpRequest): Promise<RemoteAgentHostHttpResponse>
  openEventStream(
    request: RemoteAgentHostEventStreamRequest
  ): Promise<RemoteAgentHostEventStreamResponse>
  close(): Promise<void>
}

interface RemoteHostSession {
  readonly id: string
  readonly endpoint: InProcessAgentHostEndpoint
  readonly subjectId: string
  readonly grant: RemoteHostGrant
  readonly host: AgentHostDescriptor
  readonly clientId: string
  readonly requestedDomains: RemoteHostAuthorizationContext["grantedDomains"]
  readonly expiresAt: number
  readonly eventStreams: Set<RemoteAgentHostEventStream>
  readonly eventStreamExpiryTimers: Map<
    RemoteAgentHostEventStream,
    ReturnType<typeof setTimeout>
  >
  inFlight: number
  closed: boolean
}

export function createRemoteAgentHostHttpHandler(
  options: RemoteAgentHostHandlerOptions
): RemoteAgentHostHttpHandler {
  const limits = normalizeRemoteHostRequestLimits(options.limits)
  const createSessionId = options.createSessionId ?? randomUUID
  const createEndpointAccessToken = options.createEndpointAccessToken ?? randomUUID
  const now = options.now ?? Date.now
  const sessions = new Map<string, RemoteHostSession>()
  let pendingSessions = 0
  let closed = false

  return Object.freeze({ handle, openEventStream, close })

  async function openEventStream(
    request: RemoteAgentHostEventStreamRequest
  ): Promise<RemoteAgentHostEventStreamResponse> {
    if (closed) {
      return eventStreamErrorResponse(
        503,
        "transport_failure",
        "Remote Agent Host is closed"
      )
    }
    if (request.method.toUpperCase() !== "GET") {
      return eventStreamErrorResponse(
        405,
        "malformed_request",
        "remote Agent Host event stream requires GET"
      )
    }
    if (request.path !== REMOTE_AGENT_HOST_SSE_EVENT_PATH) {
      return eventStreamErrorResponse(
        404,
        "not_found",
        "remote Agent Host event stream path was not found"
      )
    }

    const sessionId = getHeader(
      request.headers,
      REMOTE_AGENT_HOST_SESSION_HEADER
    )
    const token = parseBearerToken(request.headers)
    if (token === undefined) {
      await closeSessionForHeader(sessionId)
      return eventStreamErrorResponse(
        401,
        "unauthenticated",
        "missing bearer token"
      )
    }
    let subject: RemoteHostAuthenticatedSubject | null
    try {
      subject = await options.authenticateBearerToken(token)
    } catch {
      await closeSessionForHeader(sessionId)
      return eventStreamErrorResponse(
        503,
        "application_failure",
        "remote authentication is unavailable"
      )
    }
    if (subject === null) {
      await closeSessionForHeader(sessionId)
      return eventStreamErrorResponse(
        401,
        "unauthenticated",
        "invalid bearer token"
      )
    }

    const cursorValue = getHeader(request.headers, "last-event-id")
    const cursor = parseRemoteAgentHostEventStreamCursor(cursorValue)
    if (!cursor.ok) {
      return eventStreamErrorResponse(400, "malformed_request", cursor.message)
    }
    if (sessionId === undefined || !isRemoteHostOpaqueToken(sessionId)) {
      return eventStreamErrorResponse(
        401,
        "unauthenticated",
        "Agent Host session is required"
      )
    }
    const session = sessions.get(sessionId)
    if (session === undefined || session.closed) {
      return eventStreamErrorResponse(
        401,
        "unauthenticated",
        "Agent Host session is invalid"
      )
    }

    const currentNow = request.nowMs ?? now()
    if (subject.subjectId !== session.subjectId) {
      await closeSession(session)
      return eventStreamErrorResponse(
        401,
        "unauthenticated",
        "Agent Host session identity is invalid"
      )
    }
    const access = authorizeRemoteHostRequest({
      subject,
      grant: session.grant,
      host: session.host,
      clientId: session.clientId,
      requestedDomains: session.requestedDomains,
      nowMs: currentNow
    })
    if (access.outcome === "denied") {
      await closeSession(session)
      return eventStreamErrorResponse(
        statusForError(access.code),
        access.code,
        messageForError(access.code)
      )
    }
    if (currentNow >= session.expiresAt) {
      const code =
        session.grant.expiresAt <= currentNow
          ? "unauthorized"
          : "unauthenticated"
      await closeSession(session)
      return eventStreamErrorResponse(
        statusForError(code),
        code,
        messageForError(code)
      )
    }
    if (session.eventStreams.size >= limits.maxEventSubscribers) {
      return eventStreamErrorResponse(
        429,
        "resource_limit",
        "remote Agent Host event stream capacity reached"
      )
    }

    let stream: RemoteAgentHostEventStream | undefined
    let closedBeforeRegistration = false
    try {
      stream = createRemoteAgentHostEventStream({
        ...(cursor.cursor === undefined ? {} : { cursor: cursor.cursor }),
        subscribe: session.endpoint.subscribe,
        replay: async (replayRequest) => {
          const response = await session.endpoint.send(replayRequest)
          if (
            !isAgentHostServerMessage(response) ||
            response.kind !== "wanex.agent-host.events.replay.response"
          ) {
            throw new Error("Agent Host event replay response is invalid")
          }
          return response
        },
        onClose() {
          if (stream === undefined) {
            closedBeforeRegistration = true
            return
          }
          session.eventStreams.delete(stream)
          const timer = session.eventStreamExpiryTimers.get(stream)
          if (timer !== undefined) clearTimeout(timer)
          session.eventStreamExpiryTimers.delete(stream)
        }
      })
    } catch {
      return eventStreamErrorResponse(
        502,
        "transport_failure",
        "Agent Host event stream failed to initialize"
      )
    }
    if (closedBeforeRegistration || session.closed || closed) {
      stream.close()
      return eventStreamErrorResponse(
        503,
        "transport_failure",
        "Remote Agent Host session is closed"
      )
    }
    session.eventStreams.add(stream)
    const expiryDelay = session.expiresAt - currentNow
    const expiryTimer = setTimeout(() => {
      session.eventStreamExpiryTimers.delete(stream!)
      stream?.close()
    }, expiryDelay)
    expiryTimer.unref?.()
    session.eventStreamExpiryTimers.set(stream, expiryTimer)
    return {
      status: 200,
      headers: EVENT_STREAM_HEADERS,
      stream
    }
  }

  async function handle(
    request: RemoteAgentHostHttpRequest
  ): Promise<RemoteAgentHostHttpResponse> {
    if (closed) {
      return errorResponse(503, "transport_failure", "Remote Agent Host is closed")
    }
    if (request.method.toUpperCase() !== "POST") {
      return errorResponse(
        405,
        "malformed_request",
        "remote Agent Host requires POST"
      )
    }
    if (request.path !== REMOTE_AGENT_HOST_MESSAGE_PATH) {
      return errorResponse(404, "not_found", "remote Agent Host path was not found")
    }

    const bodySize = resolveBodySize(request)
    if (bodySize === undefined || bodySize > limits.maxBodyBytes) {
      return errorResponse(
        413,
        "resource_limit",
        "remote Agent Host request body exceeds its limit"
      )
    }

    const sessionId = getHeader(
      request.headers,
      REMOTE_AGENT_HOST_SESSION_HEADER
    )

    const token = parseBearerToken(request.headers)
    if (token === undefined) {
      await closeSessionForHeader(sessionId)
      return errorResponse(401, "unauthenticated", "missing bearer token")
    }
    let subject: RemoteHostAuthenticatedSubject | null
    try {
      subject = await options.authenticateBearerToken(token)
    } catch {
      await closeSessionForHeader(sessionId)
      return errorResponse(503, "application_failure", "remote authentication is unavailable")
    }
    if (subject === null) {
      await closeSessionForHeader(sessionId)
      return errorResponse(401, "unauthenticated", "invalid bearer token")
    }

    const message = parseClientMessage(request.body)
    if (message === undefined) {
      return errorResponse(400, "malformed_request", "remote Agent Host message is invalid")
    }

    if (message.kind === "wanex.agent-host.handshake.request") {
      if (sessionId !== undefined) {
        return errorResponse(
          409,
          "idempotency_conflict",
          "Agent Host handshake cannot use an existing session"
        )
      }
      return await admitSession(message, subject, request.nowMs ?? now())
    }

    if (sessionId === undefined) {
      return errorResponse(
        401,
        "unauthenticated",
        "Agent Host session is required",
        requestId(message)
      )
    }
    if (!isRemoteHostOpaqueToken(sessionId)) {
      return errorResponse(
        401,
        "unauthenticated",
        "Agent Host session is invalid",
        requestId(message)
      )
    }
    const session = sessions.get(sessionId)
    if (session === undefined || session.closed) {
      return errorResponse(
        401,
        "unauthenticated",
        "Agent Host session is invalid",
        requestId(message)
      )
    }

    const currentNow = request.nowMs ?? now()
    if (subject.subjectId !== session.subjectId) {
      await closeSession(session)
      return errorResponse(
        401,
        "unauthenticated",
        "Agent Host session identity is invalid",
        requestId(message)
      )
    }
    const access = authorizeRemoteHostRequest({
      subject,
      grant: session.grant,
      host: session.host,
      clientId: session.clientId,
      requestedDomains: session.requestedDomains,
      nowMs: currentNow
    })
    if (access.outcome === "denied") {
      await closeSession(session)
      return errorResponse(
        statusForError(access.code),
        access.code,
        messageForError(access.code),
        requestId(message)
      )
    }
    if (currentNow >= session.expiresAt) {
      const code =
        session.grant.expiresAt <= currentNow
          ? "unauthorized"
          : "unauthenticated"
      await closeSession(session)
      return errorResponse(
        statusForError(code),
        code,
        messageForError(code),
        requestId(message)
      )
    }
    if (message.kind === "wanex.agent-host.operation.request") {
      const domainAccess = authorizeRemoteHostDomain(
        access.context,
        message.domain,
        currentNow
      )
      if (domainAccess.outcome === "denied") {
        return errorResponse(
          statusForError(domainAccess.code),
          domainAccess.code,
          messageForError(domainAccess.code),
          message.requestId
        )
      }
    }
    if (session.inFlight >= limits.maxInFlightRequests) {
      return errorResponse(
        429,
        "resource_limit",
        "remote Agent Host request concurrency limit reached",
        requestId(message)
      )
    }

    session.inFlight += 1
    try {
      const response = await session.endpoint.send(message)
      if (!isAgentHostServerMessage(response)) {
        await closeSession(session)
        return errorResponse(
          500,
          "application_failure",
          "Agent Host returned an invalid response",
          requestId(message)
        )
      }
      if (jsonSize(response) > limits.maxResponseBytes) {
        await closeSession(session)
        return errorResponse(
          500,
          "resource_limit",
          "remote Agent Host response exceeds its limit",
          requestId(message)
        )
      }
      return responseResponse(response)
    } catch {
      await closeSession(session)
      return errorResponse(
        502,
        "transport_failure",
        "remote Agent Host endpoint failed",
        requestId(message)
      )
    } finally {
      session.inFlight -= 1
    }
  }

  async function admitSession(
    request: Extract<AgentHostClientMessage, { kind: "wanex.agent-host.handshake.request" }>,
    subject: RemoteHostAuthenticatedSubject,
    nowMs: number
  ): Promise<RemoteAgentHostHttpResponse> {
    await pruneExpiredSessions(nowMs)
    if (sessions.size + pendingSessions >= limits.maxSessions) {
      return errorResponse(
        429,
        "resource_limit",
        "remote Agent Host session capacity reached"
      )
    }
    pendingSessions += 1
    let endpoint: InProcessAgentHostEndpoint | undefined
    try {
      let resolved: RemoteAgentHostResolvedHost | null
      try {
        resolved = await options.resolveHost(subject)
      } catch {
        resolved = null
      }
      if (resolved === null) {
        return errorResponse(403, "unauthorized", "Agent Host is not available")
      }

      const access = authorizeRemoteHostRequest({
        subject,
        grant: resolved.grant,
        host: resolved.host,
        clientId: request.clientId,
        requestedDomains: request.requestedDomains,
        nowMs
      })
      if (access.outcome === "denied") {
        return errorResponse(
          statusForError(access.code),
          access.code,
          messageForError(access.code)
        )
      }

      const endpointSecret = createEndpointAccessToken()
      if (!isRemoteHostOpaqueToken(endpointSecret)) {
        return errorResponse(
          500,
          "application_failure",
          "Agent Host endpoint could not be initialized"
        )
      }
      endpoint = await resolved.createEndpoint(endpointSecret)
      if (closed) {
        closeEndpointInstance(endpoint)
        return errorResponse(503, "transport_failure", "Remote Agent Host is closed")
      }
      const response = await endpoint.send({
        ...request,
        accessToken: endpointSecret
      })
      if (closed) {
        closeEndpointInstance(endpoint)
        return errorResponse(503, "transport_failure", "Remote Agent Host is closed")
      }
      if (
        !isAgentHostServerMessage(response) ||
        response.kind !== "wanex.agent-host.handshake.response"
      ) {
        closeEndpointInstance(endpoint)
        return responseError(response, request)
      }
      if (jsonSize(response) > limits.maxResponseBytes) {
        closeEndpointInstance(endpoint)
        return errorResponse(
          500,
          "resource_limit",
          "remote Agent Host response exceeds its limit"
        )
      }
      if (
        response.host.hostId !== resolved.host.hostId ||
        response.host.connectionKind !== "remote_tls" ||
        (response.host.executionLocation !== "remote" &&
          response.host.executionLocation !== "managed")
      ) {
        closeEndpointInstance(endpoint)
        return errorResponse(
          500,
          "application_failure",
          "Agent Host handshake returned an invalid host"
        )
      }
      const sessionId = createSessionId()
      if (!isRemoteHostOpaqueToken(sessionId) || sessions.has(sessionId)) {
        closeEndpointInstance(endpoint)
        return errorResponse(
          500,
          "application_failure",
          "Agent Host session could not be initialized"
        )
      }
      sessions.set(sessionId, {
        id: sessionId,
        endpoint,
        subjectId: subject.subjectId,
        grant: resolved.grant,
        host: resolved.host,
        clientId: request.clientId,
        requestedDomains: access.context.grantedDomains,
        expiresAt: access.context.expiresAt,
        eventStreams: new Set(),
        eventStreamExpiryTimers: new Map(),
        inFlight: 0,
        closed: false
      })
      return {
        status: 200,
        headers: {
          ...JSON_HEADERS,
          [REMOTE_AGENT_HOST_SESSION_HEADER]: sessionId
        },
        body: response
      }
    } catch {
      if (endpoint !== undefined) closeEndpointInstance(endpoint)
      return errorResponse(
        502,
        "transport_failure",
        "Agent Host endpoint failed to initialize"
      )
    } finally {
      pendingSessions -= 1
    }
  }

  async function close(): Promise<void> {
    if (closed) return
    closed = true
    const current = [...sessions.values()]
    sessions.clear()
    await Promise.all(
      current.map(async (session) => {
        await closeSession(session)
      })
    )
  }

  async function closeSession(session: RemoteHostSession): Promise<void> {
    if (session.closed) return
    session.closed = true
    if (sessions.get(session.id) === session) sessions.delete(session.id)
    for (const stream of session.eventStreams) stream.close()
    session.eventStreams.clear()
    for (const timer of session.eventStreamExpiryTimers.values()) {
      clearTimeout(timer)
    }
    session.eventStreamExpiryTimers.clear()
    await closeEndpoint(session)
  }

  async function closeEndpoint(session: RemoteHostSession): Promise<void> {
    closeEndpointInstance(session.endpoint)
  }

  async function closeSessionForHeader(sessionId: string | undefined): Promise<void> {
    if (sessionId === undefined || !isRemoteHostOpaqueToken(sessionId)) return
    const session = sessions.get(sessionId)
    if (session !== undefined) await closeSession(session)
  }

  async function pruneExpiredSessions(nowMs: number): Promise<void> {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) return
    const expired = [...sessions.values()].filter(
      (session) => session.expiresAt <= nowMs
    )
    await Promise.all(expired.map(async (session) => await closeSession(session)))
  }
}

function closeEndpointInstance(endpoint: InProcessAgentHostEndpoint): void {
  try {
    endpoint.close()
  } catch {
    // Endpoint close is best effort after transport or authorization failure.
  }
}

function responseResponse(response: AgentHostServerMessage): RemoteAgentHostHttpResponse {
  return {
    status:
      response.kind === "wanex.agent-host.error"
        ? statusForError(response.error.code)
        : 200,
    headers: JSON_HEADERS,
    body: response
  }
}

function responseError(
  response: unknown,
  request: AgentHostClientMessage
): RemoteAgentHostHttpResponse {
  if (isAgentHostServerMessage(response) && response.kind === "wanex.agent-host.error") {
    return responseResponse(response)
  }
  return errorResponse(
    500,
    "application_failure",
    "Agent Host handshake failed",
    requestId(request)
  )
}

function errorResponse(
  status: number,
  code: AgentHostErrorCode,
  message: string,
  requestId?: string
): RemoteAgentHostHttpResponse {
  return {
    status,
    headers: JSON_HEADERS,
    body: {
      kind: "wanex.agent-host.error",
      ...(requestId === undefined ? {} : { requestId }),
      error: { code, message, retryable: false }
    }
  }
}

function eventStreamErrorResponse(
  status: number,
  code: AgentHostErrorCode,
  message: string
): RemoteAgentHostEventStreamResponse {
  return {
    status,
    headers: JSON_HEADERS,
    body: {
      kind: "wanex.agent-host.error",
      error: { code, message, retryable: false }
    }
  }
}

function parseClientMessage(value: unknown): AgentHostClientMessage | undefined {
  return isAgentHostClientMessage(value) ? value : undefined
}

function requestId(message: AgentHostClientMessage): string | undefined {
  return message.kind === "wanex.agent-host.handshake.request"
    ? undefined
    : message.requestId
}

function parseBearerToken(
  headers: Readonly<Record<string, string | undefined>>
): string | undefined {
  const authorization = getHeader(headers, "authorization")
  if (authorization === undefined || !authorization.startsWith("Bearer ")) {
    return undefined
  }
  const token = authorization.slice("Bearer ".length)
  return token.length === 0 ? undefined : token
}

function getHeader(
  headers: Readonly<Record<string, string | undefined>>,
  name: string
): string | undefined {
  const lowerName = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return typeof value === "string" ? value : undefined
    }
  }
  return undefined
}

function resolveBodySize(request: RemoteAgentHostHttpRequest): number | undefined {
  const parsedBodySize = jsonSize(request.body)
  if (request.bodyBytes === undefined) return parsedBodySize
  if (!Number.isSafeInteger(request.bodyBytes) || request.bodyBytes < 0) {
    return undefined
  }
  return Math.max(parsedBodySize, request.bodyBytes)
}

function jsonSize(value: unknown): number {
  try {
    const json = JSON.stringify(value)
    return json === undefined ? Number.POSITIVE_INFINITY : Buffer.byteLength(json)
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export function isRemoteHostOpaqueToken(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 200 &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  )
}

function statusForError(code: AgentHostErrorCode): number {
  if (code === "unauthenticated") return 401
  if (code === "unauthorized") return 403
  if (code === "not_found") return 404
  if (code === "resource_limit") return 413
  if (code === "application_failure") return 500
  if (code === "transport_failure") return 502
  return 400
}

function messageForError(code: AgentHostErrorCode): string {
  if (code === "unauthenticated") return "Agent Host credentials are invalid"
  if (code === "unauthorized") return "Agent Host access is not granted"
  if (code === "resource_limit") return "Agent Host request exceeds its limit"
  return "Agent Host request is invalid"
}
