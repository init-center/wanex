import { isAgentHostServerMessage } from "@wanex/protocol"
import {
  REMOTE_AGENT_HOST_SESSION_HEADER
} from "./remote-http.js"
import {
  parseRemoteAgentHostEventStreamCursor,
  REMOTE_AGENT_HOST_SSE_EVENT_NAME,
  REMOTE_AGENT_HOST_SSE_EVENT_PATH,
  REMOTE_AGENT_HOST_SSE_RESET_NAME,
  type RemoteAgentHostEventStreamCursor,
  type RemoteAgentHostEventStreamReset
} from "./remote-event-stream.js"
import {
  parseRemoteEventStreamReset,
  parseRemoteSseJson,
  readRemoteSseFrames,
  RemoteSseProtocolError
} from "./remote-sse-parser.js"

const DEFAULT_MAX_FRAME_BYTES = 64 * 1024
const DEFAULT_RECONNECT_INITIAL_DELAY_MS = 250
const DEFAULT_RECONNECT_MAX_DELAY_MS = 10_000
const MAX_RECONNECT_DELAY_MS = 120_000

export type RemoteAgentHostHttpClientEventStreamState =
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"

export interface RemoteAgentHostHttpClientEventStreamOptions {
  readonly maxFrameBytes?: number
  readonly connectTimeoutMs?: number
  readonly reconnectInitialDelayMs?: number
  readonly reconnectMaxDelayMs?: number
  readonly onStateChange?: (
    state: RemoteAgentHostHttpClientEventStreamState
  ) => void
  readonly onReset?: (reset: RemoteAgentHostEventStreamReset) => void
  readonly onError?: (error: Error) => void
}

export interface RemoteAgentHostHttpClientEventStream {
  readonly ready: Promise<void>
  readonly closed: Promise<void>
  close(): void
}

export interface RemoteAgentHostHttpEventClientOptions {
  readonly messageUrl: string
  readonly fetch: typeof globalThis.fetch
  readonly getBearerToken: () => Promise<string>
  readonly getSessionId: () => string | undefined
  readonly isClosed: () => boolean
  readonly listeners: Set<(event: unknown) => void>
  readonly requestTimeoutMs: number
  readonly maxFrameBytes: number
  readonly onAuthenticationFailure?: () => void
}

export interface RemoteAgentHostHttpEventClient {
  connectEvents(
    options?: RemoteAgentHostHttpClientEventStreamOptions
  ): RemoteAgentHostHttpClientEventStream
  close(): Promise<void>
}

export function createRemoteAgentHostHttpEventClient(
  options: RemoteAgentHostHttpEventClientOptions
): RemoteAgentHostHttpEventClient {
  const eventUrl = normalizeEventUrl(options.messageUrl)
  let activeEventStream: RemoteAgentHostHttpClientEventStream | undefined

  return Object.freeze({ connectEvents, close })

  function connectEvents(
    streamOptions: RemoteAgentHostHttpClientEventStreamOptions = {}
  ): RemoteAgentHostHttpClientEventStream {
    if (options.isClosed()) {
      throw new Error("remote Agent Host HTTP client is closed")
    }
    if (options.getSessionId() === undefined) {
      throw new Error("remote Agent Host handshake is required")
    }
    if (activeEventStream !== undefined) {
      throw new Error("remote Agent Host event stream is already open")
    }

    const maxFrameBytes = boundedInteger(
      streamOptions.maxFrameBytes,
      Math.min(DEFAULT_MAX_FRAME_BYTES, options.maxFrameBytes),
      1,
      options.maxFrameBytes
    )
    const connectTimeoutMs = boundedInteger(
      streamOptions.connectTimeoutMs,
      options.requestTimeoutMs,
      1,
      120_000
    )
    const reconnectInitialDelayMs = boundedInteger(
      streamOptions.reconnectInitialDelayMs,
      DEFAULT_RECONNECT_INITIAL_DELAY_MS,
      1,
      MAX_RECONNECT_DELAY_MS
    )
    const reconnectMaxDelayMs = boundedInteger(
      streamOptions.reconnectMaxDelayMs,
      DEFAULT_RECONNECT_MAX_DELAY_MS,
      reconnectInitialDelayMs,
      MAX_RECONNECT_DELAY_MS
    )
    const ready = deferred<void>()
    const closed = deferred<void>()
    let stopped = false
    let readySettled = false
    let controller: AbortController | undefined
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let wakeReconnect: (() => void) | undefined
    let cursor: RemoteAgentHostEventStreamCursor | undefined
    let state: RemoteAgentHostHttpClientEventStreamState = "connecting"

    const stream: RemoteAgentHostHttpClientEventStream = {
      ready: ready.promise,
      closed: closed.promise,
      close() {
        stop()
      }
    }
    activeEventStream = stream
    notifyState(state)
    void ready.promise.catch(() => undefined)
    void run()
    return Object.freeze(stream)

    async function run(): Promise<void> {
      let attempts = 0
      try {
        while (!stopped && !options.isClosed()) {
          setState(attempts === 0 ? "connecting" : "reconnecting")
          try {
            const connection = await openEventConnection(connectTimeoutMs)
            attempts = 0
            if (!readySettled) {
              readySettled = true
              ready.resolve()
            }
            setState("open")
            await consumeEventConnection(connection, maxFrameBytes)
            connection.controller.abort()
            if (stopped || options.isClosed()) break
            attempts = Math.max(1, attempts + 1)
          } catch (error) {
            if (stopped || options.isClosed()) break
            if (isTerminalEventStreamError(error)) {
              terminate(toError(error))
              break
            }
            attempts += 1
          }
          if (stopped || options.isClosed()) break
          const delayMs = Math.min(
            reconnectMaxDelayMs,
            reconnectInitialDelayMs * 2 ** Math.min(attempts - 1, 20)
          )
          await waitForReconnect(delayMs)
        }
      } finally {
        controller?.abort()
        if (reconnectTimer !== undefined) clearTimeout(reconnectTimer)
        reconnectTimer = undefined
        wakeReconnect?.()
        wakeReconnect = undefined
        if (!readySettled) {
          readySettled = true
          ready.reject(new Error("remote Agent Host event stream was closed"))
        }
        setState("closed")
        if (activeEventStream === stream) activeEventStream = undefined
        closed.resolve()
      }
    }

    async function openEventConnection(timeoutMs: number): Promise<{
      readonly reader: ReadableStreamDefaultReader<Uint8Array>
      readonly controller: AbortController
    }> {
      let bearer: string
      try {
        bearer = await options.getBearerToken()
      } catch (error) {
        throw terminalEventStreamError(toError(error).message)
      }
      const sessionId = options.getSessionId()
      if (sessionId === undefined) {
        throw terminalEventStreamError("remote Agent Host handshake is required")
      }
      const nextController = new AbortController()
      controller = nextController
      const timer = setTimeout(() => nextController.abort(), timeoutMs)
      timer.unref?.()
      let responseReceived = false
      try {
        const headers: Record<string, string> = {
          accept: "text/event-stream",
          authorization: `Bearer ${bearer}`,
          [REMOTE_AGENT_HOST_SESSION_HEADER]: sessionId
        }
        if (cursor !== undefined) {
          headers["last-event-id"] = `${cursor.streamId}:${cursor.afterSequence}`
        }
        const response = await options.fetch(eventUrl, {
          method: "GET",
          headers,
          signal: nextController.signal
        })
        responseReceived = true
        if (response.status === 401 || response.status === 403) {
          options.onAuthenticationFailure?.()
          nextController.abort()
          throw terminalEventStreamError(
            "remote Agent Host event stream authentication failed"
          )
        }
        if (!response.ok) {
          nextController.abort()
          if (response.status >= 500) {
            throw retryableEventStreamError(
              `remote Agent Host event stream returned HTTP ${response.status}`
            )
          }
          throw terminalEventStreamError(
            `remote Agent Host event stream returned HTTP ${response.status}`
          )
        }
        const contentType = response.headers.get("content-type") ?? ""
        if (!contentType.toLowerCase().includes("text/event-stream")) {
          nextController.abort()
          throw terminalEventStreamError(
            "remote Agent Host event stream content type is invalid"
          )
        }
        if (response.body === null) {
          nextController.abort()
          throw retryableEventStreamError(
            "remote Agent Host event stream response has no body"
          )
        }
        return { reader: response.body.getReader(), controller: nextController }
      } catch (error) {
        if (
          nextController.signal.aborted &&
          !responseReceived &&
          !stopped &&
          !options.isClosed()
        ) {
          throw retryableEventStreamError(
            "remote Agent Host event stream connection timed out"
          )
        }
        throw error
      } finally {
        clearTimeout(timer)
      }
    }

    async function consumeEventConnection(
      connection: {
        readonly reader: ReadableStreamDefaultReader<Uint8Array>
        readonly controller: AbortController
      },
      frameLimit: number
    ): Promise<void> {
      try {
        for await (const frame of readRemoteSseFrames(connection.reader, frameLimit)) {
          if (stopped || options.isClosed()) return
          if (frame.event === REMOTE_AGENT_HOST_SSE_EVENT_NAME) {
            const value = parseRemoteSseJson(frame.data)
            if (!isAgentHostServerMessage(value) || value.kind !== "wanex.agent-host.event") {
              throw terminalEventStreamError(
                "remote Agent Host SSE event payload is invalid"
              )
            }
            const frameCursor = parseRemoteAgentHostEventStreamCursor(frame.id)
            if (!frameCursor.ok || frameCursor.cursor === undefined) {
              throw terminalEventStreamError(
                "remote Agent Host SSE event cursor is invalid"
              )
            }
            if (
              frameCursor.cursor.streamId !== value.streamId ||
              frameCursor.cursor.afterSequence !== value.sequence
            ) {
              throw terminalEventStreamError(
                "remote Agent Host SSE event cursor does not match its payload"
              )
            }
            if (cursor !== undefined) {
              if (cursor.streamId !== value.streamId) {
                terminateWithReset({
                  reason: "stream_replaced",
                  canonicalReadRequired: true,
                  streamId: cursor.streamId,
                  latestSequence: cursor.afterSequence
                })
                return
              }
              if (value.sequence <= cursor.afterSequence) continue
              if (value.sequence !== cursor.afterSequence + 1) {
                terminateWithReset({
                  reason: "gap",
                  canonicalReadRequired: true,
                  streamId: cursor.streamId,
                  latestSequence: cursor.afterSequence
                })
                return
              }
            }
            cursor = frameCursor.cursor
            for (const listener of options.listeners) {
              try {
                listener(value)
              } catch {
                // One client listener cannot affect the shared event stream.
              }
            }
            continue
          }
          if (frame.event === REMOTE_AGENT_HOST_SSE_RESET_NAME) {
            const reset = parseRemoteEventStreamReset(parseRemoteSseJson(frame.data))
            if (reset === undefined) {
              throw terminalEventStreamError(
                "remote Agent Host SSE reset payload is invalid"
              )
            }
            terminateWithReset(reset)
            return
          }
        }
      } catch (error) {
        if (isTerminalEventStreamError(error)) throw error
        throw retryableEventStreamError(toError(error).message)
      } finally {
        connection.reader.releaseLock()
      }
    }

    function waitForReconnect(delayMs: number): Promise<void> {
      return new Promise((resolve) => {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined
          wakeReconnect = undefined
          resolve()
        }, delayMs)
        reconnectTimer.unref?.()
        wakeReconnect = () => {
          reconnectTimer = undefined
          wakeReconnect = undefined
          resolve()
        }
      })
    }

    function stop(): void {
      if (stopped) return
      stopped = true
      controller?.abort()
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer)
      reconnectTimer = undefined
      wakeReconnect?.()
      wakeReconnect = undefined
    }

    function terminate(error: Error, report = true): void {
      if (report) reportError(error)
      if (!readySettled) {
        readySettled = true
        ready.reject(error)
      }
      stop()
    }

    function terminateWithReset(reset: RemoteAgentHostEventStreamReset): void {
      try {
        streamOptions.onReset?.(reset)
      } catch {
        // A reset observer cannot keep the transport alive.
      }
      terminate(
        new Error(`remote Agent Host event stream reset: ${reset.reason}`),
        false
      )
    }

    function reportError(error: Error): void {
      try {
        streamOptions.onError?.(error)
      } catch {
        // An error observer cannot keep the transport alive.
      }
    }

    function setState(next: RemoteAgentHostHttpClientEventStreamState): void {
      if (state === next) return
      state = next
      notifyState(next)
    }

    function notifyState(next: RemoteAgentHostHttpClientEventStreamState): void {
      try {
        streamOptions.onStateChange?.(next)
      } catch {
        // A state observer cannot affect the event stream.
      }
    }
  }

  async function close(): Promise<void> {
    const stream = activeEventStream
    stream?.close()
    if (stream !== undefined) await stream.closed
  }
}

function normalizeEventUrl(messageUrl: string): string {
  const url = new URL(REMOTE_AGENT_HOST_SSE_EVENT_PATH, messageUrl)
  if (url.protocol !== "https:" || url.username.length > 0 || url.password.length > 0) {
    throw new Error("remote Agent Host event URL must be an HTTPS endpoint")
  }
  return url.toString()
}

class EventStreamError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = "RemoteAgentHostEventStreamError"
    this.retryable = retryable
  }
}

function terminalEventStreamError(message: string): EventStreamError {
  return new EventStreamError(message, false)
}

function retryableEventStreamError(message: string): EventStreamError {
  return new EventStreamError(message, true)
}

function isTerminalEventStreamError(value: unknown): value is EventStreamError {
  return (
    (value instanceof EventStreamError && !value.retryable) ||
    value instanceof RemoteSseProtocolError
  )
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `remote Agent Host event stream option must be between ${minimum} and ${maximum}`
    )
  }
  return value
}

function toError(value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error("remote Agent Host event stream failed")
}

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T | PromiseLike<T>) => void
  readonly reject: (reason?: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}
