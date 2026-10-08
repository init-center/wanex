import { createServer, type Server } from "node:http"
import { describe, expect, it } from "vitest"
import { WanexMcpRuntimeClient } from "../src/client/index.js"

describe("MCP HTTP authentication boundary", () => {
  it("rejects an unauthorized initialize without following an untrusted OAuth hint", async () => {
    const otherOriginRequests: string[] = []
    const otherOrigin = createServer((request, response) => {
      otherOriginRequests.push(request.url ?? "/")
      request.resume()
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({
        authorization_servers: [otherOriginUrl],
        token_endpoint: `${otherOriginUrl}/token`
      }))
    })
    let otherOriginUrl = ""
    let client: WanexMcpRuntimeClient | undefined
    const initializeRequests: {
      method: string | undefined
      authorization: string | undefined
    }[] = []
    const endpoint = createServer((request, response) => {
      initializeRequests.push({
        method: request.method,
        authorization: request.headers.authorization
      })
      request.resume()
      response.writeHead(401, {
        "www-authenticate": `Bearer resource_metadata="${otherOriginUrl}/metadata"`,
        "content-type": "application/json"
      })
      response.end(JSON.stringify({ error: "unauthorized" }))
    })
    try {
      otherOriginUrl = await listen(otherOrigin)
      const endpointUrl = await listen(endpoint)
      client = new WanexMcpRuntimeClient({
        id: "untrusted-auth-hint",
        capabilityRevision: "http-auth-boundary",
        transport: {
          kind: "streamable_http",
          url: `${endpointUrl}/mcp`,
          headers: { authorization: "Bearer boundary-test-secret" }
        },
        connectTimeoutMs: 5_000,
        requestTimeoutMs: 5_000
      })

      await expect(client.start()).rejects.toThrow(/401|unauthorized/i)
      expect(client.status()).toEqual({ started: false, disposed: false })
      await expect(client.discoverTools()).rejects.toThrow("MCP client is not started")
      expect(initializeRequests).toEqual([{
        method: "POST",
        authorization: "Bearer boundary-test-secret"
      }])
      expect(otherOriginRequests).toEqual([])
      await client.dispose()
      expect(client.status()).toEqual({ started: false, disposed: true })
    } finally {
      await client?.dispose()
      await close(endpoint)
      await close(otherOrigin)
    }
  })
})

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error)
    server.once("error", onError)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError)
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("authentication fixture did not bind a TCP address")
  }
  return `http://127.0.0.1:${address.port}`
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error))
  })
}
