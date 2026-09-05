import { createServer, type Server } from "node:http"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { WanexMcpHttpServerHost } from "@wanex/mcp/server"
import type { JsonValue } from "@wanex/protocol"
import {
  InMemoryResolvedSecret,
  SecretResolver,
  StaticSecretProvider,
} from "@wanex/runtime/secrets"
import { EchoTool, ToolRegistry } from "@wanex/runtime/tools"
import type { ConfigEntryRecord } from "@wanex/storage"
import {
  decodeLocalMcpServerEntry,
  encodeLocalMcpServerDefinition,
  localMcpServerKey,
  prepareLocalMcpComposition,
  type LocalMcpComposition,
  type LocalMcpNamedValue,
  type LocalMcpServerDefinition,
} from "../src/mcp/index.js"

const serviceBin = fileURLToPath(new URL(
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
  import.meta.url
))
const mcpFixture = fileURLToPath(new URL(
  "../../../packages/mcp/test/fixtures/stdio-server.mjs",
  import.meta.url
))
const fixtureRoot = fileURLToPath(new URL(
  "../../../packages/mcp/test/fixtures",
  import.meta.url
))
const compositions: LocalMcpComposition[] = []
const httpHosts: WanexMcpHttpServerHost[] = []
const malformedServers: Server[] = []

afterEach(async () => {
  while (compositions.length > 0) await compositions.pop()?.dispose()
  while (httpHosts.length > 0) await httpHosts.pop()?.dispose()
  while (malformedServers.length > 0) {
    await closeServer(malformedServers.pop()!)
  }
})

describe("Assistant Host MCP composition", () => {
  it("loads strict definitions while isolating disabled, malformed, and failed servers", async () => {
    const registry = new ToolRegistry()
    registry.register(new EchoTool())
    const readyHost = new WanexMcpHttpServerHost({
      registry,
      async resolveExecutionContext() {
        throw new Error("MCP composition discovery must not execute a Tool")
      },
    })
    httpHosts.push(readyHost)
    await readyHost.start()

    const malformedServer = createServer((_request, response) => {
      response.writeHead(500, { "content-type": "text/plain" })
      response.end("private fixture transport detail")
    })
    malformedServers.push(malformedServer)
    const malformedUrl = await listen(malformedServer)
    const secretRef = "static://mcp/authorization"
    const secretValue = "mcp-composition-private-secret"
    const definitions = [
      httpDefinition("ready", readyHost.url(), {
        headers: [{
          name: "Authorization",
          source: { kind: "credential", ref: secretRef },
        }],
      }),
      httpDefinition("unavailable", malformedUrl),
      {
        ...stdioDefinition("disabled"),
        enabled: false,
      },
    ] satisfies LocalMcpServerDefinition[]
    const encodedBroken = encodeLocalMcpServerDefinition(
      httpDefinition("broken", readyHost.url())
    )
    if (
      encodedBroken === null ||
      typeof encodedBroken !== "object" ||
      Array.isArray(encodedBroken)
    ) {
      throw new Error("encoded MCP definition must be an object")
    }
    const malformed: JsonValue = {
      ...encodedBroken,
      unsupported: true,
    }
    const entries = [
      configEntry(localMcpServerKey("broken"), malformed),
      ...definitions.map((definition) => configEntry(
        localMcpServerKey(definition.serverId),
        encodeLocalMcpServerDefinition(definition)
      )),
    ]

    const composition = await prepareLocalMcpComposition({
      storage: configStorage(entries),
      secretResolver: new SecretResolver([
        new StaticSecretProvider({ values: { [secretRef]: secretValue } }),
      ]),
      serviceBin,
    })
    compositions.push(composition)

    expect(composition.status()).toEqual([
      {
        serverId: "broken",
        state: "failed",
        toolCount: 0,
        failure: "invalid_definition",
      },
      {
        serverId: "disabled",
        label: "disabled server",
        state: "stopped",
        transport: "stdio",
        toolCount: 0,
      },
      {
        serverId: "ready",
        label: "ready server",
        state: "ready",
        transport: "streamable_http",
        toolCount: 1,
      },
      {
        serverId: "unavailable",
        label: "unavailable server",
        state: "failed",
        transport: "streamable_http",
        toolCount: 0,
        failure: "connect_failed",
      },
    ])
    expect(composition.tools?.list().map((tool) => tool.name)).toEqual([
      "ready__echo",
    ])
    const serialized = JSON.stringify({
      status: composition.status(),
      tools: composition.tools?.snapshot(),
    })
    expect(serialized).not.toContain(secretRef)
    expect(serialized).not.toContain(secretValue)
    expect(serialized).not.toContain("private fixture transport detail")
  })

  it("starts a configured stdio server through managed Host execution", async () => {
    const definition = stdioDefinition("local-tools")
    const composition = await prepareLocalMcpComposition({
      storage: configStorage([
        configEntry(
          localMcpServerKey(definition.serverId),
          encodeLocalMcpServerDefinition(definition)
        ),
      ]),
      secretResolver: new SecretResolver(),
      serviceBin,
    })
    compositions.push(composition)

    expect(composition.status()).toEqual([
      {
        serverId: "local-tools",
        label: "local-tools server",
        state: "ready",
        transport: "stdio",
        toolCount: 5,
      },
    ])
    expect(composition.tools?.list().map((tool) => tool.name)).toEqual([
      "local-tools__echo",
      "local-tools__external_read",
      "local-tools__fail",
      "local-tools__hang",
      "local-tools__media",
    ])

    await composition.dispose()
    expect(composition.status()[0]?.state).toBe("stopped")
    expect(Object.isFrozen(composition.status())).toBe(true)
    expect(Object.isFrozen(composition.status()[0])).toBe(true)
  })

  it("does no credential or execution work when no servers are configured", async () => {
    let credentialResolutions = 0
    const composition = await prepareLocalMcpComposition({
      storage: configStorage([]),
      secretResolver: {
        async resolve() {
          credentialResolutions += 1
          throw new Error("empty MCP composition must not resolve credentials")
        },
      },
    })
    compositions.push(composition)

    expect(composition.status()).toEqual([])
    expect(composition.tools).toBeUndefined()
    expect(credentialResolutions).toBe(0)
    await composition.dispose()
  })

  it("isolates unavailable stdio execution from ready HTTP servers", async () => {
    const registry = new ToolRegistry()
    registry.register(new EchoTool())
    const readyHost = new WanexMcpHttpServerHost({
      registry,
      async resolveExecutionContext() {
        throw new Error("MCP composition discovery must not execute a Tool")
      },
    })
    httpHosts.push(readyHost)
    await readyHost.start()
    const definitions = [
      httpDefinition("ready-http", readyHost.url()),
      stdioDefinition("missing-execution"),
    ]
    const composition = await prepareLocalMcpComposition({
      storage: configStorage(definitions.map((definition) => configEntry(
        localMcpServerKey(definition.serverId),
        encodeLocalMcpServerDefinition(definition)
      ))),
      secretResolver: new SecretResolver(),
    })
    compositions.push(composition)

    expect(composition.status()).toEqual([
      {
        serverId: "missing-execution",
        label: "missing-execution server",
        state: "failed",
        transport: "stdio",
        toolCount: 0,
        failure: "execution_unavailable",
      },
      {
        serverId: "ready-http",
        label: "ready-http server",
        state: "ready",
        transport: "streamable_http",
        toolCount: 1,
      },
    ])
    expect(composition.tools?.list().map((tool) => tool.name)).toEqual([
      "ready-http__echo",
    ])
  })

  it("resolves credentials only with the Host-owned credential identity", async () => {
    const registry = new ToolRegistry()
    registry.register(new EchoTool())
    const readyHost = new WanexMcpHttpServerHost({
      registry,
      async resolveExecutionContext() {
        throw new Error("MCP composition discovery must not execute a Tool")
      },
    })
    httpHosts.push(readyHost)
    await readyHost.start()
    const contexts: unknown[] = []
    let resolvedSecret: InMemoryResolvedSecret | undefined
    const definition = httpDefinition("trusted-context", readyHost.url(), {
      headers: [{
        name: "Authorization",
        source: { kind: "credential", ref: "probe://mcp/token" },
      }],
    })
    const composition = await prepareLocalMcpComposition({
      storage: configStorage([configEntry(
        localMcpServerKey(definition.serverId),
        encodeLocalMcpServerDefinition(definition)
      )]),
      secretResolver: {
        async resolve(ref, context) {
          contexts.push({ ref, context })
          resolvedSecret = new InMemoryResolvedSecret({
            ref,
            provider: "probe",
            value: "Bearer private-token",
          })
          return resolvedSecret
        },
      },
    })
    compositions.push(composition)

    expect(composition.status()[0]?.state).toBe("ready")
    expect(contexts).toEqual([{
      ref: "probe://mcp/token",
      context: { credentialId: "mcp:trusted-context:authorization" },
    }])
    expect(resolvedSecret?.disposed).toBe(true)
  })

  it("rejects unsafe or ambiguous definition shapes", () => {
    const base = encodeLocalMcpServerDefinition(
      httpDefinition("strict", "https://example.test/mcp")
    ) as Record<string, JsonValue>
    const transport = base.transport as Record<string, JsonValue>

    expect(() => decodeValue({ ...base, unsupported: true })).toThrow(
      "unsupported fields"
    )
    expect(() => decodeValue({
      ...base,
      serverId: "Invalid_ID",
    }, `${localMcpServerKey("strict")}Invalid_ID`)).toThrow("ID is invalid")
    expect(() => decodeValue({
      ...base,
      connectTimeoutMs: 9,
    })).toThrow("between 10 and 120000")
    expect(() => decodeValue({
      ...base,
      requestTimeoutMs: 120_001,
    })).toThrow("between 10 and 120000")
    const stdio = encodeLocalMcpServerDefinition(
      stdioDefinition("strict-stdio")
    ) as Record<string, JsonValue>
    expect(() => decodeValue({
      ...stdio,
      transport: {
        ...(stdio.transport as Record<string, JsonValue>),
        maxBufferBytes: 10 * 1024 * 1024 + 1,
      },
    }, localMcpServerKey("strict-stdio"))).toThrow(
      "between 1024 and 10485760"
    )
    expect(() => decodeValue({
      ...base,
      transport: {
        ...transport,
        url: "https://user:secret@example.test/mcp",
      },
    })).toThrow("unsupported authority or fragment")
    expect(() => decodeValue({
      ...base,
      transport: {
        ...transport,
        headers: [
          { name: "Authorization", source: { kind: "literal", value: "a" } },
          { name: "authorization", source: { kind: "literal", value: "b" } },
        ],
      },
    })).toThrow("header name is duplicated")
  })
})

function decodeValue(
  value: JsonValue,
  key = localMcpServerKey("strict")
): LocalMcpServerDefinition {
  return decodeLocalMcpServerEntry(configEntry(key, value))
}

function httpDefinition(
  serverId: string,
  url: string,
  options: {
    readonly headers?: readonly LocalMcpNamedValue[]
  } = {}
): LocalMcpServerDefinition {
  return {
    kind: "assistant-host.mcp-server",
    serverId,
    label: `${serverId} server`,
    enabled: true,
    capabilityRevision: "fixture-v1",
    connectTimeoutMs: 1_000,
    requestTimeoutMs: 1_000,
    transport: {
      kind: "streamable_http",
      url,
      headers: options.headers ?? [],
    },
  }
}

function stdioDefinition(serverId: string): LocalMcpServerDefinition {
  return {
    kind: "assistant-host.mcp-server",
    serverId,
    label: `${serverId} server`,
    enabled: true,
    capabilityRevision: "fixture-v1",
    connectTimeoutMs: 5_000,
    requestTimeoutMs: 5_000,
    transport: {
      kind: "stdio",
      command: process.execPath,
      args: [mcpFixture],
      cwd: fixtureRoot,
      environment: [],
    },
  }
}

function configEntry(key: string, value: JsonValue): ConfigEntryRecord {
  return { key, value, revision: 1, updatedAt: 1 }
}

function configStorage(entries: readonly ConfigEntryRecord[]) {
  return {
    async listConfigEntries(request: {
      readonly prefix: string
      readonly afterKey?: string
      readonly limit?: number
    }) {
      return entries
        .filter((entry) =>
          entry.key.startsWith(request.prefix) &&
          (request.afterKey === undefined || entry.key > request.afterKey)
        )
        .sort((left, right) => left.key.localeCompare(right.key))
        .slice(0, request.limit)
    },
  }
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject)
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("malformed MCP fixture did not bind a TCP address")
  }
  return `http://127.0.0.1:${address.port}/mcp`
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error))
  })
}
