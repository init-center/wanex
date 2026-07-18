export type ProviderStreamBody = AsyncIterable<Uint8Array | string>

export async function* parseServerSentEvents(
  body: ProviderStreamBody
): AsyncIterable<string> {
  const decoder = new TextDecoder()
  let buffer = ""
  let data: string[] = []

  for await (const chunk of body) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true })
    let newline = buffer.indexOf("\n")
    while (newline >= 0) {
      const rawLine = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine
      if (line.length === 0) {
        if (data.length > 0) {
          yield data.join("\n")
          data = []
        }
      } else if (line.startsWith("data:")) {
        data.push(line.slice(5).replace(/^ /, ""))
      }
      newline = buffer.indexOf("\n")
    }
  }

  buffer += decoder.decode()
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
