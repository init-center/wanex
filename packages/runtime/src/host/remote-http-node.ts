import type { IncomingMessage, ServerResponse } from "node:http"
import {
  REMOTE_AGENT_HOST_MESSAGE_PATH,
  type RemoteAgentHostHttpHandler,
  type RemoteAgentHostHttpResponse
} from "./remote-http.js"
import {
  REMOTE_AGENT_HOST_SSE_EVENT_PATH,
  type RemoteAgentHostEventStream
} from "./remote-event-stream.js"

const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024
const DEFAULT_KEEPALIVE_INTERVAL_MS = 15_000

export interface RemoteAgentHostNodeHttpAdapterOptions {
  readonly handler: RemoteAgentHostHttpHandler
  readonly maxBodyBytes?: number
  readonly keepaliveIntervalMs?: number
}

export interface RemoteAgentHostNodeHttpAdapter {
  handle(request: IncomingMessage, response: ServerResponse): Promise<void>
}

export function createRemoteAgentHostNodeHttpAdapter(
  options: RemoteAgentHostNodeHttpAdapterOptions
): RemoteAgentHostNodeHttpAdapter {
  const maxBodyBytes = boundedPositive(
    options.maxBodyBytes,
    DEFAULT_MAX_BODY_BYTES
  )
  const keepaliveIntervalMs = boundedPositive(
    options.keepaliveIntervalMs,
    DEFAULT_KEEPALIVE_INTERVAL_MS
  )

  return Object.freeze({ handle })

  async function handle(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    try {
      await handleRequest(request, response)
    } catch {
      if (response.headersSent || response.destroyed) {
        response.destroy()
        return
      }
      writeJson(response, 500, {
        kind: "wanex.agent-host.error",
        error: {
          code: "application_failure",
          message: "remote Agent Host request failed",
          retryable: true
        }
      })
    }
  }

  async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname
    const headers = singleHeaders(request)
    if (headers === undefined) {
      writeJson(response, 400, {
        kind: "wanex.agent-host.error",
        error: {
          code: "malformed_request",
          message: "remote Agent Host request headers are ambiguous",
          retryable: false
        }
      })
      return
    }

    if (path === REMOTE_AGENT_HOST_SSE_EVENT_PATH) {
      const opened = await options.handler.openEventStream({
        method: request.method ?? "",
        path,
        headers,
        nowMs: Date.now()
      })
      if (opened.stream === undefined) {
        writeOptionalJson(response, opened.status, opened.body, opened.headers)
        return
      }
      await writeEventStream(
        request,
        response,
        opened.stream,
        opened.headers,
        keepaliveIntervalMs
      )
      return
    }

    if (path !== REMOTE_AGENT_HOST_MESSAGE_PATH || request.method !== "POST") {
      const result = await options.handler.handle({
        method: request.method ?? "",
        path,
        headers,
        body: {},
        bodyBytes: 0,
        nowMs: Date.now()
      })
      writeJsonResponse(response, result)
      return
    }

    const body = await readJsonBody(request, maxBodyBytes)
    if (body.outcome !== "ok") {
      if (body.outcome === "aborted") return
      writeJson(response, body.outcome === "too_large" ? 413 : 400, {
        kind: "wanex.agent-host.error",
        error: {
          code: body.outcome === "too_large" ? "resource_limit" : "malformed_request",
          message:
            body.outcome === "too_large"
              ? "remote Agent Host request body exceeds its limit"
              : "remote Agent Host request body is not valid JSON",
          retryable: false
        }
      })
      return
    }
    const result = await options.handler.handle({
      method: request.method,
      path,
      headers,
      body: body.value,
      bodyBytes: body.bytes,
      nowMs: Date.now()
    })
    writeJsonResponse(response, result)
  }
}

async function writeEventStream(
  request: IncomingMessage,
  response: ServerResponse,
  stream: RemoteAgentHostEventStream,
  headers: Readonly<Record<string, string>>,
  keepaliveIntervalMs: number
): Promise<void> {
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value)
  }
  response.setHeader("content-type", "text/event-stream; charset=utf-8")
  response.setHeader("cache-control", "no-store")
  response.setHeader("connection", "keep-alive")
  response.setHeader("x-accel-buffering", "no")
  response.flushHeaders()

  let closed = false
  const keepalive = setInterval(() => {
    if (!closed && !response.destroyed && !response.writableNeedDrain) {
      response.write(`: keepalive ${Date.now()}\n\n`)
    }
  }, keepaliveIntervalMs)
  keepalive.unref?.()

  const disconnect = (): void => {
    if (closed) return
    closed = true
    clearInterval(keepalive)
    stream.close()
  }
  request.once("aborted", disconnect)
  response.once("close", disconnect)
  response.once("error", disconnect)

  try {
    for await (const frame of stream.frames) {
      if (closed) return
      const encoded = encodeSseFrame(frame)
      if (response.destroyed || response.writableEnded) {
        disconnect()
        return
      }
      if (!response.write(encoded)) await waitForWritable(response, disconnect)
      if (closed) return
    }
    if (!closed && !response.writableEnded) response.end()
  } finally {
    closed = true
    clearInterval(keepalive)
    request.off("aborted", disconnect)
    response.off("close", disconnect)
    response.off("error", disconnect)
    stream.close()
  }
}

function encodeSseFrame(frame: {
  readonly event: string
  readonly id?: string
  readonly data: unknown
}): string {
  const data = JSON.stringify(frame.data)
  if (data === undefined) throw new Error("remote Agent Host SSE frame is invalid")
  return [
    ...(frame.id === undefined ? [] : [`id: ${frame.id}`]),
    `event: ${frame.event}`,
    `data: ${data}`,
    "",
    ""
  ].join("\n")
}

async function waitForWritable(
  response: ServerResponse,
  disconnect: () => void
): Promise<void> {
  if (response.destroyed || response.writableEnded) {
    disconnect()
    return
  }
  await new Promise<void>((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      response.off("drain", onDrain)
      response.off("close", onClose)
      response.off("error", onError)
      resolve()
    }
    const onDrain = (): void => finish()
    const onClose = (): void => {
      disconnect()
      finish()
    }
    const onError = (): void => {
      disconnect()
      finish()
    }
    response.once("drain", onDrain)
    response.once("close", onClose)
    response.once("error", onError)
  })
}

function writeJsonResponse(
  response: ServerResponse,
  value: RemoteAgentHostHttpResponse
): void {
  writeJson(response, value.status, value.body, value.headers)
}

function writeOptionalJson(
  response: ServerResponse,
  status: number,
  body: RemoteAgentHostHttpResponse["body"] | undefined,
  headers: Readonly<Record<string, string>> = {}
): void {
  if (body === undefined) {
    writeJson(response, 500, {
      kind: "wanex.agent-host.error",
      error: {
        code: "application_failure",
        message: "remote Agent Host event stream response is invalid",
        retryable: false
      }
    })
    return
  }
  writeJson(response, status, body, headers)
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: object,
  headers: Readonly<Record<string, string>> = {}
): void {
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value)
  }
  response.statusCode = status
  response.setHeader("content-type", "application/json")
  response.end(JSON.stringify(body))
}

function singleHeaders(
  request: IncomingMessage
): Record<string, string | undefined> | undefined {
  const headers: Record<string, string | undefined> = {}
  for (const name of ["authorization", "x-wanex-host-session", "last-event-id"]) {
    const value = request.headers[name]
    if (Array.isArray(value)) {
      if (value.length !== 1 || value[0] === undefined) return undefined
      headers[name] = value[0]
    } else if (typeof value === "string") {
      headers[name] = value
    }
  }
  return headers
}

type BodyResult =
  | { readonly outcome: "ok"; readonly value: unknown; readonly bytes: number }
  | { readonly outcome: "invalid" | "too_large" | "aborted" }

async function readJsonBody(
  request: IncomingMessage,
  maxBodyBytes: number
): Promise<BodyResult> {
  const chunks: Buffer[] = []
  let bytes = 0
  let tooLarge = false
  return await new Promise((resolve) => {
    let settled = false
    const finish = (result: BodyResult): void => {
      if (settled) return
      settled = true
      request.off("data", onData)
      request.off("end", onEnd)
      request.off("aborted", onAborted)
      request.off("error", onError)
      resolve(result)
    }
    const onData = (chunk: Buffer | string): void => {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += value.byteLength
      if (bytes > maxBodyBytes) {
        tooLarge = true
        return
      }
      chunks.push(value)
    }
    const onEnd = (): void => {
      if (tooLarge) {
        finish({ outcome: "too_large" })
        return
      }
      try {
        finish({
          outcome: "ok",
          value: JSON.parse(Buffer.concat(chunks).toString("utf8")),
          bytes
        })
      } catch {
        finish({ outcome: "invalid" })
      }
    }
    const onAborted = (): void => finish({ outcome: "aborted" })
    const onError = (): void => finish({ outcome: "aborted" })
    request.on("data", onData)
    request.once("end", onEnd)
    request.once("aborted", onAborted)
    request.once("error", onError)
  })
}

function boundedPositive(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("remote Agent Host Node adapter limit must be positive")
  }
  return value
}
