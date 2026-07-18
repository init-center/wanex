import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

export interface EvalRemoteStorageRequest {
  readonly method: string
  readonly headers: Readonly<Record<string, string | undefined>>
  readonly body: unknown
}

export interface EvalRemoteStorageResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: unknown
}

export async function startEvalRemoteStorageServer(
  handle: (
    request: EvalRemoteStorageRequest
  ) => Promise<EvalRemoteStorageResponse>
): Promise<{
  readonly endpoint: string
  close(): Promise<void>
}> {
  const server = createServer((request, response) => {
    void (async () => {
      const body = await readEvalRequestBody(request)
      const result = await handle({
        method: request.method ?? "GET",
        headers: normalizeEvalHeaders(request.headers),
        body
      })
      response.writeHead(result.status, result.headers)
      response.end(JSON.stringify(result.body))
    })()
  })
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address() as AddressInfo
  return {
    endpoint: `http://127.0.0.1:${address.port}/storage`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    }
  }
}

async function readEvalRequestBody(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }
  const text = Buffer.concat(chunks).toString("utf8")
  return text.length === 0 ? null : JSON.parse(text)
}

function normalizeEvalHeaders(
  headers: Record<string, string | string[] | undefined>
): Readonly<Record<string, string | undefined>> {
  const normalized: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(headers)) {
    normalized[key] = Array.isArray(value) ? value.join(", ") : value
  }
  return normalized
}
