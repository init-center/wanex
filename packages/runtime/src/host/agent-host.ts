import {
  isAgentHostClientMessage,
  isAgentHostServerMessage,
  type AgentHostCapabilitySnapshot,
  type AgentHostDescriptor,
  type AgentHostEvent,
  type AgentHostEventPage,
  type AgentHostEventReplayRequest,
  type AgentHostEventReplayResponse,
  type AgentHostError,
  type AgentHostHandshakeRequest,
  type AgentHostHandshakeResponse,
  type AgentHostOperationRequest,
  type AgentHostOperationResponse,
  type AgentHostOperationResult,
  type AgentHostServerMessage,
  type AgentHostClientMessage
} from "@wanex/protocol"

export interface AgentHostReplayResult {
  readonly outcome: "replayed" | "gap"
  readonly page?: AgentHostEventPage
  readonly gap?: NonNullable<AgentHostEventReplayResponse["gap"]>
}

export interface InProcessAgentHostEndpoint {
  send(request: unknown): Promise<AgentHostServerMessage>
  subscribe(listener: (event: AgentHostEvent) => void): () => void
  close(): void
}

export interface InProcessAgentHostEndpointOptions {
  readonly host: AgentHostDescriptor
  readonly capabilities: AgentHostCapabilitySnapshot
  readonly accessToken: string
  readonly handleOperation: (
    request: AgentHostOperationRequest
  ) => Promise<AgentHostOperationResult>
  readonly replayEvents: (
    request: AgentHostEventReplayRequest
  ) => Promise<AgentHostReplayResult> | AgentHostReplayResult
  readonly subscribeEvents: (
    listener: (event: AgentHostEvent) => void
  ) => () => void
}

export function createInProcessAgentHostEndpoint(
  options: InProcessAgentHostEndpointOptions
): InProcessAgentHostEndpoint {
  let closed = false
  let handshaken = false
  let requestedDomains: AgentHostHandshakeRequest["requestedDomains"] = []
  let unsubscribeSource: (() => void) | undefined
  const listeners = new Set<(event: AgentHostEvent) => void>()

  const endpoint: InProcessAgentHostEndpoint = {
    async send(input) {
      if (closed) {
        return errorResponse(undefined, {
          code: "transport_failure",
          message: "Agent Host endpoint is closed",
          retryable: true
        })
      }

      if (!isAgentHostClientMessage(input)) {
        return errorResponse(undefined, {
          code: "malformed_request",
          message: "Agent Host request is invalid",
          retryable: false
        })
      }

      switch (input.kind) {
        case "wanex.agent-host.handshake.request":
          return handshake(input)
        case "wanex.agent-host.operation.request":
          if (!handshaken) {
            return errorResponse(input.requestId, {
              code: "unauthenticated",
              message: "Agent Host handshake is required",
              retryable: true
            })
          }
          if (!requestedDomains.includes(input.domain)) {
            return errorResponse(input.requestId, {
              code: "unauthorized",
              message: "Agent Host domain was not granted",
              retryable: false
            })
          }
          return operation(input)
        case "wanex.agent-host.events.replay.request":
          if (!handshaken) {
            return errorResponse(input.requestId, {
              code: "unauthenticated",
              message: "Agent Host handshake is required",
              retryable: true
            })
          }
          return replay(input)
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      ensureSourceSubscription()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          unsubscribeSource?.()
          unsubscribeSource = undefined
        }
      }
    },
    close() {
      if (closed) return
      closed = true
      unsubscribeSource?.()
      unsubscribeSource = undefined
      listeners.clear()
    }
  }

  return Object.freeze(endpoint)

  function handshake(
    request: AgentHostHandshakeRequest
  ): AgentHostServerMessage {
    if (handshaken) {
      return errorResponse(undefined, {
        code: "idempotency_conflict",
        message: "Agent Host handshake already completed",
        retryable: false
      })
    }
    if (request.accessToken !== options.accessToken) {
      return errorResponse(undefined, {
        code: "unauthenticated",
        message: "Agent Host access token is invalid",
        retryable: false
      })
    }
    if (
      request.requestedDomains.some(
        (domain) => !options.capabilities.domains.includes(domain)
      )
    ) {
      return errorResponse(undefined, {
        code: "unauthorized",
        message: "Agent Host requested domain is unavailable",
        retryable: false
      })
    }
    handshaken = true
    requestedDomains = request.requestedDomains
    ensureSourceSubscription()
    const response: AgentHostHandshakeResponse = {
      kind: "wanex.agent-host.handshake.response",
      protocolVersion: request.protocolVersion,
      connectionId: `in-process:${options.host.instanceId}:${request.clientId}`,
      host: options.host,
      capabilities: options.capabilities
    }
    return isAgentHostServerMessage(response)
      ? response
      : errorResponse(undefined, {
          code: "application_failure",
          message: "Agent Host handshake configuration is invalid",
          retryable: false
        })
  }

  async function operation(
    request: AgentHostOperationRequest
  ): Promise<AgentHostServerMessage> {
    try {
      const result = await options.handleOperation(request)
      const response = operationResponse(request, result)
      return isAgentHostServerMessage(response)
        ? response
        : errorResponse(request.requestId, {
            code: "application_failure",
            message: "Agent Host operation result is invalid",
            retryable: true
          })
    } catch {
      return operationResponse(request, {
        outcome: "failed",
        error: {
          code: "application_failure",
          message: "Agent Host operation failed",
          retryable: true
        }
      })
    }
  }

  async function replay(
    request: AgentHostEventReplayRequest
  ): Promise<AgentHostServerMessage> {
    try {
      const result = await options.replayEvents(request)
      if (result.outcome === "replayed") {
        if (
          result.page === undefined ||
          !isAgentHostServerMessage({
            kind: "wanex.agent-host.events.replay.response",
            requestId: request.requestId,
            outcome: "replayed",
            page: result.page
          })
        ) {
          return errorResponse(request.requestId, {
            code: "application_failure",
            message: "Agent Host event replay result is invalid",
            retryable: true
          })
        }
        return {
          kind: "wanex.agent-host.events.replay.response",
          requestId: request.requestId,
          outcome: "replayed",
          page: result.page
        }
      }
      if (
        result.gap === undefined ||
        !isAgentHostServerMessage({
          kind: "wanex.agent-host.events.replay.response",
          requestId: request.requestId,
          outcome: "gap",
          gap: result.gap
        })
      ) {
        return errorResponse(request.requestId, {
          code: "application_failure",
          message: "Agent Host event replay result is invalid",
          retryable: true
        })
      }
      return {
        kind: "wanex.agent-host.events.replay.response",
        requestId: request.requestId,
        outcome: "gap",
        gap: result.gap
      }
    } catch {
      return errorResponse(request.requestId, {
        code: "application_failure",
        message: "Agent Host event replay failed",
        retryable: true
      })
    }
  }

  function ensureSourceSubscription(): void {
    if (!handshaken || unsubscribeSource !== undefined || listeners.size === 0) {
      return
    }
    unsubscribeSource = options.subscribeEvents((event) => {
      if (!isAgentHostServerMessage(event)) return
      if (!requestedDomains.includes(event.domain)) return
      for (const listener of listeners) {
        try {
          listener(event)
        } catch {
          // One client listener cannot affect the Host event source.
        }
      }
    })
  }
}

function operationResponse(
  request: AgentHostOperationRequest,
  result: AgentHostOperationResult
): AgentHostOperationResponse {
  if (result.outcome === "failed") {
    return {
      kind: "wanex.agent-host.operation.response",
      requestId: request.requestId,
      operationKind: request.operationKind,
      outcome: "failed",
      error: result.error
    }
  }
  if (result.outcome !== "completed") {
    return {
      kind: "wanex.agent-host.operation.response",
      requestId: request.requestId,
      operationKind: request.operationKind,
      outcome: result.outcome,
      operationId: result.operationId
    }
  }
  return {
    kind: "wanex.agent-host.operation.response",
    requestId: request.requestId,
    operationKind: request.operationKind,
    outcome: result.outcome,
    ...(result.operationId === undefined
      ? {}
      : { operationId: result.operationId }),
    ...(result.result === undefined ? {} : { result: result.result })
  }
}

function errorResponse(
  requestId: string | undefined,
  error: AgentHostError
): AgentHostServerMessage {
  return {
    kind: "wanex.agent-host.error",
    ...(requestId === undefined ? {} : { requestId }),
    error
  }
}
