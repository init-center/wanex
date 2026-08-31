import { randomUUID } from "node:crypto"
import {
  AGENT_HOST_MAX_EVENT_PAGE_SIZE,
  isAgentHostServerMessage,
  type AgentHostEvent,
  type AgentHostEventReplayRequest,
  type AgentHostEventReplayResponse,
  type JsonValue
} from "@wanex/protocol"

export const REMOTE_AGENT_HOST_SSE_EVENT_PATH =
  "/v1/agent-host/events" as const
export const REMOTE_AGENT_HOST_SSE_EVENT_NAME = "agent_host_event" as const
export const REMOTE_AGENT_HOST_SSE_RESET_NAME = "agent_host_reset" as const

const DEFAULT_REPLAY_PAGE_LIMIT = 64
const DEFAULT_MAX_REPLAY_PAGES = 128
const DEFAULT_MAX_PENDING_EVENTS = 64
const DEFAULT_MAX_PENDING_EVENT_BYTES = 256 * 1024
const DEFAULT_MAX_EVENT_FRAME_BYTES = 64 * 1024

export type RemoteAgentHostEventStreamResetReason =
  | "gap"
  | "overflow"
  | "stream_replaced"
  | "unavailable"

export interface RemoteAgentHostEventStreamReset {
  readonly reason: RemoteAgentHostEventStreamResetReason
  readonly canonicalReadRequired: true
  readonly streamId?: string
  readonly latestSequence: number
}

export interface RemoteAgentHostEventStreamCursor {
  readonly streamId: string
  readonly afterSequence: number
}

export type RemoteAgentHostEventStreamCursorResult =
  | { readonly ok: true; readonly cursor?: RemoteAgentHostEventStreamCursor }
  | { readonly ok: false; readonly message: string }

export interface RemoteAgentHostSseFrame {
  readonly event: typeof REMOTE_AGENT_HOST_SSE_EVENT_NAME | typeof REMOTE_AGENT_HOST_SSE_RESET_NAME
  readonly id?: string
  readonly data: JsonValue
}

export interface RemoteAgentHostEventStream {
  readonly frames: AsyncIterable<RemoteAgentHostSseFrame>
  readonly closed: Promise<void>
  close(): void
}

export interface RemoteAgentHostEventStreamOptions {
  readonly cursor?: RemoteAgentHostEventStreamCursor
  readonly subscribe: (
    listener: (event: AgentHostEvent) => void
  ) => () => void
  readonly replay: (
    request: AgentHostEventReplayRequest
  ) => Promise<AgentHostEventReplayResponse>
  readonly createRequestId?: () => string
  readonly replayPageLimit?: number
  readonly maxReplayPages?: number
  readonly maxPendingEvents?: number
  readonly maxPendingEventBytes?: number
  readonly maxEventFrameBytes?: number
  readonly onClose?: () => void
}

export function parseRemoteAgentHostEventStreamCursor(
  value: string | undefined
): RemoteAgentHostEventStreamCursorResult {
  if (value === undefined) return { ok: true }
  const separator = value.lastIndexOf(":")
  const streamId = value.slice(0, separator)
  const sequenceText = value.slice(separator + 1)
  if (
    separator <= 0 ||
    !/^[A-Za-z0-9._:-]{1,200}$/.test(streamId) ||
    !/^(0|[1-9]\d*)$/.test(sequenceText)
  ) {
    return {
      ok: false,
      message: "Last-Event-ID is not a valid Agent Host event cursor"
    }
  }
  const afterSequence = Number(sequenceText)
  if (!Number.isSafeInteger(afterSequence)) {
    return {
      ok: false,
      message: "Last-Event-ID sequence is out of range"
    }
  }
  return { ok: true, cursor: { streamId, afterSequence } }
}

export function formatRemoteAgentHostEventStreamCursor(
  cursor: RemoteAgentHostEventStreamCursor
): string {
  return `${cursor.streamId}:${cursor.afterSequence}`
}

export function createRemoteAgentHostEventStream(
  options: RemoteAgentHostEventStreamOptions
): RemoteAgentHostEventStream {
  const replayPageLimit = boundedPositive(
    options.replayPageLimit,
    DEFAULT_REPLAY_PAGE_LIMIT,
    AGENT_HOST_MAX_EVENT_PAGE_SIZE
  )
  const maxReplayPages = boundedPositive(
    options.maxReplayPages,
    DEFAULT_MAX_REPLAY_PAGES,
    DEFAULT_MAX_REPLAY_PAGES
  )
  const maxPendingEvents = boundedPositive(
    options.maxPendingEvents,
    DEFAULT_MAX_PENDING_EVENTS,
    DEFAULT_MAX_PENDING_EVENTS
  )
  const maxPendingEventBytes = boundedPositive(
    options.maxPendingEventBytes,
    DEFAULT_MAX_PENDING_EVENT_BYTES,
    DEFAULT_MAX_PENDING_EVENT_BYTES
  )
  const maxEventFrameBytes = boundedPositive(
    options.maxEventFrameBytes,
    DEFAULT_MAX_EVENT_FRAME_BYTES,
    DEFAULT_MAX_EVENT_FRAME_BYTES
  )
  const createRequestId = options.createRequestId ?? randomUUID
  const queue = new BoundedFrameQueue(maxPendingEventBytes, maxEventFrameBytes)
  const pendingLive: AgentHostEvent[] = []
  let pendingLiveBytes = 0
  let currentStreamId = options.cursor?.streamId
  let cursor = options.cursor?.afterSequence ?? -1
  let replaying = true
  let closing = false
  let closed = false
  let unsubscribe: (() => void) | undefined
  let finalized = false
  const closedPromise = deferred<void>()

  unsubscribe = options.subscribe(acceptLive)
  void replay().catch(() => resetAndClose("unavailable"))

  const stream: RemoteAgentHostEventStream = {
    frames: queue,
    closed: closedPromise.promise,
    close() {
      if (closed) return
      closing = true
      unsubscribe?.()
      unsubscribe = undefined
      queue.close()
      finalize()
    }
  }

  return Object.freeze(stream)

  function acceptLive(event: AgentHostEvent): void {
    if (closed || closing) return
    if (currentStreamId === undefined) {
      if (replaying) {
        addPendingLive(event)
        return
      }
      currentStreamId = event.streamId
      cursor = event.sequence - 1
    }
    if (event.streamId !== currentStreamId) {
      if (replaying) {
        addPendingLive(event)
      } else {
        resetAndClose("stream_replaced")
      }
      return
    }
    if (event.sequence <= cursor) return
    if (replaying) {
      addPendingLive(event)
      return
    }
    if (event.sequence !== cursor + 1) {
      resetAndClose("gap")
      return
    }
    emitEvent(event)
  }

  function addPendingLive(event: AgentHostEvent): void {
    const bytes = jsonSize(event)
    if (
      pendingLive.length >= maxPendingEvents ||
      pendingLiveBytes + bytes > maxPendingEventBytes
    ) {
      resetAndClose("overflow")
      return
    }
    pendingLive.push(event)
    pendingLiveBytes += bytes
  }

  async function replay(): Promise<void> {
    if (options.cursor === undefined) {
      replaying = false
      flushPendingLive()
      return
    }

    let pageCount = 0
    let nextAfterSequence = options.cursor.afterSequence
    for (;;) {
      if (closed || closing) return
      pageCount += 1
      if (pageCount > maxReplayPages) {
        resetAndClose("overflow")
        return
      }
      const page = await options.replay({
        kind: "wanex.agent-host.events.replay.request",
        requestId: createRequestId(),
        streamId: options.cursor.streamId,
        afterSequence: nextAfterSequence,
        limit: replayPageLimit
      })
      if (closed || closing) return
      if (!isAgentHostServerMessage(page) || page.kind !== "wanex.agent-host.events.replay.response") {
        resetAndClose("unavailable")
        return
      }
      if (page.outcome === "gap" || page.gap !== undefined) {
        resetAndClose("gap")
        return
      }
      if (page.page === undefined) {
        resetAndClose("unavailable")
        return
      }
      if (
        currentStreamId !== undefined &&
        page.page.streamId !== currentStreamId
      ) {
        resetAndClose("stream_replaced")
        return
      }
      currentStreamId = page.page.streamId
      for (const event of page.page.events) {
        if (event.streamId !== currentStreamId) {
          resetAndClose("stream_replaced")
          return
        }
        if (event.sequence <= cursor) continue
        if (event.sequence !== cursor + 1) {
          resetAndClose("gap")
          return
        }
        emitEvent(event)
        if (closed || closing) return
      }
      if (page.page.latestSequence < cursor) {
        resetAndClose("unavailable")
        return
      }
      if (page.page.hasMore && cursor === nextAfterSequence) {
        resetAndClose("unavailable")
        return
      }
      if (!page.page.hasMore && page.page.latestSequence > cursor) {
        resetAndClose("unavailable")
        return
      }
      nextAfterSequence = cursor
      if (!page.page.hasMore) break
    }

    replaying = false
    flushPendingLive()
  }

  function flushPendingLive(): void {
    pendingLive.sort((left, right) => left.sequence - right.sequence)
    const buffered = pendingLive.splice(0)
    pendingLiveBytes = 0
    for (const event of buffered) {
      if (closed || closing) return
      if (currentStreamId === undefined) {
        currentStreamId = event.streamId
        cursor = event.sequence - 1
      }
      if (event.streamId !== currentStreamId) {
        resetAndClose("stream_replaced")
        return
      }
      if (event.sequence <= cursor) continue
      if (event.sequence !== cursor + 1) {
        resetAndClose("gap")
        return
      }
      emitEvent(event)
    }
  }

  function emitEvent(event: AgentHostEvent): void {
    const frame: RemoteAgentHostSseFrame = {
      event: REMOTE_AGENT_HOST_SSE_EVENT_NAME,
      id: formatRemoteAgentHostEventStreamCursor({
        streamId: event.streamId,
        afterSequence: event.sequence
      }),
      data: eventData(event)
    }
    if (!queue.enqueue(frame)) {
      resetAndClose("overflow")
      return
    }
    currentStreamId = event.streamId
    cursor = event.sequence
  }

  function resetAndClose(reason: RemoteAgentHostEventStreamResetReason): void {
    if (closed || closing) return
    closing = true
    unsubscribe?.()
    unsubscribe = undefined
    pendingLive.length = 0
    pendingLiveBytes = 0
    const data: Record<string, JsonValue> = {
      reason,
      canonicalReadRequired: true
    }
    if (currentStreamId !== undefined) data.streamId = currentStreamId
    data.latestSequence = Math.max(0, cursor)
    const frame: RemoteAgentHostSseFrame = {
      event: REMOTE_AGENT_HOST_SSE_RESET_NAME,
      data
    }
    queue.replaceWithFinal(frame)
    void queue.finished.then(finalize)
  }

  function finalize(): void {
    if (finalized) return
    finalized = true
    closed = true
    try {
      options.onClose?.()
    } catch {
      // Cleanup observers cannot affect stream finalization.
    }
    closedPromise.resolve()
  }
}

class BoundedFrameQueue implements AsyncIterable<RemoteAgentHostSseFrame> {
  readonly finished: Promise<void>
  private readonly queue: RemoteAgentHostSseFrame[] = []
  private readonly waiters: Array<(
    result: IteratorResult<RemoteAgentHostSseFrame>
  ) => void> = []
  private queueBytes = 0
  private closed = false
  private finishRequested = false
  private readonly finishedDeferred = deferred<void>()

  constructor(
    private readonly maxQueueBytes: number,
    private readonly maxFrameBytes: number
  ) {
    this.finished = this.finishedDeferred.promise
  }

  [Symbol.asyncIterator](): AsyncIterator<RemoteAgentHostSseFrame> {
    return this
  }

  next(): Promise<IteratorResult<RemoteAgentHostSseFrame>> {
    const frame = this.queue.shift()
    if (frame !== undefined) {
      this.queueBytes -= jsonSize(frame)
      this.resolveFinishedIfDrained()
      return Promise.resolve({ value: frame, done: false })
    }
    if (this.closed || this.finishRequested) {
      this.resolveFinishedIfDrained()
      return Promise.resolve({ value: undefined, done: true })
    }
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  enqueue(frame: RemoteAgentHostSseFrame): boolean {
    if (this.closed || this.finishRequested) return false
    const bytes = jsonSize(frame)
    if (bytes > this.maxFrameBytes || this.queueBytes + bytes > this.maxQueueBytes) {
      return false
    }
    const waiter = this.waiters.shift()
    if (waiter !== undefined) {
      waiter({ value: frame, done: false })
      return true
    }
    this.queue.push(frame)
    this.queueBytes += bytes
    return true
  }

  replaceWithFinal(frame: RemoteAgentHostSseFrame): void {
    if (this.closed) return
    this.queue.length = 0
    this.queueBytes = 0
    this.finishRequested = true
    if (this.enqueueFinal(frame)) return
    this.resolveFinishedIfDrained()
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.queue.length = 0
    this.queueBytes = 0
    for (const waiter of this.waiters.splice(0)) {
      waiter({ value: undefined, done: true })
    }
    this.finishedDeferred.resolve()
  }

  private enqueueFinal(frame: RemoteAgentHostSseFrame): boolean {
    const bytes = jsonSize(frame)
    if (bytes > this.maxFrameBytes || bytes > this.maxQueueBytes) return false
    const waiter = this.waiters.shift()
    if (waiter !== undefined) {
      waiter({ value: frame, done: false })
      this.resolveFinishedIfDrained()
      return true
    }
    this.queue.push(frame)
    this.queueBytes = bytes
    return true
  }

  private resolveFinishedIfDrained(): void {
    if (
      (this.closed || this.finishRequested) &&
      this.queue.length === 0 &&
      this.waiters.length === 0
    ) {
      this.finishedDeferred.resolve()
    }
  }
}

function boundedPositive(
  value: number | undefined,
  fallback: number,
  maximum: number
): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`remote Agent Host event stream limit must be between 1 and ${maximum}`)
  }
  return value
}

function jsonSize(value: unknown): number {
  try {
    const json = JSON.stringify(value)
    return json === undefined ? Number.POSITIVE_INFINITY : Buffer.byteLength(json)
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function eventData(event: AgentHostEvent): JsonValue {
  return {
    kind: event.kind,
    streamId: event.streamId,
    sequence: event.sequence,
    eventId: event.eventId,
    domain: event.domain,
    type: event.type,
    payload: event.payload,
    occurredAt: event.occurredAt
  }
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
