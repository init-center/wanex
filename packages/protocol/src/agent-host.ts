import type { JsonValue } from "./json.js"

export const WANEX_AGENT_HOST_PROTOCOL_VERSION = 1 as const
export const AGENT_HOST_CAPABILITY_SNAPSHOT_REVISION = 1 as const
export const AGENT_HOST_MAX_ID_LENGTH = 200
export const AGENT_HOST_MAX_ACCESS_TOKEN_LENGTH = 512
export const AGENT_HOST_MAX_OPERATION_LENGTH = 160
export const AGENT_HOST_MAX_ERROR_MESSAGE_LENGTH = 512
export const AGENT_HOST_MAX_EVENT_PAGE_SIZE = 100
export const AGENT_HOST_MAX_FRAME_BYTES = 16 * 1024 * 1024

export type AgentHostProtocolVersion =
  typeof WANEX_AGENT_HOST_PROTOCOL_VERSION

export type AgentHostDomain = "assistant" | "coding"

export type AgentHostFeature =
  | "canonical_reads"
  | "ordered_events"
  | "event_replay"
  | "idempotent_commands"
  | "cancellation"
  | "approval"
  | "recovery"
  | "resource_delivery"

export type AgentHostConnectionKind =
  | "in_process"
  | "local_ipc"
  | "remote_tls"

export interface AgentHostDescriptor {
  readonly hostId: string
  readonly instanceId: string
  readonly connectionKind: AgentHostConnectionKind
  readonly executionLocation: "local" | "remote" | "managed"
}

export interface AgentHostCapabilitySnapshot {
  readonly revision: typeof AGENT_HOST_CAPABILITY_SNAPSHOT_REVISION
  readonly domains: readonly AgentHostDomain[]
  readonly features: readonly AgentHostFeature[]
  readonly maxFrameBytes: number
  readonly maxEventPageSize: number
  readonly eventReplay: "bounded"
}

export interface AgentHostHandshakeRequest {
  readonly kind: "wanex.agent-host.handshake.request"
  readonly protocolVersion: AgentHostProtocolVersion
  readonly clientId: string
  readonly accessToken: string
  readonly requestedDomains: readonly AgentHostDomain[]
}

export interface AgentHostHandshakeResponse {
  readonly kind: "wanex.agent-host.handshake.response"
  readonly protocolVersion: AgentHostProtocolVersion
  readonly connectionId: string
  readonly host: AgentHostDescriptor
  readonly capabilities: AgentHostCapabilitySnapshot
}

export interface AgentHostCommandRequest {
  readonly kind: "wanex.agent-host.operation.request"
  readonly operationKind: "command"
  readonly requestId: string
  readonly idempotencyKey: string
  readonly domain: AgentHostDomain
  readonly operation: string
  readonly payload: JsonValue
  readonly deadlineAt?: number
}

export interface AgentHostReadRequest {
  readonly kind: "wanex.agent-host.operation.request"
  readonly operationKind: "read"
  readonly requestId: string
  readonly domain: AgentHostDomain
  readonly operation: string
  readonly payload: JsonValue
  readonly deadlineAt?: number
}

export type AgentHostOperationRequest =
  | AgentHostCommandRequest
  | AgentHostReadRequest

export interface AgentHostOperationResponse {
  readonly kind: "wanex.agent-host.operation.response"
  readonly requestId: string
  readonly operationKind: AgentHostOperationRequest["operationKind"]
  readonly outcome: "accepted" | "completed" | "failed" | "suspended"
  readonly operationId?: string
  readonly result?: JsonValue
  readonly error?: AgentHostError
}

export type AgentHostOperationResult =
  | {
      readonly outcome: "accepted" | "suspended"
      readonly operationId: string
    }
  | {
      readonly outcome: "completed"
      readonly operationId?: string
      readonly result?: JsonValue
    }
  | {
      readonly outcome: "failed"
      readonly error: AgentHostError
    }

export interface AgentHostEventReplayRequest {
  readonly kind: "wanex.agent-host.events.replay.request"
  readonly requestId: string
  readonly streamId: string
  readonly afterSequence: number
  readonly limit: number
}

export interface AgentHostEvent {
  readonly kind: "wanex.agent-host.event"
  readonly streamId: string
  readonly sequence: number
  readonly eventId: string
  readonly domain: AgentHostDomain
  readonly type: string
  readonly payload: JsonValue
  readonly occurredAt: number
}

export interface AgentHostEventPage {
  readonly streamId: string
  readonly events: readonly AgentHostEvent[]
  readonly earliestSequence: number
  readonly latestSequence: number
  readonly hasMore: boolean
}

export interface AgentHostEventReplayResponse {
  readonly kind: "wanex.agent-host.events.replay.response"
  readonly requestId: string
  readonly outcome: "replayed" | "gap"
  readonly page?: AgentHostEventPage
  readonly gap?: {
    readonly reason: "cursor_before_window" | "stream_replaced"
    readonly canonicalReadRequired: true
  }
}

export type AgentHostErrorCode =
  | "malformed_request"
  | "unsupported_protocol"
  | "unauthenticated"
  | "unauthorized"
  | "not_found"
  | "idempotency_conflict"
  | "deadline_exceeded"
  | "replay_gap"
  | "host_replaced"
  | "resource_limit"
  | "application_failure"
  | "transport_failure"

export interface AgentHostError {
  readonly code: AgentHostErrorCode
  readonly message: string
  readonly retryable: boolean
}

export interface AgentHostErrorResponse {
  readonly kind: "wanex.agent-host.error"
  readonly requestId?: string
  readonly error: AgentHostError
}

export type AgentHostClientMessage =
  | AgentHostHandshakeRequest
  | AgentHostOperationRequest
  | AgentHostEventReplayRequest

export type AgentHostServerMessage =
  | AgentHostHandshakeResponse
  | AgentHostOperationResponse
  | AgentHostEvent
  | AgentHostEventReplayResponse
  | AgentHostErrorResponse

export type AgentHostMessage = AgentHostClientMessage | AgentHostServerMessage

export interface AgentHostClientTransport {
  send(request: AgentHostClientMessage): Promise<unknown>
  subscribe(listener: (event: unknown) => void): () => void
}

export interface AgentHostClient {
  handshake(
    request: Omit<AgentHostHandshakeRequest, "kind">
  ): Promise<AgentHostHandshakeResponse>
  command(
    request: Omit<
      AgentHostCommandRequest,
      "kind" | "operationKind" | "requestId"
    >
  ): Promise<AgentHostOperationResponse>
  read(
    request: Omit<AgentHostReadRequest, "kind" | "operationKind" | "requestId">
  ): Promise<AgentHostOperationResponse>
  replay(
    request: Omit<AgentHostEventReplayRequest, "kind" | "requestId">
  ): Promise<AgentHostEventReplayResponse>
  subscribe(listener: (event: AgentHostEvent) => void): () => void
}

export type AgentHostClientErrorCode =
  | AgentHostErrorCode
  | "invalid_response"

export class AgentHostClientError extends Error {
  readonly code: AgentHostClientErrorCode
  readonly detail?: AgentHostError

  constructor(
    code: AgentHostClientErrorCode,
    message: string,
    detail?: AgentHostError
  ) {
    super(message)
    this.name = "AgentHostClientError"
    this.code = code
    if (detail !== undefined) this.detail = detail
  }
}

export function createAgentHostClient(
  transport: AgentHostClientTransport,
  createRequestId: () => string = defaultAgentHostRequestId
): AgentHostClient {
  const client: AgentHostClient = {
    async handshake(request) {
      const response = await send(transport, {
        kind: "wanex.agent-host.handshake.request",
        ...request
      })
      if (isAgentHostErrorResponse(response)) throw clientError(response)
      if (!isHandshakeResponseFor(response)) {
        throw new AgentHostClientError(
          "invalid_response",
          "Agent Host handshake response is invalid"
        )
      }
      return response
    },
    async command(request) {
      const requestId = createRequestId()
      const response = await send(transport, {
        kind: "wanex.agent-host.operation.request",
        operationKind: "command",
        requestId,
        ...request
      })
      return operationClientResponse(response, requestId)
    },
    async read(request) {
      const requestId = createRequestId()
      const response = await send(transport, {
        kind: "wanex.agent-host.operation.request",
        operationKind: "read",
        requestId,
        ...request
      })
      return operationClientResponse(response, requestId)
    },
    async replay(request) {
      const requestId = createRequestId()
      const response = await send(transport, {
        kind: "wanex.agent-host.events.replay.request",
        requestId,
        ...request
      })
      if (isAgentHostErrorResponse(response)) throw clientError(response)
      if (
        !isAgentHostServerMessage(response) ||
        response.kind !== "wanex.agent-host.events.replay.response" ||
        response.requestId !== requestId
      ) {
        throw new AgentHostClientError(
          "invalid_response",
          "Agent Host replay response is invalid"
        )
      }
      return response
    },
    subscribe(listener) {
      return transport.subscribe((value) => {
        if (
          !isAgentHostServerMessage(value) ||
          value.kind !== "wanex.agent-host.event"
        ) {
          return
        }
        try {
          listener(value)
        } catch {
          // One client listener cannot affect the transport.
        }
      })
    }
  }
  return Object.freeze(client)

  async function send(
    hostTransport: AgentHostClientTransport,
    request: AgentHostClientMessage
  ): Promise<AgentHostServerMessage> {
    let response: unknown
    try {
      response = await hostTransport.send(request)
    } catch {
      throw new AgentHostClientError(
        "transport_failure",
        "Agent Host transport failed"
      )
    }
    if (!isAgentHostServerMessage(response)) {
      throw new AgentHostClientError(
        "invalid_response",
        "Agent Host response is invalid"
      )
    }
    return response
  }

  function operationClientResponse(
    response: AgentHostServerMessage,
    requestId: string
  ): AgentHostOperationResponse {
    if (isAgentHostErrorResponse(response)) throw clientError(response)
    if (
      !isAgentHostServerMessage(response) ||
      response.kind !== "wanex.agent-host.operation.response" ||
      response.requestId !== requestId
    ) {
      throw new AgentHostClientError(
        "invalid_response",
        "Agent Host operation response is invalid"
      )
    }
    return response
  }
}

function clientError(response: AgentHostErrorResponse): AgentHostClientError {
  return new AgentHostClientError(
    response.error.code,
    response.error.message,
    response.error
  )
}

function isAgentHostErrorResponse(
  value: AgentHostServerMessage
): value is AgentHostErrorResponse {
  return value.kind === "wanex.agent-host.error"
}

function isHandshakeResponseFor(
  value: AgentHostServerMessage
): value is AgentHostHandshakeResponse {
  return value.kind === "wanex.agent-host.handshake.response"
}

let agentHostRequestSequence = 0

function defaultAgentHostRequestId(): string {
  agentHostRequestSequence =
    (agentHostRequestSequence + 1) % Number.MAX_SAFE_INTEGER
  return `agent-host-${Date.now().toString(36)}-${agentHostRequestSequence.toString(36)}`
}

export function isAgentHostClientMessage(
  value: unknown
): value is AgentHostClientMessage {
  if (!isRecord(value) || typeof value.kind !== "string") return false

  switch (value.kind) {
    case "wanex.agent-host.handshake.request":
      return isHandshakeRequest(value)
    case "wanex.agent-host.operation.request":
      return isOperationRequest(value)
    case "wanex.agent-host.events.replay.request":
      return isEventReplayRequest(value)
    default:
      return false
  }
}

export function isAgentHostServerMessage(
  value: unknown
): value is AgentHostServerMessage {
  if (!isRecord(value) || typeof value.kind !== "string") return false

  switch (value.kind) {
    case "wanex.agent-host.handshake.response":
      return isHandshakeResponse(value)
    case "wanex.agent-host.operation.response":
      return isOperationResponse(value)
    case "wanex.agent-host.event":
      return isAgentHostEvent(value)
    case "wanex.agent-host.events.replay.response":
      return isEventReplayResponse(value)
    case "wanex.agent-host.error":
      return isErrorResponse(value)
    default:
      return false
  }
}

export function isAgentHostMessage(value: unknown): value is AgentHostMessage {
  return isAgentHostClientMessage(value) || isAgentHostServerMessage(value)
}

function isHandshakeRequest(
  value: unknown
): value is AgentHostHandshakeRequest {
  if (!isRecord(value)) return false
  return (
    hasOnlyKeys(value, [
      "kind",
      "protocolVersion",
      "clientId",
      "accessToken",
      "requestedDomains"
    ]) &&
    value.kind === "wanex.agent-host.handshake.request" &&
    value.protocolVersion === WANEX_AGENT_HOST_PROTOCOL_VERSION &&
    isToken(value.clientId) &&
    isAccessToken(value.accessToken) &&
    isDomainList(value.requestedDomains)
  )
}

function isHandshakeResponse(
  value: unknown
): value is AgentHostHandshakeResponse {
  if (!isRecord(value)) return false
  return (
    hasOnlyKeys(value, [
      "kind",
      "protocolVersion",
      "connectionId",
      "host",
      "capabilities"
    ]) &&
    value.kind === "wanex.agent-host.handshake.response" &&
    value.protocolVersion === WANEX_AGENT_HOST_PROTOCOL_VERSION &&
    isToken(value.connectionId) &&
    isHostDescriptor(value.host) &&
    isCapabilitySnapshot(value.capabilities)
  )
}

function isOperationRequest(
  value: unknown
): value is AgentHostOperationRequest {
  if (!isRecord(value)) return false
  const common =
    hasOnlyKeys(value, [
      "kind",
      "operationKind",
      "requestId",
      "idempotencyKey",
      "domain",
      "operation",
      "payload",
      "deadlineAt"
    ]) &&
    value.kind === "wanex.agent-host.operation.request" &&
    isToken(value.requestId) &&
    isDomain(value.domain) &&
    isOperation(value.operation) &&
    isJsonValue(value.payload) &&
    isOptionalTimestamp(value.deadlineAt)

  if (!common) return false
  if (value.operationKind === "command") {
    return isToken(value.idempotencyKey)
  }
  return value.operationKind === "read" && value.idempotencyKey === undefined
}

function isOperationResponse(
  value: unknown
): value is AgentHostOperationResponse {
  if (!isRecord(value)) return false
  if (
    !hasOnlyKeys(value, [
      "kind",
      "requestId",
      "operationKind",
      "outcome",
      "operationId",
      "result",
      "error"
    ]) ||
    value.kind !== "wanex.agent-host.operation.response" ||
    !isToken(value.requestId) ||
    (value.operationKind !== "command" && value.operationKind !== "read") ||
    !isOperationOutcome(value.outcome) ||
    !isOptionalToken(value.operationId) ||
    !isOptionalJsonValue(value.result) ||
    !isOptionalError(value.error)
  ) {
    return false
  }

  if (value.outcome === "failed") {
    return value.error !== undefined && value.result === undefined
  }
  if (value.outcome === "accepted" || value.outcome === "suspended") {
    return (
      value.error === undefined &&
      value.operationId !== undefined &&
      value.result === undefined
    )
  }
  return value.error === undefined
}

function isEventReplayRequest(
  value: unknown
): value is AgentHostEventReplayRequest {
  if (!isRecord(value)) return false
  return (
    hasOnlyKeys(value, [
      "kind",
      "requestId",
      "streamId",
      "afterSequence",
      "limit"
    ]) &&
    value.kind === "wanex.agent-host.events.replay.request" &&
    isToken(value.requestId) &&
    isToken(value.streamId) &&
    isSequence(value.afterSequence) &&
    isPageLimit(value.limit)
  )
}

function isEventReplayResponse(
  value: unknown
): value is AgentHostEventReplayResponse {
  if (!isRecord(value)) return false
  if (
    !hasOnlyKeys(value, ["kind", "requestId", "outcome", "page", "gap"]) ||
    value.kind !== "wanex.agent-host.events.replay.response" ||
    !isToken(value.requestId)
  ) {
    return false
  }

  if (value.outcome === "replayed") {
    return isEventPage(value.page) && value.gap === undefined
  }
  if (value.outcome !== "gap") return false
  return isReplayGap(value.gap) && value.page === undefined
}

function isAgentHostEvent(value: unknown): value is AgentHostEvent {
  if (!isRecord(value)) return false
  return (
    hasOnlyKeys(value, [
      "kind",
      "streamId",
      "sequence",
      "eventId",
      "domain",
      "type",
      "payload",
      "occurredAt"
    ]) &&
    value.kind === "wanex.agent-host.event" &&
    isToken(value.streamId) &&
    isSequence(value.sequence) &&
    isToken(value.eventId) &&
    isDomain(value.domain) &&
    isOperation(value.type) &&
    isJsonValue(value.payload) &&
    isTimestamp(value.occurredAt)
  )
}

function isEventPage(value: unknown): value is AgentHostEventPage {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "streamId",
      "events",
      "earliestSequence",
      "latestSequence",
      "hasMore"
    ]) ||
    !isToken(value.streamId) ||
    !Array.isArray(value.events) ||
    value.events.length > AGENT_HOST_MAX_EVENT_PAGE_SIZE ||
    !isSequence(value.earliestSequence) ||
    !isSequence(value.latestSequence) ||
    typeof value.hasMore !== "boolean"
  ) {
    return false
  }

  let previousSequence: number | undefined
  for (const event of value.events) {
    if (!isRecord(event) || !isAgentHostEvent(event)) return false
    if (event.streamId !== value.streamId) return false
    if (
      previousSequence !== undefined &&
      event.sequence !== previousSequence + 1
    ) {
      return false
    }
    previousSequence = event.sequence
  }

  if (value.events.length === 0) {
    return value.earliestSequence <= value.latestSequence + 1
  }
  return (
    value.events[0].sequence >= value.earliestSequence &&
    value.events[value.events.length - 1].sequence <= value.latestSequence
  )
}

function isReplayGap(value: unknown): value is AgentHostEventReplayResponse["gap"] {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["reason", "canonicalReadRequired"]) &&
    (value.reason === "cursor_before_window" ||
      value.reason === "stream_replaced") &&
    value.canonicalReadRequired === true
  )
}

function isHostDescriptor(value: unknown): value is AgentHostDescriptor {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "hostId",
      "instanceId",
      "connectionKind",
      "executionLocation"
    ]) &&
    isToken(value.hostId) &&
    isToken(value.instanceId) &&
    isConnectionKind(value.connectionKind) &&
    isExecutionLocation(value.executionLocation)
  )
}

function isCapabilitySnapshot(
  value: unknown
): value is AgentHostCapabilitySnapshot {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "revision",
      "domains",
      "features",
      "maxFrameBytes",
      "maxEventPageSize",
      "eventReplay"
    ]) ||
    value.revision !== AGENT_HOST_CAPABILITY_SNAPSHOT_REVISION ||
    !isDomainList(value.domains) ||
    !Array.isArray(value.features) ||
    value.features.length > 32 ||
    value.features.some((feature) => !isFeature(feature)) ||
    !isPositiveInteger(value.maxFrameBytes) ||
    value.maxFrameBytes > AGENT_HOST_MAX_FRAME_BYTES ||
    !isPageLimit(value.maxEventPageSize) ||
    value.eventReplay !== "bounded"
  ) {
    return false
  }
  return new Set(value.features).size === value.features.length
}

function isErrorResponse(value: unknown): value is AgentHostErrorResponse {
  if (!isRecord(value)) return false
  return (
    hasOnlyKeys(value, ["kind", "requestId", "error"]) &&
    value.kind === "wanex.agent-host.error" &&
    isOptionalToken(value.requestId) &&
    isError(value.error)
  )
}

function isError(value: unknown): value is AgentHostError {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["code", "message", "retryable"]) &&
    isErrorCode(value.code) &&
    isBoundedText(value.message, AGENT_HOST_MAX_ERROR_MESSAGE_LENGTH) &&
    typeof value.retryable === "boolean"
  )
}

function isOptionalError(value: unknown): value is AgentHostError | undefined {
  return value === undefined || isError(value)
}

function isDomain(value: unknown): value is AgentHostDomain {
  return value === "assistant" || value === "coding"
}

function isDomainList(value: unknown): value is readonly AgentHostDomain[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 2) {
    return false
  }
  return value.every(isDomain) && new Set(value).size === value.length
}

function isFeature(value: unknown): value is AgentHostFeature {
  return (
    value === "canonical_reads" ||
    value === "ordered_events" ||
    value === "event_replay" ||
    value === "idempotent_commands" ||
    value === "cancellation" ||
    value === "approval" ||
    value === "recovery" ||
    value === "resource_delivery"
  )
}

function isConnectionKind(value: unknown): value is AgentHostConnectionKind {
  return (
    value === "in_process" ||
    value === "local_ipc" ||
    value === "remote_tls"
  )
}

function isExecutionLocation(
  value: unknown
): value is AgentHostDescriptor["executionLocation"] {
  return value === "local" || value === "remote" || value === "managed"
}

function isErrorCode(value: unknown): value is AgentHostErrorCode {
  return (
    value === "malformed_request" ||
    value === "unsupported_protocol" ||
    value === "unauthenticated" ||
    value === "unauthorized" ||
    value === "not_found" ||
    value === "idempotency_conflict" ||
    value === "deadline_exceeded" ||
    value === "replay_gap" ||
    value === "host_replaced" ||
    value === "resource_limit" ||
    value === "application_failure" ||
    value === "transport_failure"
  )
}

function isOperationOutcome(
  value: unknown
): value is AgentHostOperationResponse["outcome"] {
  return (
    value === "accepted" ||
    value === "completed" ||
    value === "failed" ||
    value === "suspended"
  )
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true
  if (typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (!isRecord(value)) return false
  return Object.values(value).every(isJsonValue)
}

function isOptionalJsonValue(value: unknown): value is JsonValue | undefined {
  return value === undefined || isJsonValue(value)
}

function isToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= AGENT_HOST_MAX_ID_LENGTH &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  )
}

function isAccessToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= AGENT_HOST_MAX_ACCESS_TOKEN_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(value)
  )
}

function isOptionalToken(value: unknown): value is string | undefined {
  return value === undefined || isToken(value)
}

function isOperation(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= AGENT_HOST_MAX_OPERATION_LENGTH &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  )
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    !/[\u0000-\u001f\u007f]/.test(value)
  )
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function isOptionalTimestamp(value: unknown): value is number | undefined {
  return value === undefined || isTimestamp(value)
}

function isSequence(value: unknown): value is number {
  return isTimestamp(value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

function isPageLimit(value: unknown): value is number {
  return (
    isPositiveInteger(value) && value <= AGENT_HOST_MAX_EVENT_PAGE_SIZE
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): boolean {
  const allowed = new Set(allowedKeys)
  return Object.keys(value).every((key) => allowed.has(key))
}
