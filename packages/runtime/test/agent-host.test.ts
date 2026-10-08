import { describe, expect, it } from "vitest"
import type {
  AgentHostEvent,
  AgentHostEventPage,
  AgentHostOperationRequest,
  AgentHostOperationResult,
  AgentHostServerMessage
} from "@wanex/protocol"
import {
  createInProcessAgentHostEndpoint,
  type AgentHostReplayResult
} from "../src/host/agent-host.js"

describe("in-process Agent Host endpoint", () => {
  it("requires handshake and filters events by granted domain", async () => {
    const events = new Set<(event: AgentHostEvent) => void>()
    const received: AgentHostEvent[] = []
    const endpoint = createInProcessAgentHostEndpoint({
      host: {
        hostId: "host_test",
        instanceId: "instance_test",
        connectionKind: "in_process",
        executionLocation: "local"
      },
      capabilities: capabilities(["assistant"]),
      accessToken: "access_test",
      handleOperation: async () => ({
        outcome: "completed",
        result: { ok: true }
      }),
      replayEvents: () => ({
        outcome: "replayed",
        page: emptyPage("stream_test")
      }),
      subscribeEvents: (listener) => {
        events.add(listener)
        return () => events.delete(listener)
      }
    })
    endpoint.subscribe((event) => received.push(event))

    const beforeHandshake = await endpoint.send({
      kind: "wanex.agent-host.operation.request",
      operationKind: "read",
      requestId: "req_before_handshake",
      domain: "assistant",
      operation: "snapshot.read",
      payload: {}
    })
    expect(beforeHandshake).toMatchObject({
      kind: "wanex.agent-host.error",
      error: { code: "unauthenticated" }
    })

    const handshake = await endpoint.send({
      kind: "wanex.agent-host.handshake.request",
      protocolVersion: 1,
      clientId: "client_test",
      accessToken: "access_test",
      requestedDomains: ["assistant"]
    })
    expect(handshake).toMatchObject({
      kind: "wanex.agent-host.handshake.response",
      connectionId: "in-process:instance_test:client_test"
    })

    const assistantEvent = event("assistant", 1)
    for (const listener of events) listener(assistantEvent)
    expect(received).toEqual([assistantEvent])

    endpoint.close()
    expect(events).toHaveLength(0)
    await expect(endpoint.send(handshake)).resolves.toMatchObject({
      kind: "wanex.agent-host.error",
      error: { code: "transport_failure" }
    })
  })

  it("delegates operations without creating a second application authority", async () => {
    const requests: AgentHostOperationRequest[] = []
    const endpoint = createInProcessAgentHostEndpoint({
      host: {
        hostId: "host_ops",
        instanceId: "instance_ops",
        connectionKind: "in_process",
        executionLocation: "local"
      },
      capabilities: capabilities(["assistant"]),
      accessToken: "access_ops",
      handleOperation: async (request) => {
        requests.push(request)
        if (request.operation === "conversation.start") {
          return { outcome: "accepted", operationId: "op_1" }
        }
        return { outcome: "completed", result: { state: "ready" } }
      },
      replayEvents: () => ({
        outcome: "replayed",
        page: emptyPage("stream_ops")
      }),
      subscribeEvents: () => () => undefined
    })
    await endpoint.send({
      kind: "wanex.agent-host.handshake.request",
      protocolVersion: 1,
      clientId: "client_ops",
      accessToken: "access_ops",
      requestedDomains: ["assistant"]
    })

    const accepted = await endpoint.send({
      kind: "wanex.agent-host.operation.request",
      operationKind: "command",
      requestId: "req_start",
      idempotencyKey: "idem_start",
      domain: "assistant",
      operation: "conversation.start",
      payload: { text: "hello" }
    })
    expect(accepted).toMatchObject({
      kind: "wanex.agent-host.operation.response",
      outcome: "accepted",
      operationId: "op_1"
    })

    const read = await endpoint.send({
      kind: "wanex.agent-host.operation.request",
      operationKind: "read",
      requestId: "req_read",
      domain: "assistant",
      operation: "snapshot.read",
      payload: {}
    })
    expect(read).toMatchObject({
      kind: "wanex.agent-host.operation.response",
      outcome: "completed",
      result: { state: "ready" }
    })
    expect(requests.map((request) => request.operation)).toEqual([
      "conversation.start",
      "snapshot.read"
    ])
  })

  it("converges concurrent command retries and rejects idempotency conflicts", async () => {
    let invocationCount = 0
    let complete: ((result: AgentHostOperationResult) => void) | undefined
    const endpoint = createInProcessAgentHostEndpoint({
      host: {
        hostId: "host_idempotency",
        instanceId: "instance_idempotency",
        connectionKind: "in_process",
        executionLocation: "local"
      },
      capabilities: capabilities(["assistant"]),
      accessToken: "access_idempotency",
      handleOperation: async () => {
        invocationCount += 1
        return await new Promise<AgentHostOperationResult>((resolve) => {
          complete = resolve
        })
      },
      replayEvents: () => ({
        outcome: "replayed",
        page: emptyPage("stream_idempotency")
      }),
      subscribeEvents: () => () => undefined
    })
    await endpoint.send({
      kind: "wanex.agent-host.handshake.request",
      protocolVersion: 1,
      clientId: "client_idempotency",
      accessToken: "access_idempotency",
      requestedDomains: ["assistant"]
    })

    const first = endpoint.send(command("req_first", { text: "hello" }))
    await Promise.resolve()
    const duplicate = endpoint.send(command("req_duplicate", { text: "hello" }))
    await Promise.resolve()
    expect(invocationCount).toBe(1)
    complete?.({ outcome: "completed", result: { operationId: "operation_once" } })

    await expect(first).resolves.toMatchObject({
      requestId: "req_first",
      outcome: "completed",
      result: { operationId: "operation_once" }
    })
    await expect(duplicate).resolves.toMatchObject({
      requestId: "req_duplicate",
      outcome: "completed",
      result: { operationId: "operation_once" }
    })
    await expect(endpoint.send(command("req_conflict", { text: "different" })))
      .resolves.toMatchObject({
        requestId: "req_conflict",
        outcome: "failed",
        error: { code: "idempotency_conflict", retryable: false }
      })
    expect(invocationCount).toBe(1)

    function command(requestId: string, payload: { readonly text: string }) {
      return {
        kind: "wanex.agent-host.operation.request" as const,
        operationKind: "command" as const,
        requestId,
        idempotencyKey: "same_semantic_command",
        domain: "assistant" as const,
        operation: "conversation.start",
        payload
      }
    }
  })

  it("normalizes handler failures and invalid replay results", async () => {
    const endpoint = createInProcessAgentHostEndpoint({
      host: {
        hostId: "host_failure",
        instanceId: "instance_failure",
        connectionKind: "in_process",
        executionLocation: "local"
      },
      capabilities: capabilities(["assistant"]),
      accessToken: "access_failure",
      handleOperation: async (): Promise<AgentHostOperationResult> => {
        throw new Error("private failure")
      },
      replayEvents: (): AgentHostReplayResult => ({
        outcome: "replayed"
      }),
      subscribeEvents: () => () => undefined
    })
    await endpoint.send({
      kind: "wanex.agent-host.handshake.request",
      protocolVersion: 1,
      clientId: "client_failure",
      accessToken: "access_failure",
      requestedDomains: ["assistant"]
    })

    const failed = await endpoint.send({
      kind: "wanex.agent-host.operation.request",
      operationKind: "read",
      requestId: "req_failure",
      domain: "assistant",
      operation: "project.read",
      payload: {}
    })
    expect(failed).toMatchObject({
      kind: "wanex.agent-host.operation.response",
      outcome: "failed",
      error: {
        code: "application_failure",
        message: "Agent Host operation failed"
      }
    })

    const replay = await endpoint.send({
      kind: "wanex.agent-host.events.replay.request",
      requestId: "req_replay",
      streamId: "stream_failure",
      afterSequence: 0,
      limit: 10
    })
    expect(replay).toMatchObject({
      kind: "wanex.agent-host.error",
      requestId: "req_replay",
      error: {
        code: "application_failure",
        message: "Agent Host event replay result is invalid"
      }
    })
  })
})

function capabilities(domains: readonly "assistant"[]) {
  return {
    revision: 1 as const,
    domains,
    features: [
      "canonical_reads",
      "ordered_events",
      "event_replay",
      "idempotent_commands",
      "cancellation",
      "approval",
      "recovery",
      "resource_delivery"
    ] as const,
    maxFrameBytes: 1024 * 1024,
    maxEventPageSize: 100,
    eventReplay: "bounded" as const
  }
}

function event(domain: "assistant", sequence: number): AgentHostEvent {
  return {
    kind: "wanex.agent-host.event",
    streamId: "stream_test",
    sequence,
    eventId: `event_${sequence}`,
    domain,
    type: "state.changed",
    payload: { sequence },
    occurredAt: sequence
  }
}

function emptyPage(streamId: string): AgentHostEventPage {
  return {
    streamId,
    events: [],
    earliestSequence: 0,
    latestSequence: 0,
    hasMore: false
  }
}
