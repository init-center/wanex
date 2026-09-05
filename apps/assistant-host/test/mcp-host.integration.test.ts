import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { WanexMcpHttpServerHost } from "@wanex/mcp/server"
import { bootstrapWanexStorage } from "@wanex/runtime/bootstrap"
import { EchoTool, ToolRegistry } from "@wanex/runtime/tools"
import {
  createAssistantHostHandle,
  startAssistantHostInternal,
} from "../src/application/assistant.js"
import {
  encodeLocalMcpServerDefinition,
  localMcpServerKey,
  type LocalMcpServerDefinition,
} from "../src/mcp/index.js"
import type { LocalModelEndpointOptions } from "../src/model.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []
const mcpHosts: WanexMcpHttpServerHost[] = []

afterEach(async () => {
  while (mcpHosts.length > 0) await mcpHosts.pop()?.dispose()
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true })
  }
})

describe("Assistant Host MCP integration", () => {
  it("projects stored MCP Tools into admitted bindings and closes the generation", async () => {
    const registry = new ToolRegistry()
    registry.register(new EchoTool())
    const mcpHost = new WanexMcpHttpServerHost({
      registry,
      async resolveExecutionContext() {
        throw new Error("MCP integration discovery must not invoke a Tool")
      },
    })
    mcpHosts.push(mcpHost)
    await mcpHost.start()

    const storeDir = await createStoreDir()
    const definition = httpDefinition("product-tools", mcpHost.url())
    const seed = await bootstrapWanexStorage({
      storage: {
        kind: "local-system-service",
        storeDir,
        serviceBin,
      },
    })
    try {
      await seed.storage.putConfig(
        localMcpServerKey(definition.serverId),
        encodeLocalMcpServerDefinition(definition)
      )
    } finally {
      await seed.dispose()
    }

    const started = await startAssistantHostInternal({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      modelEndpoint: fakeEndpoint,
    })
    const host = createAssistantHostHandle(started)
    expect(started.mcpController.status()).toEqual([{
      serverId: "product-tools",
      label: "Product tools",
      state: "ready",
      transport: "streamable_http",
      toolCount: 1,
    }])
    await expect(host.mcpSettings.readServers()).resolves.toMatchObject({
      kind: "assistant-host.mcp-servers",
      servers: [{
        serverId: "product-tools",
        label: "Product tools",
        enabled: true,
        transport: "streamable_http",
        configurationState: "valid",
        runtimeState: "ready",
        toolCount: 1,
        revision: 1,
        credentialState: "not_required",
      }],
    })

    const binding = await host.shell.trustedExecution.prepareExecutionBinding({
      sessionId: "ses_mcp_host_integration",
      inputId: "input_mcp_host_integration",
      turnId: "turn_mcp_host_integration",
      content: [{
        id: "part_mcp_host_integration",
        type: "text",
        text: "Use the configured product tool.",
      }],
    })
    expect(JSON.stringify(binding.binding.toolSnapshot)).toContain(
      '"name":"product-tools__echo"'
    )
    binding.context.rollback()

    await host.close()
    await host.close()
    expect(started.mcpController.status()).toEqual([{
      serverId: "product-tools",
      label: "Product tools",
      state: "stopped",
      transport: "streamable_http",
      toolCount: 1,
    }])
  })
})

async function createStoreDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-mcp-host-integration-"))
  tempDirs.push(dir)
  return dir
}

function httpDefinition(
  serverId: string,
  url: string
): LocalMcpServerDefinition {
  return {
    kind: "assistant-host.mcp-server",
    serverId,
    label: "Product tools",
    enabled: true,
    capabilityRevision: "integration-v1",
    connectTimeoutMs: 2_000,
    requestTimeoutMs: 2_000,
    transport: { kind: "streamable_http", url, headers: [] },
  }
}

const fakeEndpoint: LocalModelEndpointOptions = {
  id: "mcp-host-integration",
  connection: { id: "mcp-host-integration", providerId: "fake" },
  protocol: { id: "fake" },
  model: {
    id: "mcp-host-integration-model",
    operations: ["conversation"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    features: ["tool_calling"],
    catalog: {
      source: "builtin",
      catalogId: "assistant-host.test.mcp-integration",
      revision: "1",
    },
  },
}
