import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { request as httpsRequest } from "node:https"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export interface TestCertificate {
  readonly key: Buffer
  readonly cert: Buffer
  close(): Promise<void>
}

export async function createTestCertificate(): Promise<TestCertificate> {
  const directory = await mkdtemp(join(tmpdir(), "wanex-server-tls-"))
  const keyPath = join(directory, "localhost.key")
  const certPath = join(directory, "localhost.crt")
  try {
    await execFileAsync("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1"
    ])
    const [key, cert] = await Promise.all([
      readFile(keyPath),
      readFile(certPath)
    ])
    return {
      key,
      cert,
      async close() {
        await rm(directory, { recursive: true, force: true })
      }
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw new Error("Wanex Server TLS tests require openssl", { cause: error })
  }
}

export function createHttpsFetch(ca: Buffer): typeof globalThis.fetch {
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input))
    const headers = Object.fromEntries(new Headers(init.headers).entries())
    return await new Promise<Response>((resolve, reject) => {
      const request = httpsRequest(url, {
        method: init.method ?? "GET",
        headers,
        ca,
        rejectUnauthorized: true,
        servername: "localhost"
      })
      let settled = false
      let responseStream: InstanceType<typeof Readable> | undefined
      const signal = init.signal
      const abort = (): void => {
        responseStream?.destroy()
        request.destroy(new Error("request aborted"))
        if (!settled) reject(new Error("request aborted"))
      }
      signal?.addEventListener("abort", abort, { once: true })
      request.on("response", (response) => {
        responseStream = response
        settled = true
        response.once("close", () => signal?.removeEventListener("abort", abort))
        const responseHeaders = new Headers()
        for (const [name, values] of Object.entries(response.headers)) {
          if (values === undefined) continue
          responseHeaders.set(
            name,
            Array.isArray(values) ? values.join(", ") : values
          )
        }
        resolve(new Response(
          Readable.toWeb(response) as ReadableStream<Uint8Array>,
          {
            status: response.statusCode ?? 500,
            headers: responseHeaders
          }
        ))
      })
      request.on("error", (error) => {
        if (!settled) reject(error)
      })
      if (init.body !== undefined && init.body !== null) request.write(init.body)
      request.end()
    })
  }) as typeof globalThis.fetch
}
