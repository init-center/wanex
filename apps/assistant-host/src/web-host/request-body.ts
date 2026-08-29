import type { IncomingMessage } from "node:http"

export async function readJsonBody(
  request: IncomingMessage,
  maxBodyBytes: number
): Promise<unknown> {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.byteLength
    if (totalBytes > maxBodyBytes) {
      throw new Error(`request body exceeds ${maxBodyBytes} bytes`)
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString("utf8")
  if (text.trim().length === 0) {
    throw new Error("request body must contain JSON")
  }
  return JSON.parse(text)
}
