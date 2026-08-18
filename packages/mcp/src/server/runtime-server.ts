import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import type { JsonValue, ToolResultContentPart } from "@wanex/protocol"
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
    tools: options.registry.list()
      .filter((tool) => tool.resultMode === "immediate")
      .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      ...(tool.annotations === undefined ? {} : { annotations: tool.annotations })
      }))
  }))
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const selected = options.registry.get(request.params.name)
    if (selected?.resultMode === "deferred") {
      throw new Error(
        `deferred tool cannot be exposed through request-response MCP: ${selected.name}`
      )
    }
    const input = jsonClone(request.params.arguments ?? {}) as JsonValue
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
    if (outcome.state === "recovery_required") {
      throw new Error(
        `tool execution requires reconciliation: ${outcome.recovery.execution.id}`
      )
    }
    if (outcome.state === "suspended") {
      throw new Error(
        "request-response MCP tool execution unexpectedly suspended"
      )
    }
    if (outcome.state === "approval_required") {
      throw new Error(
        `tool execution requires approval: ${outcome.receipt.execution.id}`
      )
    }
    const structuredContent = structuredToolContent(outcome.result.content)
    return {
      content: outcome.result.content.map(mcpContentBlock),
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

function structuredToolContent(
  content: readonly ToolResultContentPart[]
): Record<string, unknown> | undefined {
  if (content.length !== 1 || content[0]?.type !== "json") return undefined
  const value = content[0].value
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function mcpContentBlock(part: ToolResultContentPart) {
  if (part.type === "text") return { type: "text" as const, text: part.text }
  if (part.type === "json") {
    return { type: "text" as const, text: canonicalJson(part.value) }
  }
  return {
    type: "text" as const,
    text: canonicalJson({
      type: "wanex_resource",
      resourceId: part.resourceId,
      kind: part.kind,
      ...(part.mediaType === undefined ? {} : { mediaType: part.mediaType }),
      sizeBytes: part.sizeBytes,
      sha256: part.sha256
    })
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) =>
      `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
    )
    .join(",")}}`
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
