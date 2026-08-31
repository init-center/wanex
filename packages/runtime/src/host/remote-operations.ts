import type {
  AgentHostErrorCode,
  AgentHostServerMessage
} from "@wanex/protocol"
import type { RemoteHostRequestClass } from "./remote-policy.js"

export type RemoteAgentHostLifecycleState = "open" | "draining" | "closed"

export type RemoteAgentHostTelemetryKind =
  | "session_admitted"
  | "session_closed"
  | "request_completed"
  | "request_rejected"
  | "event_stream_opened"
  | "event_stream_closed"
  | "handler_draining"
  | "handler_closed"

export type RemoteAgentHostTelemetryOutcome =
  | "completed"
  | "rejected"
  | "failed"

export interface RemoteAgentHostTelemetryRecord {
  readonly kind: RemoteAgentHostTelemetryKind
  readonly occurredAt: number
  readonly requestClass?: RemoteHostRequestClass
  readonly outcome?: RemoteAgentHostTelemetryOutcome
  readonly errorCode?: AgentHostErrorCode
  readonly requestBytes?: number
  readonly responseBytes?: number
  readonly activeSessions: number
  readonly pendingHandshakes: number
  readonly inFlightRequests: number
  readonly activeEventStreams: number
  readonly admittedSessions: number
  readonly completedRequests: number
  readonly rejectedRequests: number
  readonly openedEventStreams: number
  readonly closedEventStreams: number
}

export type RemoteAgentHostTelemetrySink = (
  record: RemoteAgentHostTelemetryRecord
) => void

export interface RemoteAgentHostStatusSnapshot {
  readonly state: RemoteAgentHostLifecycleState
  readonly generatedAt: number
  readonly activeSessions: number
  readonly pendingHandshakes: number
  readonly inFlightRequests: number
  readonly activeEventStreams: number
  readonly admittedSessions: number
  readonly completedRequests: number
  readonly rejectedRequests: number
  readonly openedEventStreams: number
  readonly closedEventStreams: number
}

interface RemoteHostOperationResult {
  readonly status: number
  readonly body: AgentHostServerMessage
}

interface RemoteHostEventStreamResult {
  readonly status: number
  readonly body?: AgentHostServerMessage
}

export interface RemoteAgentHostOperationalMetrics {
  getStatus(state: RemoteAgentHostLifecycleState): RemoteAgentHostStatusSnapshot
  getPendingHandshakes(): number
  recordHandshakeStarted(): void
  recordHandshakeFinished(): void
  recordSessionAdmitted(): void
  recordSessionClosed(): void
  recordEventStreamOpened(): void
  recordEventStreamClosed(): void
  recordHandlerDraining(): void
  recordHandlerClosed(): void
  recordRequestResult(
    response: RemoteHostOperationResult,
    requestClass: RemoteHostRequestClass | undefined,
    requestBytes: number | undefined
  ): void
  recordEventStreamRejected(
    response: RemoteHostEventStreamResult,
    requestBytes?: number
  ): void
  recordRequestStarted(): void
  recordRequestFinished(): void
}

export function createRemoteAgentHostOperationalMetrics(options: {
  readonly now: () => number
  readonly telemetry?: RemoteAgentHostTelemetrySink
}): RemoteAgentHostOperationalMetrics {
  const counters = {
    activeSessions: 0,
    pendingHandshakes: 0,
    inFlightRequests: 0,
    activeEventStreams: 0,
    admittedSessions: 0,
    completedRequests: 0,
    rejectedRequests: 0,
    openedEventStreams: 0,
    closedEventStreams: 0
  }

  return Object.freeze({
    getStatus,
    getPendingHandshakes,
    recordHandshakeStarted,
    recordHandshakeFinished,
    recordSessionAdmitted,
    recordSessionClosed,
    recordEventStreamOpened,
    recordEventStreamClosed,
    recordHandlerDraining,
    recordHandlerClosed,
    recordRequestResult,
    recordEventStreamRejected,
    recordRequestStarted,
    recordRequestFinished
  })

  function getStatus(state: RemoteAgentHostLifecycleState): RemoteAgentHostStatusSnapshot {
    return {
      state,
      generatedAt: currentTime(),
      ...counters
    }
  }

  function getPendingHandshakes(): number {
    return counters.pendingHandshakes
  }

  function recordSessionAdmitted(): void {
    counters.activeSessions += 1
    counters.admittedSessions += 1
    emit({ kind: "session_admitted" })
  }

  function recordHandshakeStarted(): void {
    counters.pendingHandshakes += 1
  }

  function recordHandshakeFinished(): void {
    counters.pendingHandshakes = Math.max(0, counters.pendingHandshakes - 1)
  }

  function recordSessionClosed(): void {
    counters.activeSessions = Math.max(0, counters.activeSessions - 1)
    emit({ kind: "session_closed" })
  }

  function recordEventStreamOpened(): void {
    counters.activeEventStreams += 1
    counters.openedEventStreams += 1
    emit({ kind: "event_stream_opened" })
  }

  function recordEventStreamClosed(): void {
    counters.activeEventStreams = Math.max(0, counters.activeEventStreams - 1)
    counters.closedEventStreams += 1
    emit({ kind: "event_stream_closed" })
  }

  function recordHandlerDraining(): void {
    emit({ kind: "handler_draining" })
  }

  function recordHandlerClosed(): void {
    emit({ kind: "handler_closed" })
  }

  function recordRequestResult(
    response: RemoteHostOperationResult,
    requestClass: RemoteHostRequestClass | undefined,
    requestBytes: number | undefined
  ): void {
    const responseBytes = finiteByteCount(jsonSize(response.body))
    if (response.status >= 400) {
      counters.rejectedRequests += 1
      emit({
        kind: "request_rejected",
        ...(requestClass === undefined ? {} : { requestClass }),
        outcome: "rejected",
        ...(response.body.kind === "wanex.agent-host.error"
          ? { errorCode: response.body.error.code }
          : {}),
        ...(requestBytes === undefined ? {} : { requestBytes }),
        ...(responseBytes === undefined ? {} : { responseBytes })
      })
      return
    }
    counters.completedRequests += 1
    const failed =
      response.body.kind === "wanex.agent-host.operation.response" &&
      response.body.outcome === "failed"
    const errorCode = failed ? response.body.error?.code : undefined
    emit({
      kind: "request_completed",
      ...(requestClass === undefined ? {} : { requestClass }),
      outcome: failed ? "failed" : "completed",
      ...(errorCode === undefined ? {} : { errorCode }),
      ...(requestBytes === undefined ? {} : { requestBytes }),
      ...(responseBytes === undefined ? {} : { responseBytes })
    })
  }

  function recordEventStreamRejected(
    response: RemoteHostEventStreamResult,
    requestBytes?: number
  ): void {
    if (response.status < 400) return
    counters.rejectedRequests += 1
    const responseBytes =
      response.body === undefined ? undefined : finiteByteCount(jsonSize(response.body))
    emit({
      kind: "request_rejected",
      requestClass: "event_stream",
      outcome: "rejected",
      ...(response.body?.kind === "wanex.agent-host.error"
        ? { errorCode: response.body.error.code }
        : {}),
      ...(requestBytes === undefined ? {} : { requestBytes }),
      ...(responseBytes === undefined ? {} : { responseBytes })
    })
  }

  function recordRequestStarted(): void {
    counters.inFlightRequests += 1
  }

  function recordRequestFinished(): void {
    counters.inFlightRequests = Math.max(0, counters.inFlightRequests - 1)
  }

  function emit(
    event: Omit<
      RemoteAgentHostTelemetryRecord,
      keyof RemoteAgentHostStatusSnapshot | "occurredAt"
    > & { readonly occurredAt?: number }
  ): void {
    if (options.telemetry === undefined) return
    try {
      options.telemetry(
        Object.freeze({
          ...event,
          ...counters,
          occurredAt: event.occurredAt ?? currentTime()
        })
      )
    } catch {
      // Telemetry observers are advisory and cannot affect runtime behavior.
    }
  }

  function currentTime(): number {
    try {
      const value = options.now()
      if (Number.isSafeInteger(value) && value >= 0) return value
    } catch {
      // Status and telemetry timestamps must not disrupt the handler.
    }
    return Date.now()
  }
}

function finiteByteCount(value: number | undefined): number | undefined {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined
}

function jsonSize(value: unknown): number {
  try {
    const json = JSON.stringify(value)
    return json === undefined ? Number.POSITIVE_INFINITY : Buffer.byteLength(json)
  } catch {
    return Number.POSITIVE_INFINITY
  }
}
