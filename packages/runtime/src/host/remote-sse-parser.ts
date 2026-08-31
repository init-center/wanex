import { isRemoteHostOpaqueToken } from "./remote-http.js"
import type { RemoteAgentHostEventStreamReset } from "./remote-event-stream.js"

export class RemoteSseProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RemoteSseProtocolError"
  }
}

export function parseRemoteSseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    throw new RemoteSseProtocolError(
      "remote Agent Host SSE data is not valid JSON"
    )
  }
}

export function parseRemoteEventStreamReset(
  value: unknown
): RemoteAgentHostEventStreamReset | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined
  }
  const record = value as Record<string, unknown>
  const reason = record.reason
  if (
    reason !== "gap" &&
    reason !== "overflow" &&
    reason !== "stream_replaced" &&
    reason !== "unavailable"
  ) {
    return undefined
  }
  if (record.canonicalReadRequired !== true) return undefined
  const latestSequence = record.latestSequence
  if (
    typeof latestSequence !== "number" ||
    !Number.isSafeInteger(latestSequence) ||
    latestSequence < 0
  ) {
    return undefined
  }
  const streamId = record.streamId
  if (
    streamId !== undefined &&
    (typeof streamId !== "string" || !isRemoteHostOpaqueToken(streamId))
  ) {
    return undefined
  }
  return {
    reason,
    canonicalReadRequired: true,
    ...(streamId === undefined ? {} : { streamId }),
    latestSequence
  }
}

export interface RemoteSseFrame {
  readonly event?: string
  readonly id?: string
  readonly data: string
}

export async function* readRemoteSseFrames(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxFrameBytes: number
): AsyncGenerator<RemoteSseFrame> {
  const decoder = new TextDecoder()
  let buffer = ""
  let frameBytes = 0
  let event: string | undefined
  let id: string | undefined
  let dataLines: string[] = []

  while (true) {
    const next = await reader.read()
    if (next.done) break
    buffer += decoder.decode(next.value, { stream: true })
    let newline = buffer.indexOf("\n")
    while (newline >= 0) {
      let line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (line.endsWith("\r")) line = line.slice(0, -1)
      frameBytes += Buffer.byteLength(line, "utf8") + 1
      if (frameBytes > maxFrameBytes) {
        throw new RemoteSseProtocolError(
          "remote Agent Host SSE frame exceeds its limit"
        )
      }
      if (line.length === 0) {
        if (dataLines.length > 0 || event !== undefined || id !== undefined) {
          yield {
            ...(event === undefined ? {} : { event }),
            ...(id === undefined ? {} : { id }),
            data: dataLines.join("\n")
          }
        }
        frameBytes = 0
        event = undefined
        id = undefined
        dataLines = []
      } else if (!line.startsWith(":")) {
        const separator = line.indexOf(":")
        const field = separator < 0 ? line : line.slice(0, separator)
        let fieldValue = separator < 0 ? "" : line.slice(separator + 1)
        if (fieldValue.startsWith(" ")) fieldValue = fieldValue.slice(1)
        if (field === "event") event = fieldValue
        else if (field === "id") id = fieldValue
        else if (field === "data") dataLines.push(fieldValue)
      }
      newline = buffer.indexOf("\n")
    }
    if (Buffer.byteLength(buffer, "utf8") > maxFrameBytes) {
      throw new RemoteSseProtocolError(
        "remote Agent Host SSE line exceeds its limit"
      )
    }
  }

  buffer += decoder.decode()
  if (buffer.length > 0) {
    let line = buffer
    if (line.endsWith("\r")) line = line.slice(0, -1)
    frameBytes += Buffer.byteLength(line, "utf8") + 1
    if (frameBytes > maxFrameBytes) {
      throw new RemoteSseProtocolError(
        "remote Agent Host SSE frame exceeds its limit"
      )
    }
    if (!line.startsWith(":")) {
      const separator = line.indexOf(":")
      const field = separator < 0 ? line : line.slice(0, separator)
      let fieldValue = separator < 0 ? "" : line.slice(separator + 1)
      if (fieldValue.startsWith(" ")) fieldValue = fieldValue.slice(1)
      if (field === "event") event = fieldValue
      else if (field === "id") id = fieldValue
      else if (field === "data") dataLines.push(fieldValue)
    }
  }
  if (dataLines.length > 0 || event !== undefined || id !== undefined) {
    yield {
      ...(event === undefined ? {} : { event }),
      ...(id === undefined ? {} : { id }),
      data: dataLines.join("\n")
    }
  }
}
