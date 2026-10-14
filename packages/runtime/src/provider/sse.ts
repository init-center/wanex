export type ProviderStreamBody = AsyncIterable<Uint8Array | string>

export interface ProviderStreamLimits {
  readonly eventBytes: number
  readonly responseBytes: number
}

export async function* parseServerSentEvents(
  body: ProviderStreamBody,
  limits?: ProviderStreamLimits
): AsyncIterable<string> {
  const decoder = new TextDecoder("utf-8", { fatal: limits !== undefined })
  let buffer = ""
  let data: string[] = []
  let responseBytes = 0
  let eventBytes = 0
  if (limits !== undefined && (!Number.isSafeInteger(limits.eventBytes) || limits.eventBytes <= 0 ||
      !Number.isSafeInteger(limits.responseBytes) || limits.responseBytes < limits.eventBytes)) {
    throw new Error("invalid provider stream byte limits")
  }

  function countEvent(bytes: number): void {
    eventBytes += bytes
    if (limits !== undefined && eventBytes > limits.eventBytes) {
      throw new Error("provider SSE event exceeds its byte limit")
    }
  }

  for await (const chunk of body) {
    responseBytes += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength
    if (limits !== undefined && responseBytes > limits.responseBytes) {
      throw new Error("provider SSE response exceeds its byte limit")
    }
    const decoded = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true })
    // Split a transport chunk before appending: one chunk may contain many bounded events.
    let offset = 0
    do {
      const boundary = decoded.indexOf("\n", offset)
      const end = boundary < 0 ? decoded.length : boundary + 1
      const fragment = decoded.slice(offset, end)
      countEvent(Buffer.byteLength(fragment))
      buffer += fragment
      if (boundary >= 0) {
        const rawLine = buffer.slice(0, -1)
        buffer = ""
        const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine
        if (line.length === 0) {
          if (data.length > 0) {
            yield data.join("\n")
            data = []
          }
          eventBytes = 0
        } else if (line.startsWith("data:")) {
          data.push(line.slice(5).replace(/^ /, ""))
        }
      }
      offset = end
    } while (offset < decoded.length)
  }

  const tail = decoder.decode()
  countEvent(Buffer.byteLength(tail))
  buffer += tail
  if (buffer.length > 0) {
    const line = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer
    if (line.startsWith("data:")) {
      data.push(line.slice(5).replace(/^ /, ""))
    }
  }
  if (data.length > 0) {
    yield data.join("\n")
  }
}
