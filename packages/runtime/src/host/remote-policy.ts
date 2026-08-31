import type {
  AgentHostDescriptor,
  AgentHostDomain
} from "@wanex/protocol"
import { AGENT_HOST_MAX_ID_LENGTH } from "@wanex/protocol"

export const DEFAULT_REMOTE_HOST_REQUEST_LIMITS = {
  maxBodyBytes: 4 * 1024 * 1024,
  maxResponseBytes: 4 * 1024 * 1024,
  maxSessions: 128,
  maxInFlightRequests: 32,
  maxEventSubscribers: 1,
  requestTimeoutMs: 30_000
} as const

const MAX_REMOTE_HOST_BODY_BYTES = 16 * 1024 * 1024
const MAX_REMOTE_HOST_SESSIONS = 1_024
const MAX_REMOTE_HOST_IN_FLIGHT_REQUESTS = 256
const MAX_REMOTE_HOST_EVENT_SUBSCRIBERS = 16
const MAX_REMOTE_HOST_REQUEST_TIMEOUT_MS = 120_000

type RemoteHostAuthorizationCode =
  | "unauthenticated"
  | "unauthorized"
  | "resource_limit"

export interface RemoteHostAuthenticatedSubject {
  readonly subjectId: string
  readonly expiresAt: number
}

export interface RemoteHostGrant {
  readonly subjectId: string
  readonly hostId: string
  readonly domains: readonly AgentHostDomain[]
  readonly expiresAt: number
}

export interface RemoteHostAuthorizationRequest {
  readonly subject: RemoteHostAuthenticatedSubject
  readonly grant: RemoteHostGrant
  readonly host: AgentHostDescriptor
  readonly clientId: string
  readonly requestedDomains: readonly AgentHostDomain[]
  readonly nowMs?: number
}

export interface RemoteHostAuthorizationContext {
  readonly subjectId: string
  readonly hostId: string
  readonly clientId: string
  readonly grantedDomains: readonly AgentHostDomain[]
  readonly expiresAt: number
}

export type RemoteHostAuthorizationDecision =
  | {
      readonly outcome: "allowed"
      readonly context: RemoteHostAuthorizationContext
    }
  | {
      readonly outcome: "denied"
      readonly code: "unauthenticated" | "unauthorized" | "resource_limit"
      readonly retryable: false
    }

export function authorizeRemoteHostDomain(
  context: RemoteHostAuthorizationContext,
  domain: AgentHostDomain,
  nowMs = Date.now()
): RemoteHostAuthorizationDecision {
  if (!isTimestamp(nowMs) || context.expiresAt <= nowMs) {
    return denied("unauthenticated")
  }
  if (!context.grantedDomains.includes(domain)) {
    return denied("unauthorized")
  }
  return { outcome: "allowed", context }
}

export interface RemoteHostRequestLimits {
  readonly maxBodyBytes: number
  readonly maxResponseBytes: number
  readonly maxSessions: number
  readonly maxInFlightRequests: number
  readonly maxEventSubscribers: number
  readonly requestTimeoutMs: number
}

export function authorizeRemoteHostRequest(
  request: RemoteHostAuthorizationRequest
): RemoteHostAuthorizationDecision {
  const nowMs = request.nowMs ?? Date.now()
  if (!isTimestamp(nowMs)) return denied("resource_limit")

  if (
    !isIdentifier(request.subject.subjectId) ||
    !isTimestamp(request.subject.expiresAt) ||
    request.subject.expiresAt <= nowMs
  ) {
    return denied("unauthenticated")
  }

  if (
    request.host.connectionKind !== "remote_tls" ||
    (request.host.executionLocation !== "remote" &&
      request.host.executionLocation !== "managed")
  ) {
    return denied("unauthorized")
  }

  if (
    !isIdentifier(request.clientId) ||
    !isIdentifier(request.grant.subjectId) ||
    request.grant.subjectId !== request.subject.subjectId ||
    !isIdentifier(request.grant.hostId) ||
    request.grant.hostId !== request.host.hostId ||
    !isTimestamp(request.grant.expiresAt) ||
    request.grant.expiresAt <= nowMs
  ) {
    return denied("unauthorized")
  }

  if (
    !isDomainList(request.grant.domains) ||
    !isDomainList(request.requestedDomains) ||
    request.requestedDomains.some(
      (domain) => !request.grant.domains.includes(domain)
    )
  ) {
    return denied("unauthorized")
  }

  return {
    outcome: "allowed",
    context: {
      subjectId: request.subject.subjectId,
      hostId: request.host.hostId,
      clientId: request.clientId,
      grantedDomains: [...request.requestedDomains],
      expiresAt: Math.min(request.subject.expiresAt, request.grant.expiresAt)
    }
  }
}

export function normalizeRemoteHostRequestLimits(
  limits: Partial<RemoteHostRequestLimits> = {}
): RemoteHostRequestLimits {
  return {
    maxBodyBytes: boundedInteger(
      limits.maxBodyBytes,
      DEFAULT_REMOTE_HOST_REQUEST_LIMITS.maxBodyBytes,
      1,
      MAX_REMOTE_HOST_BODY_BYTES
    ),
    maxResponseBytes: boundedInteger(
      limits.maxResponseBytes,
      DEFAULT_REMOTE_HOST_REQUEST_LIMITS.maxResponseBytes,
      1,
      MAX_REMOTE_HOST_BODY_BYTES
    ),
    maxSessions: boundedInteger(
      limits.maxSessions,
      DEFAULT_REMOTE_HOST_REQUEST_LIMITS.maxSessions,
      1,
      MAX_REMOTE_HOST_SESSIONS
    ),
    maxInFlightRequests: boundedInteger(
      limits.maxInFlightRequests,
      DEFAULT_REMOTE_HOST_REQUEST_LIMITS.maxInFlightRequests,
      1,
      MAX_REMOTE_HOST_IN_FLIGHT_REQUESTS
    ),
    maxEventSubscribers: boundedInteger(
      limits.maxEventSubscribers,
      DEFAULT_REMOTE_HOST_REQUEST_LIMITS.maxEventSubscribers,
      1,
      MAX_REMOTE_HOST_EVENT_SUBSCRIBERS
    ),
    requestTimeoutMs: boundedInteger(
      limits.requestTimeoutMs,
      DEFAULT_REMOTE_HOST_REQUEST_LIMITS.requestTimeoutMs,
      1,
      MAX_REMOTE_HOST_REQUEST_TIMEOUT_MS
    )
  }
}

function denied(
  code: RemoteHostAuthorizationCode
): RemoteHostAuthorizationDecision {
  return { outcome: "denied", code, retryable: false }
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`remote Host limit must be between ${minimum} and ${maximum}`)
  }
  return value
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= AGENT_HOST_MAX_ID_LENGTH &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  )
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function isDomainList(value: unknown): value is readonly AgentHostDomain[] {
  return (
    Array.isArray(value) &&
    value.every((domain) => domain === "assistant" || domain === "coding") &&
    new Set(value).size === value.length
  )
}
