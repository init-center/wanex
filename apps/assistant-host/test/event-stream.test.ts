import { EventEmitter } from "node:events"
import type { IncomingMessage, ServerResponse } from "node:http"
import type {
  SurfaceEvent,
  SurfaceEventListener
} from "@wanex/assistant/surface"
import { describe, expect, it } from "vitest"
import {
  createWebEventStream,
  parseWebEventStreamCursor
} from "../src/web-host/event-stream.js"

describe("Assistant Host Web event stream", () => {
  it("parses one bounded Last-Event-ID cursor", () => {
    expect(parseWebEventStreamCursor(undefined)).toEqual({ ok: true })
    expect(
      parseWebEventStreamCursor("surface_stream-1:42")
    ).toEqual({
      ok: true,
      cursor: {
        streamId: "surface_stream-1",
        afterSequence: 42
      }
    })
    expect(parseWebEventStreamCursor(["a:1", "a:2"])).toMatchObject({
      ok: false
    })
    expect(parseWebEventStreamCursor("unsafe stream:1")).toMatchObject({
      ok: false
    })
    expect(
      parseWebEventStreamCursor("surface_stream:9007199254740992")
    ).toMatchObject({ ok: false })
  })

  it("stops production and emits one reset when a blocked writer overflows", async () => {
    const incoming = new EventEmitter()
    const response = new BlockingServerResponse()
    let listener: SurfaceEventListener | undefined
    let unsubscribeCount = 0
    const connection = createWebEventStream({
      source: {
        async readSurfaceEvents() {
          return {
            ok: true,
            streamId: "backpressure_stream",
            earliestSequence: 1,
            latestSequence: 0,
            gap: false,
            hasMore: false,
            events: []
          }
        },
        subscribeSurfaceEvents(nextListener) {
          listener = nextListener
          return () => {
            unsubscribeCount += 1
            listener = undefined
          }
        }
      },
      request: incoming as unknown as IncomingMessage,
      response: response as unknown as ServerResponse,
      keepaliveIntervalMs: 60_000
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(listener).toBeDefined()

    for (let sequence = 1; sequence <= 20; sequence += 1) {
      listener?.(largeDeltaEvent(sequence))
    }

    expect(unsubscribeCount).toBe(1)
    expect(response.writes).toHaveLength(1)
    expect(response.writes[0]).toContain("event: surface_event")

    response.emit("drain")
    await connection.closed

    expect(response.writes).toHaveLength(2)
    expect(response.writes[1]).toContain("event: surface_reset")
    expect(response.writes[1]).toContain('"reason":"overflow"')
    expect(response.writableEnded).toBe(true)
  })
})

class BlockingServerResponse extends EventEmitter {
  statusCode = 0
  writableEnded = false
  destroyed = false
  readonly headers = new Map<string, string | number | readonly string[]>()
  readonly writes: string[] = []
  private blockNextWrite = true

  setHeader(
    name: string,
    value: string | number | readonly string[]
  ): this {
    this.headers.set(name.toLowerCase(), value)
    return this
  }

  flushHeaders(): void {}

  write(chunk: string): boolean {
    this.writes.push(chunk)
    if (this.blockNextWrite) {
      this.blockNextWrite = false
      return false
    }
    return true
  }

  end(): this {
    this.writableEnded = true
    return this
  }
}

function largeDeltaEvent(sequence: number): SurfaceEvent {
  return {
    id: `backpressure_stream:${sequence}`,
    sequence,
    type: "assistant.surface.conversation.assistant-text-delta",
    command: "conversation.readTrackedConversationOperation",
    at: sequence,
    conversation: {
      kind: "assistant.conversation.assistant-text-delta",
      sequence,
      at: sequence,
      operationId: "operation_backpressure",
      sessionId: "session_backpressure",
      partId: `part_${sequence}`,
      text: "x".repeat(50_000),
      truncated: false
    }
  }
}
