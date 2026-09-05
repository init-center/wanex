import { describe, expect, it } from "vitest"
import { createHttpClient } from "../src/client/http-client.js"

describe("Assistant UI MCP settings client", () => {
  it("is absent when the Host does not advertise an MCP settings path", () => {
    const client = createHttpClient({
      requestPath: "/request",
      hostSessionToken: "host-session",
      fetch: async () => {
        throw new Error("fetch should not run")
      },
    })

    expect(client.mcpSettings).toBeUndefined()
  })

  it("maps typed operations to the authenticated Host endpoint", async () => {
    const requests: Array<{ readonly method: string; readonly body?: unknown }> = []
    const servers = {
      kind: "assistant-host.mcp-servers",
      servers: [{
        serverId: "product-tools",
        label: "Product tools",
        enabled: true,
        transport: "streamable_http",
        configurationState: "valid",
        runtimeState: "ready",
        toolCount: 2,
        revision: 1,
        credentialState: "configured",
      }],
    }
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? "GET"
      const body = init?.body === undefined
        ? undefined
        : JSON.parse(String(init.body))
      requests.push({ method, ...(body === undefined ? {} : { body }) })
      expect(new Headers(init?.headers).get("x-wanex-host-session"))
        .toBe("host-session")
      if (method === "GET") {
        return jsonResponse(200, { ok: true, servers })
      }
      const command = body as {
        readonly operation: string
        readonly request: Record<string, unknown>
      }
      if (command.operation === "stage-credential") {
        return jsonResponse(200, {
          ok: true,
          operation: command.operation,
          result: {
            kind: "assistant-host.mcp-credential-setup",
            setupId: "setup_id_12345678",
            expiresAt: 9_000,
          },
        })
      }
      if (command.operation === "reload-servers") {
        return jsonResponse(200, {
          ok: true,
          operation: command.operation,
          result: { reloadOutcome: "published", servers },
        })
      }
      return jsonResponse(200, {
        ok: true,
        operation: command.operation,
        result: {
          kind: "applied",
          serverId: "product-tools",
          reloadOutcome: "published",
          servers,
          credentialCleanupPending: false,
        },
      })
    }) as typeof globalThis.fetch
    const client = createHttpClient({
      requestPath: "/request",
      mcpSettingsPath: "/mcp-settings",
      hostSessionToken: "host-session",
      fetch: fetchImpl,
    })
    const mcp = client.mcpSettings!

    await expect(mcp.listServers()).resolves.toEqual(servers)
    await expect(mcp.stageCredential({
      serverId: "product-tools",
      transport: "streamable_http",
      name: "authorization",
      value: "Bearer private-token",
    })).resolves.toMatchObject({ setupId: "setup_id_12345678" })
    await expect(mcp.saveServer({
      serverId: "product-tools",
      expectedRevision: null,
      label: "Product tools",
      enabled: true,
      connectTimeoutMs: 1_000,
      requestTimeoutMs: 1_000,
      transport: {
        kind: "streamable_http",
        url: "https://example.test/mcp",
        headers: [{
          name: "authorization",
          source: { kind: "credential", setupId: "setup_id_12345678" },
        }],
      },
    })).resolves.toMatchObject({ kind: "applied" })
    await expect(mcp.updateServer({
      serverId: "product-tools",
      expectedRevision: 1,
      label: "Renamed tools",
    })).resolves.toMatchObject({ kind: "applied" })
    await expect(mcp.setServerEnabled({
      serverId: "product-tools",
      expectedRevision: 1,
      enabled: false,
    })).resolves.toMatchObject({ kind: "applied" })
    await expect(mcp.removeServer({
      serverId: "product-tools",
      expectedRevision: 1,
    })).resolves.toMatchObject({ kind: "applied" })
    await expect(mcp.reloadServers({ force: true })).resolves.toMatchObject({
      reloadOutcome: "published",
    })

    expect(requests.map((request) => request.method)).toEqual([
      "GET", "POST", "POST", "POST", "POST", "POST", "POST",
    ])
    expect(requests.slice(1).map((request) =>
      (request.body as { operation: string }).operation
    )).toEqual([
      "stage-credential",
      "save-server",
      "update-server",
      "set-server-enabled",
      "remove-server",
      "reload-servers",
    ])
    expect(JSON.stringify(requests)).not.toContain("host-session")
    expect(JSON.stringify(requests)).not.toContain("secretRef")
  })

  it("rejects a Host list that contains raw connection fields", async () => {
    const client = createHttpClient({
      requestPath: "/request",
      mcpSettingsPath: "/mcp-settings",
      hostSessionToken: "host-session",
      fetch: async () => jsonResponse(200, {
        ok: true,
        servers: {
          kind: "assistant-host.mcp-servers",
          servers: [{
            configurationState: "valid",
            runtimeState: "ready",
            toolCount: 1,
            command: "/private/mcp-server",
          }],
        },
      }),
    })

    await expect(client.mcpSettings?.listServers()).rejects.toThrow(
      "MCP server list failed"
    )
  })
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}
