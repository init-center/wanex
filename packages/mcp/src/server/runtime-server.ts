import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import type { ToolExecutionResult } from "@wanex/runtime/tools"
import type { WanexMcpRuntimeServerOptions } from "./types.js"

export const WANEX_MCP_SERVER = "wanex-mcp-server" as const

export function createWanexMcpSdkServer(
  options: WanexMcpRuntimeServerOptions
): Server {
  const server = new Server(
    {
      name: options.name ?? "wanex-runtime-tools",
      version: options.version ?? "0.0.0"
    },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: options.registry.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      ...(tool.annotations === undefined ? {} : { annotations: tool.annotations })
    }))
  }))
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const input = jsonClone(request.params.arguments ?? {}) as ToolExecutionResult["result"]
    const context = await options.resolveExecutionContext({
      requestId: extra.requestId,
      ...(extra.sessionId === undefined ? {} : { sessionId: extra.sessionId }),
      ...(extra.authInfo === undefined ? {} : { authInfo: extra.authInfo }),
      toolName: request.params.name,
      input,
      signal: extra.signal
    })
    const toolCallId = `mcp_${String(extra.requestId)}`
    const outcome = await options.registry.execute({
      ...context,
      call: {
        type: "tool_call",
        id: `part_${toolCallId}`,
        toolCallId,
        toolName: request.params.name,
        input
      },
      signal: extra.signal
    })
    const structuredContent = asStructuredContent(outcome.result.result)
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(outcome.result.result)
      }],
      ...(structuredContent === undefined ? {} : { structuredContent }),
      isError: outcome.result.isError
    }
  })
  return server
}

export async function connectWanexMcpSdkServer(
  options: WanexMcpRuntimeServerOptions,
  transport: Transport
): Promise<Server> {
  const server = createWanexMcpSdkServer(options)
  await server.connect(transport)
  return server
}

function asStructuredContent(
  value: ToolExecutionResult["result"]
): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
