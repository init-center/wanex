import { createServer, type Server as NodeHttpServer } from "node:http"
import { randomUUID } from "node:crypto"
import {
  StreamableHTTPServerTransport,
  type StreamableHTTPServerTransportOptions
} from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { connectWanexMcpSdkServer } from "./runtime-server.js"
import type {
  WanexMcpHttpServerHostOptions,
  WanexMcpServerStatus
} from "./types.js"

export class WanexMcpHttpServerHost {
  private readonly options: WanexMcpHttpServerHostOptions
  private httpServer: NodeHttpServer | undefined
  private readonly sessions = new Map<string, {
    readonly server: Server
    readonly transport: StreamableHTTPServerTransport
  }>()
  private started = false
  private disposed = false
  private boundUrl: string | undefined

  constructor(options: WanexMcpHttpServerHostOptions) {
    this.options = options
  }

  status(): WanexMcpServerStatus {
    return { started: this.started, disposed: this.disposed }
  }

  url(): string {
    if (this.boundUrl === undefined) throw new Error("MCP HTTP server is not started")
    return this.boundUrl
  }

  async start(): Promise<void> {
    if (this.disposed) throw new Error("MCP HTTP server is disposed")
    if (this.started) return
    const path = this.options.path ?? "/mcp"
    if (!path.startsWith("/")) throw new Error("MCP HTTP path must start with /")
    const httpServer = createServer((request, response) => {
      if (new URL(request.url ?? "/", "http://localhost").pathname !== path) {
        response.writeHead(404).end()
        return
      }
      void this.handleRequest(request, response)
    })
    try {
      await listen(httpServer, this.options.port ?? 0, this.options.hostname ?? "127.0.0.1")
    } catch (error) {
      throw error
    }
    const address = httpServer.address()
    if (address === null || typeof address === "string") {
      await closeHttpServer(httpServer)
      throw new Error("MCP HTTP server did not bind a TCP address")
    }
    this.httpServer = httpServer
    this.boundUrl = `http://${this.options.hostname ?? "127.0.0.1"}:${address.port}${path}`
    this.started = true
  }

  async stop(): Promise<void> {
    if (!this.started) return
    const httpServer = this.httpServer
    this.started = false
    this.boundUrl = undefined
    this.httpServer = undefined
    await Promise.all([...this.sessions.values()].map(async (session) => {
      await session.server.close()
    }))
    this.sessions.clear()
    if (httpServer !== undefined) await closeHttpServer(httpServer)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    await this.stop()
    this.disposed = true
  }

  private async handleRequest(
    request: Parameters<StreamableHTTPServerTransport["handleRequest"]>[0],
    response: Parameters<StreamableHTTPServerTransport["handleRequest"]>[1]
  ): Promise<void> {
    const sessionId = headerValue(request.headers["mcp-session-id"])
    if (sessionId !== undefined) {
      const session = this.sessions.get(sessionId)
      if (session === undefined) {
        writeProtocolError(response, 404, -32001, "Unknown MCP session.")
        return
      }
      try {
        await session.transport.handleRequest(request, response)
      } catch (error) {
        writeServerError(response, error)
      }
      return
    }
    if (request.method !== "POST") {
      writeProtocolError(response, 400, -32000, "MCP session id is required.")
      return
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true
    } as StreamableHTTPServerTransportOptions)
    let sdkServer: Server | undefined
    try {
      sdkServer = await connectWanexMcpSdkServer(
        this.options,
        transport as unknown as Transport
      )
      await transport.handleRequest(request, response)
      const createdSessionId = transport.sessionId
      if (createdSessionId === undefined) {
        await sdkServer.close()
        return
      }
      this.sessions.set(createdSessionId, { server: sdkServer, transport })
      transport.onclose = () => {
        this.sessions.delete(createdSessionId)
      }
    } catch (error) {
      await sdkServer?.close().catch(() => undefined)
      await transport.close().catch(() => undefined)
      writeServerError(response, error)
    }
  }
}

function headerValue(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0]
}

function writeProtocolError(
  response: Parameters<StreamableHTTPServerTransport["handleRequest"]>[1],
  status: number,
  code: number,
  message: string
): void {
  if (response.headersSent) return
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }))
}

function writeServerError(
  response: Parameters<StreamableHTTPServerTransport["handleRequest"]>[1],
  error: unknown
): void {
  if (response.headersSent) return
  response.writeHead(500)
  response.end(error instanceof Error ? error.message : String(error))
}

async function listen(server: NodeHttpServer, port: number, hostname: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error)
    server.once("error", onError)
    server.listen(port, hostname, () => {
      server.off("error", onError)
      resolve()
    })
  })
}

async function closeHttpServer(server: NodeHttpServer): Promise<void> {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error))
  })
}
