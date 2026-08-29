import type { IncomingMessage, ServerResponse } from "node:http"
import type {
  ReadSurfaceEventsRequest,
  SurfaceClient,
  SurfaceEvent
} from "@wanex/assistant/surface"
import { setWebSecurityHeaders } from "./response.js"

const REPLAY_PAGE_LIMIT = 64
const MAX_REPLAY_PAGES = 128
const MAX_PENDING_LIVE_EVENTS = 64
const MAX_QUEUE_ITEMS = 64
const MAX_QUEUE_BYTES = 256 * 1024
const MAX_FRAME_BYTES = 64 * 1024
const KEEPALIVE_INTERVAL_MS = 15_000

export type WebEventSource = Pick<
  SurfaceClient,
  "readSurfaceEvents" | "subscribeSurfaceEvents"
>

export interface WebEventStreamCursor {
  readonly streamId: string
  readonly afterSequence: number
}

export type WebEventStreamCursorResult =
  | { readonly ok: true; readonly cursor?: WebEventStreamCursor }
  | { readonly ok: false; readonly message: string }

export interface WebEventStreamConnection {
  readonly closed: Promise<void>
  close(): void
}

export function parseWebEventStreamCursor(
  value: string | readonly string[] | undefined
): WebEventStreamCursorResult {
  if (value === undefined) {
    return { ok: true }
  }
  if (typeof value !== "string") {
    return { ok: false, message: "Last-Event-ID must occur at most once" }
  }
  const separator = value.lastIndexOf(":")
  const streamId = value.slice(0, separator)
  const sequenceText = value.slice(separator + 1)
  if (
    separator <= 0 ||
    !/^[A-Za-z0-9._-]{1,200}$/.test(streamId) ||
    !/^(0|[1-9]\d*)$/.test(sequenceText)
  ) {
    return { ok: false, message: "Last-Event-ID is not a valid surface cursor" }
  }
  const afterSequence = Number(sequenceText)
  if (!Number.isSafeInteger(afterSequence)) {
    return { ok: false, message: "Last-Event-ID sequence is out of range" }
  }
  return { ok: true, cursor: { streamId, afterSequence } }
}

export function createWebEventStream(request: {
  readonly source: WebEventSource
  readonly request: IncomingMessage
  readonly response: ServerResponse
  readonly cursor?: WebEventStreamCursor
  readonly keepaliveIntervalMs?: number
}): WebEventStreamConnection {
  let currentStreamId = request.cursor?.streamId
  let cursor = request.cursor?.afterSequence ?? 0
  let replaying = true
  let closed = false
  let closing = false
  let unsubscribe: (() => void) | undefined
  let keepalive: ReturnType<typeof setInterval> | undefined
  const pendingLive: SurfaceEvent[] = []
  const closedPromise = deferred<void>()
  const writer = new BoundedSseWriter(request.response, () => close(false))

  setWebSecurityHeaders(request.response)
  request.response.statusCode = 200
  request.response.setHeader("Content-Type", "text/event-stream; charset=utf-8")
  request.response.setHeader("Cache-Control", "no-store")
  request.response.setHeader("Connection", "keep-alive")
  request.response.setHeader("X-Accel-Buffering", "no")
  request.response.flushHeaders()

  const close = (endResponse = true): void => {
    if (closed) {
      return
    }
    closed = true
    closing = true
    unsubscribe?.()
    unsubscribe = undefined
    if (keepalive !== undefined) {
      clearInterval(keepalive)
      keepalive = undefined
    }
    pendingLive.length = 0
    writer.dispose(endResponse)
    request.request.off("aborted", onDisconnected)
    request.response.off("close", onDisconnected)
    request.response.off("error", onDisconnected)
    closedPromise.resolve()
  }
  const onDisconnected = (): void => close(false)
  request.request.once("aborted", onDisconnected)
  request.response.once("close", onDisconnected)
  request.response.once("error", onDisconnected)

  const resetAndClose = (
    reason: "gap" | "overflow" | "unavailable"
  ): void => {
    if (closed || closing) {
      return
    }
    closing = true
    unsubscribe?.()
    unsubscribe = undefined
    if (keepalive !== undefined) {
      clearInterval(keepalive)
      keepalive = undefined
    }
    pendingLive.length = 0
    writer.replaceWithFinalFrame(resetFrame({
      reason,
      ...(currentStreamId === undefined ? {} : { streamId: currentStreamId }),
      latestSequence: cursor
    }))
  }

  const acceptLive = (event: SurfaceEvent): void => {
    if (closed || closing || event.sequence <= cursor) {
      return
    }
    if (replaying || currentStreamId === undefined) {
      if (pendingLive.length >= MAX_PENDING_LIVE_EVENTS) {
        resetAndClose("overflow")
        return
      }
      pendingLive.push(event)
      return
    }
    if (event.sequence !== cursor + 1) {
      resetAndClose("gap")
      return
    }
    cursor = event.sequence
    if (!writer.enqueue(eventFrame(currentStreamId, event))) {
      resetAndClose("overflow")
    }
  }

  unsubscribe = request.source.subscribeSurfaceEvents(acceptLive)
  keepalive = setInterval(() => {
    writer.tryEnqueueComment(`keepalive ${Date.now()}`)
  }, request.keepaliveIntervalMs ?? KEEPALIVE_INTERVAL_MS)
  keepalive.unref?.()

  void replay().catch(() => resetAndClose("unavailable"))

  return {
    closed: closedPromise.promise,
    close
  }

  async function replay(): Promise<void> {
    let pageCount = 0
    let nextRequest: ReadSurfaceEventsRequest = {
      limit: REPLAY_PAGE_LIMIT,
      ...(currentStreamId === undefined
        ? {}
        : { streamId: currentStreamId, afterSequence: cursor })
    }
    for (;;) {
      if (closed || closing) {
        return
      }
      pageCount += 1
      if (pageCount > MAX_REPLAY_PAGES) {
        resetAndClose("overflow")
        return
      }
      const page = await request.source.readSurfaceEvents(nextRequest)
      if (closed || closing) {
        return
      }
      if (!page.ok) {
        resetAndClose("unavailable")
        return
      }
      currentStreamId = page.streamId
      if (page.gap) {
        cursor = page.latestSequence
        if (!writer.enqueue(resetFrame({
          reason: "gap",
          streamId: page.streamId,
          earliestSequence: page.earliestSequence,
          latestSequence: page.latestSequence
        }))) {
          resetAndClose("overflow")
          return
        }
        break
      }
      for (const event of page.events) {
        if (event.sequence <= cursor) {
          continue
        }
        cursor = event.sequence
        if (!writer.enqueue(eventFrame(page.streamId, event))) {
          resetAndClose("overflow")
          return
        }
      }
      if (!page.hasMore) {
        cursor = Math.max(cursor, page.latestSequence)
        break
      }
      nextRequest = {
        streamId: page.streamId,
        afterSequence: cursor,
        limit: REPLAY_PAGE_LIMIT
      }
    }

    replaying = false
    pendingLive.sort((left, right) => left.sequence - right.sequence)
    const buffered = pendingLive.splice(0)
    for (const event of buffered) {
      acceptLive(event)
      if (closed || closing) {
        return
      }
    }
  }
}

class BoundedSseWriter {
  private readonly queue: string[] = []
  private queueBytes = 0
  private draining = false
  private closeAfterDrain = false
  private disposed = false

  constructor(
    private readonly response: ServerResponse,
    private readonly onClosed: () => void
  ) {}

  enqueue(frame: string): boolean {
    if (this.disposed || !this.canQueue(frame)) {
      return false
    }
    this.queue.push(frame)
    this.queueBytes += Buffer.byteLength(frame)
    void this.drain()
    return true
  }

  tryEnqueueComment(comment: string): void {
    this.enqueue(`: ${comment.replace(/[\r\n]/g, " ")}\n\n`)
  }

  replaceWithFinalFrame(frame: string): void {
    if (this.disposed) {
      return
    }
    this.queue.length = 0
    this.queueBytes = 0
    if (Buffer.byteLength(frame) <= MAX_FRAME_BYTES) {
      this.queue.push(frame)
      this.queueBytes = Buffer.byteLength(frame)
    }
    this.closeAfterDrain = true
    void this.drain()
  }

  dispose(endResponse: boolean): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.queue.length = 0
    this.queueBytes = 0
    if (endResponse && !this.response.writableEnded) {
      this.response.end()
    }
  }

  private canQueue(frame: string): boolean {
    const bytes = Buffer.byteLength(frame)
    return (
      bytes <= MAX_FRAME_BYTES &&
      this.queue.length < MAX_QUEUE_ITEMS &&
      this.queueBytes + bytes <= MAX_QUEUE_BYTES
    )
  }

  private async drain(): Promise<void> {
    if (this.draining || this.disposed) {
      return
    }
    this.draining = true
    try {
      while (!this.disposed && this.queue.length > 0) {
        const frame = this.queue.shift()!
        this.queueBytes -= Buffer.byteLength(frame)
        const writable = this.response.write(frame)
        if (!writable) {
          await waitForDrainOrClose(this.response)
        }
      }
      if (!this.disposed && this.closeAfterDrain) {
        this.response.end()
        this.onClosed()
      }
    } catch {
      this.onClosed()
    } finally {
      this.draining = false
    }
  }
}

function eventFrame(streamId: string, event: SurfaceEvent): string {
  return sseFrame({
    event: "surface_event",
    id: `${streamId}:${event.sequence}`,
    data: {
      kind: "assistant.surface-stream.event",
      streamId,
      event
    }
  })
}

function resetFrame(request: {
  readonly reason: "gap" | "overflow" | "unavailable"
  readonly streamId?: string
  readonly earliestSequence?: number
  readonly latestSequence: number
}): string {
  return sseFrame({
    event: "surface_reset",
    data: {
      kind: "assistant.surface-stream.reset",
      reason: request.reason,
      ...(request.streamId === undefined ? {} : { streamId: request.streamId }),
      ...(request.earliestSequence === undefined
        ? {}
        : { earliestSequence: request.earliestSequence }),
      latestSequence: request.latestSequence
    }
  })
}

function sseFrame(request: {
  readonly event: string
  readonly id?: string
  readonly data: unknown
}): string {
  return [
    ...(request.id === undefined ? [] : [`id: ${request.id}`]),
    `event: ${request.event}`,
    `data: ${JSON.stringify(request.data)}`,
    "",
    ""
  ].join("\n")
}

async function waitForDrainOrClose(response: ServerResponse): Promise<void> {
  if (response.destroyed || response.writableEnded) {
    return
  }
  await new Promise<void>((resolve) => {
    const finish = (): void => {
      response.off("drain", finish)
      response.off("close", finish)
      response.off("error", finish)
      resolve()
    }
    response.once("drain", finish)
    response.once("close", finish)
    response.once("error", finish)
  })
}

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}
