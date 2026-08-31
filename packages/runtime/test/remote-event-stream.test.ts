import { describe, expect, it } from "vitest"
import type {
  AgentHostEvent,
  AgentHostEventReplayRequest,
  AgentHostEventReplayResponse
} from "@wanex/protocol"
import {
  createRemoteAgentHostEventStream,
  formatRemoteAgentHostEventStreamCursor,
  parseRemoteAgentHostEventStreamCursor,
  type RemoteAgentHostEventStream,
  type RemoteAgentHostSseFrame
} from "../src/host/index.js"

describe("remote Agent Host event stream core", () => {
  it("parses and formats a stream-bound cursor", () => {
    expect(parseRemoteAgentHostEventStreamCursor(undefined)).toEqual({ ok: true })
    expect(
      parseRemoteAgentHostEventStreamCursor("stream_a:42")
    ).toEqual({
      ok: true,
      cursor: { streamId: "stream_a", afterSequence: 42 }
    })
    expect(
      formatRemoteAgentHostEventStreamCursor({
        streamId: "stream_a",
        afterSequence: 42
      })
    ).toBe("stream_a:42")
    expect(parseRemoteAgentHostEventStreamCursor("stream_a:not-a-number")).toMatchObject({
      ok: false
    })
    expect(parseRemoteAgentHostEventStreamCursor("stream a:1")).toMatchObject({
      ok: false
    })
  })

  it("subscribes before replay and flushes live events in order", async () => {
    const replayStarted = deferred<void>()
    const releaseReplay = deferred<void>()
    let publish: ((event: AgentHostEvent) => void) | undefined
    let unsubscribeCount = 0
    const stream = createRemoteAgentHostEventStream({
      cursor: { streamId: "stream_a", afterSequence: 0 },
      subscribe(listener) {
        publish = listener
        return () => {
          unsubscribeCount += 1
        }
      },
      async replay(request) {
        expect(request).toMatchObject({
          streamId: "stream_a",
          afterSequence: 0,
          limit: 64
        })
        replayStarted.resolve()
        await releaseReplay.promise
        return replayResponse(request, [event(1)], 1)
      }
    })

    await replayStarted.promise
    publish?.(event(2))
    releaseReplay.resolve()

    expect(await stream.frames[Symbol.asyncIterator]().next()).toMatchObject({
      done: false,
      value: { id: "stream_a:1", data: { sequence: 1 } }
    })
    expect(await stream.frames[Symbol.asyncIterator]().next()).toMatchObject({
      done: false,
      value: { id: "stream_a:2", data: { sequence: 2 } }
    })

    stream.close()
    await stream.closed
    expect(unsubscribeCount).toBe(1)
  })

  it("delivers sequence zero when a new stream has no cursor", async () => {
    let publish: ((event: AgentHostEvent) => void) | undefined
    const stream = createRemoteAgentHostEventStream({
      subscribe(listener) {
        publish = listener
        return () => undefined
      },
      replay: async (request) => replayResponse(request, [], 0)
    })

    publish?.(event(0))
    expect(await nextFrame(stream)).toMatchObject({
      id: "stream_a:0",
      data: { sequence: 0 }
    })
    stream.close()
    await stream.closed
  })

  it("suppresses duplicate replay/live events at the accepted cursor", async () => {
    const replayStarted = deferred<void>()
    const releaseReplay = deferred<void>()
    let publish: ((event: AgentHostEvent) => void) | undefined
    const stream = createRemoteAgentHostEventStream({
      cursor: { streamId: "stream_a", afterSequence: 0 },
      subscribe(listener) {
        publish = listener
        return () => undefined
      },
      async replay(request) {
        replayStarted.resolve()
        await releaseReplay.promise
        publish?.(event(1))
        publish?.(event(2))
        return replayResponse(request, [event(1)], 1)
      }
    })

    await replayStarted.promise
    releaseReplay.resolve()
    expect(await nextFrame(stream)).toMatchObject({ id: "stream_a:1" })
    expect(await nextFrame(stream)).toMatchObject({ id: "stream_a:2" })
    stream.close()
  })

  it("emits a reset and closes when replay reports a gap", async () => {
    let unsubscribeCount = 0
    const stream = createRemoteAgentHostEventStream({
      cursor: { streamId: "stream_a", afterSequence: 4 },
      subscribe() {
        return () => {
          unsubscribeCount += 1
        }
      },
      async replay(request) {
        return {
          kind: "wanex.agent-host.events.replay.response",
          requestId: request.requestId,
          outcome: "gap",
          gap: {
            reason: "cursor_before_window",
            canonicalReadRequired: true
          }
        }
      }
    })

    await expect(nextFrame(stream)).resolves.toMatchObject({
      event: "agent_host_reset",
      data: {
        reason: "gap",
        canonicalReadRequired: true,
        streamId: "stream_a",
        latestSequence: 4
      }
    })
    await expect(stream.frames[Symbol.asyncIterator]().next()).resolves.toMatchObject({
      done: true
    })
    await stream.closed
    expect(unsubscribeCount).toBe(1)
  })

  it("emits a reset when live events overflow the replay buffer", async () => {
    const replayStarted = deferred<void>()
    const releaseReplay = deferred<void>()
    let publish: ((event: AgentHostEvent) => void) | undefined
    const stream = createRemoteAgentHostEventStream({
      cursor: { streamId: "stream_a", afterSequence: 0 },
      maxPendingEvents: 1,
      subscribe(listener) {
        publish = listener
        return () => undefined
      },
      async replay(request) {
        replayStarted.resolve()
        await releaseReplay.promise
        return replayResponse(request, [], 0)
      }
    })

    await replayStarted.promise
    publish?.(event(1))
    publish?.(event(2))
    expect(await nextFrame(stream)).toMatchObject({
      event: "agent_host_reset",
      data: { reason: "overflow", canonicalReadRequired: true }
    })
    releaseReplay.resolve()
    await stream.closed
  })

  it("detects replacement streams and sequence gaps after live delivery starts", async () => {
    let publish: ((event: AgentHostEvent) => void) | undefined
    const stream = createRemoteAgentHostEventStream({
      subscribe(listener) {
        publish = listener
        return () => undefined
      },
      async replay() {
        return replayResponse(
          { kind: "wanex.agent-host.events.replay.request", requestId: "request", streamId: "stream_a", afterSequence: 0, limit: 64 },
          [],
          0
        )
      }
    })

    publish?.(event(1))
    expect(await nextFrame(stream)).toMatchObject({ id: "stream_a:1" })
    publish?.(event(3))
    expect(await nextFrame(stream)).toMatchObject({
      event: "agent_host_reset",
      data: { reason: "gap" }
    })
    await stream.closed
  })

  it("requires canonical recovery when the replay page is not usable", async () => {
    const stream = createRemoteAgentHostEventStream({
      cursor: { streamId: "stream_a", afterSequence: 0 },
      subscribe: () => () => undefined,
      async replay(request): Promise<AgentHostEventReplayResponse> {
        return {
          kind: "wanex.agent-host.events.replay.response",
          requestId: request.requestId,
          outcome: "replayed"
        }
      }
    })

    expect(await nextFrame(stream)).toMatchObject({
      event: "agent_host_reset",
      data: { reason: "unavailable", canonicalReadRequired: true }
    })
    await stream.closed
  })

  it("does not skip a missing sequence inside a replay page", async () => {
    let replayCalls = 0
    const stream = createRemoteAgentHostEventStream({
      cursor: { streamId: "stream_a", afterSequence: 0 },
      subscribe: () => () => undefined,
      async replay(request) {
        replayCalls += 1
        return replayCalls === 1
          ? replayResponse(request, [event(1)], 1, true)
          : replayResponse(request, [event(3)], 3)
      }
    })

    expect(await nextFrame(stream)).toMatchObject({ id: "stream_a:1" })
    expect(await nextFrame(stream)).toMatchObject({
      event: "agent_host_reset",
      data: { reason: "gap", canonicalReadRequired: true, latestSequence: 1 }
    })
    await stream.closed
  })

  it("stops when a replay page claims more data without advancing", async () => {
    const stream = createRemoteAgentHostEventStream({
      cursor: { streamId: "stream_a", afterSequence: 0 },
      subscribe: () => () => undefined,
      async replay(request) {
        return replayResponse(request, [], 0, true)
      }
    })

    expect(await nextFrame(stream)).toMatchObject({
      event: "agent_host_reset",
      data: { reason: "unavailable", canonicalReadRequired: true }
    })
    await stream.closed
  })

  it("allows shutdown to override a reset waiting for a slow consumer", async () => {
    const replayStarted = deferred<void>()
    const releaseReplay = deferred<void>()
    const stream = createRemoteAgentHostEventStream({
      cursor: { streamId: "stream_a", afterSequence: 0 },
      subscribe: () => () => undefined,
      async replay(request) {
        replayStarted.resolve()
        await releaseReplay.promise
        return {
          kind: "wanex.agent-host.events.replay.response",
          requestId: request.requestId,
          outcome: "gap",
          gap: {
            reason: "cursor_before_window",
            canonicalReadRequired: true
          }
        }
      }
    })

    await replayStarted.promise
    releaseReplay.resolve()
    await Promise.resolve()
    stream.close()
    await stream.closed
  })
})

function event(sequence: number, streamId = "stream_a"): AgentHostEvent {
  return {
    kind: "wanex.agent-host.event",
    streamId,
    sequence,
    eventId: `event_${streamId}_${sequence}`,
    domain: "assistant",
    type: "assistant.test.updated",
    payload: { sequence },
    occurredAt: sequence
  }
}

function replayResponse(
  request: AgentHostEventReplayRequest,
  events: readonly AgentHostEvent[],
  latestSequence: number,
  hasMore = false
): AgentHostEventReplayResponse {
  return {
    kind: "wanex.agent-host.events.replay.response",
    requestId: request.requestId,
    outcome: "replayed",
    page: {
      streamId: request.streamId,
      events,
      earliestSequence: events[0]?.sequence ?? latestSequence,
      latestSequence,
      hasMore
    }
  }
}

async function nextFrame(
  stream: RemoteAgentHostEventStream
): Promise<RemoteAgentHostSseFrame> {
  const result = await stream.frames[Symbol.asyncIterator]().next()
  if (result.done) throw new Error("event stream closed before a frame arrived")
  return result.value
}

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T | PromiseLike<T>) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}
