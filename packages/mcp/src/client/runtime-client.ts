import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { JsonValue, ToolResultContentPart } from "@wanex/protocol"
import {
  createToolRuntimeBinding,
  ToolRegistry,
  type ToolDefinition,
  type ToolExecutionResult,
  type ToolInputSchema,
  type ToolInvocation,
  type ToolRisk
} from "@wanex/runtime/tools"
import type {
  WanexMcpClientStatus,
  WanexMcpClientTransportConfig,
  WanexMcpRuntimeClientOptions
} from "./types.js"

export const WANEX_MCP_CLIENT = "wanex-mcp-client" as const

export class WanexMcpRuntimeClient {
  private readonly options: WanexMcpRuntimeClientOptions
  private client: Client | undefined
  private started = false
  private disposed = false

  constructor(options: WanexMcpRuntimeClientOptions) {
    if (options.id.trim().length === 0) throw new Error("MCP client id must not be empty")
    if (options.capabilityRevision.trim().length === 0) {
      throw new Error("MCP capabilityRevision must not be empty")
    }
    if (
      options.requestTimeoutMs !== undefined &&
      (!Number.isInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0)
    ) {
      throw new Error("MCP requestTimeoutMs must be a positive integer")
    }
    this.options = options
  }

  status(): WanexMcpClientStatus {
    return { started: this.started, disposed: this.disposed }
  }

  async start(): Promise<void> {
    if (this.disposed) throw new Error("MCP client is disposed")
    if (this.started) return
    const client = new Client(
      { name: `wanex-${this.options.id}`, version: "0.0.0" },
      { capabilities: {} }
    )
    try {
      await client.connect(createClientTransport(this.options.transport))
      this.client = client
      this.started = true
    } catch (error) {
      await client.close().catch(() => undefined)
      throw error
    }
  }

  async discoverTools(): Promise<ToolDefinition[]> {
    const client = this.requireClient()
    const tools: ToolDefinition[] = []
    let cursor: string | undefined
    do {
      const page = await client.listTools(
        cursor === undefined ? undefined : { cursor },
        this.requestOptions(undefined)
      )
      tools.push(...page.tools.map((tool) => this.adaptTool(tool)))
      cursor = page.nextCursor
    } while (cursor !== undefined)
    return tools
  }

  async createRegistry(): Promise<ToolRegistry> {
    const registry = new ToolRegistry()
    for (const tool of await this.discoverTools()) registry.register(tool)
    return registry
  }

  async stop(): Promise<void> {
    if (!this.started) return
    const client = this.client
    this.client = undefined
    this.started = false
    await client?.close()
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    await this.stop()
    this.disposed = true
  }

  private adaptTool(remote: RemoteTool): ToolDefinition {
    const remoteName = remote.name
    const name = this.options.namePrefix === undefined
      ? remoteName
      : `${this.options.namePrefix}__${remoteName}`
    const annotations = remote.annotations
    const title = remote.title ?? annotations?.title
    return {
      name,
      description: remote.description?.trim() || `MCP tool ${remoteName}`,
      inputSchema: jsonClone(remote.inputSchema) as ToolInputSchema,
      risk: toolRisk(annotations),
      idempotent: annotations?.idempotentHint === true,
      concurrency: "exclusive",
      resultMode: "immediate",
      annotations: {
        ...(title === undefined ? {} : { title }),
        ...(annotations?.readOnlyHint === undefined
          ? {}
          : { readOnlyHint: annotations.readOnlyHint }),
        ...(annotations?.destructiveHint === undefined
          ? {}
          : { destructiveHint: annotations.destructiveHint }),
        ...(annotations?.idempotentHint === undefined
          ? {}
          : { idempotentHint: annotations.idempotentHint }),
        ...(annotations?.openWorldHint === undefined
          ? {}
          : { openWorldHint: annotations.openWorldHint })
      },
      runtimeBinding: createToolRuntimeBinding({
        implementationId: `wanex.mcp.client:${this.options.id}:${remoteName}`,
        implementationRevision: this.options.capabilityRevision,
        configuration: mcpToolConfiguration(this.options)
      }),
      invoke: async (invocation) => await this.invokeRemote(remoteName, invocation)
    }
  }

  private async invokeRemote(
    remoteName: string,
    invocation: ToolInvocation
  ): Promise<ToolExecutionResult> {
    const client = this.requireClient()
    const args = asArguments(invocation.input)
    const signal = bridgeAbortSignal(invocation.signal)
    try {
      let result: Awaited<ReturnType<Client["callTool"]>>
      try {
        result = await client.callTool(
          { name: remoteName, arguments: args },
          undefined,
          this.requestOptions(signal.signal)
        )
      } catch (error) {
        return {
          outcome: "ambiguous",
          toolCallId: invocation.toolCallId,
          message: `MCP tool response was not observed: ${errorMessage(error)}`,
          metadata: {
            protocol: "mcp",
            clientId: this.options.id,
            remoteToolName: remoteName
          }
        }
      }
      return {
        outcome: "isError" in result && result.isError === true
          ? "failed"
          : "succeeded",
        toolCallId: invocation.toolCallId,
        content: await mcpToolResultContent(result, invocation)
      }
    } finally {
      signal.dispose()
    }
  }

  private requestOptions(signal: AbortSignal | undefined) {
    return {
      ...(signal === undefined ? {} : { signal }),
      ...(this.options.requestTimeoutMs === undefined
        ? {}
        : { timeout: this.options.requestTimeoutMs })
    }
  }

  private requireClient(): Client {
    if (!this.started || this.client === undefined) {
      throw new Error("MCP client is not started")
    }
    return this.client
  }
}

async function mcpToolResultContent(
  result: Awaited<ReturnType<Client["callTool"]>>,
  invocation: ToolInvocation
): Promise<readonly ToolResultContentPart[]> {
  const content: ToolResultContentPart[] = []
  const blocks: CallToolResult["content"] =
    "content" in result && Array.isArray(result.content)
      ? result.content as CallToolResult["content"]
      : []
  for (const block of blocks) {
    if (block.type === "text") {
      if (block.text.length > 0) content.push({ type: "text", text: block.text })
      continue
    }
    if (block.type === "image" || block.type === "audio") {
      content.push(await invocation.resources.publish({
        content: decodeBase64(block.data, `MCP ${block.type} content`),
        kind: block.type,
        mediaType: block.mimeType
      }))
      continue
    }
    if (block.type === "resource") {
      if ("blob" in block.resource) {
        content.push(await invocation.resources.publish({
          content: decodeBase64(block.resource.blob, "MCP embedded resource"),
          ...(block.resource.mimeType === undefined
            ? {}
            : { mediaType: block.resource.mimeType }),
          metadata: { protocol: "mcp", sourceUri: block.resource.uri }
        }))
      } else {
        content.push({
          type: "json",
          value: {
            type: "mcp_embedded_text_resource",
            uri: block.resource.uri,
            mimeType: block.resource.mimeType ?? null,
            text: block.resource.text
          }
        })
      }
      continue
    }
    content.push({
      type: "json",
      value: jsonValue({
        type: "mcp_resource_link",
        name: block.name,
        uri: block.uri,
        ...(block.title === undefined ? {} : { title: block.title }),
        ...(block.description === undefined
          ? {}
          : { description: block.description }),
        ...(block.mimeType === undefined ? {} : { mimeType: block.mimeType }),
        ...(block.size === undefined ? {} : { sizeBytes: block.size })
      })
    })
  }
  if (result.structuredContent !== undefined) {
    content.push({ type: "json", value: jsonValue(result.structuredContent) })
  }
  if (content.length === 0) {
    content.push({ type: "json", value: { protocol: "mcp", content: [] } })
  }
  return content
}

function decodeBase64(value: string, label: string): Uint8Array {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new Error(`${label} is not canonical base64`)
  }
  const bytes = Buffer.from(value, "base64")
  if (bytes.toString("base64") !== value) {
    throw new Error(`${label} is not canonical base64`)
  }
  return bytes
}

function mcpToolConfiguration(
  options: WanexMcpRuntimeClientOptions
): import("@wanex/protocol").JsonValue {
  const transport = options.transport.kind === "stdio"
    ? {
        kind: options.transport.kind,
        command: options.transport.command,
        args: options.transport.args ?? [],
        cwd: options.transport.cwd ?? null,
        environmentKeys: Object.keys(options.transport.env ?? {}).sort()
      }
    : {
        kind: options.transport.kind,
        url: options.transport.url,
        headerNames: Object.keys(options.transport.headers ?? {})
          .map((name) => name.toLowerCase())
          .sort()
      }
  return {
    transport,
    namePrefix: options.namePrefix ?? null,
    requestTimeoutMs: options.requestTimeoutMs ?? null
  }
}

type RemoteTool = Awaited<ReturnType<Client["listTools"]>>["tools"][number]

function createClientTransport(config: WanexMcpClientTransportConfig): Transport {
  if (config.kind === "stdio") {
    return new StdioClientTransport({
      command: config.command,
      ...(config.args === undefined ? {} : { args: [...config.args] }),
      ...(config.cwd === undefined ? {} : { cwd: config.cwd }),
      ...(config.env === undefined ? {} : { env: { ...config.env } }),
      ...(config.stderr === undefined ? {} : { stderr: config.stderr })
    })
  }
  return new StreamableHTTPClientTransport(new URL(config.url), {
    ...(config.headers === undefined
      ? {}
      : { requestInit: { headers: { ...config.headers } } })
  }) as unknown as Transport
}

function toolRisk(annotations: RemoteTool["annotations"]): ToolRisk {
  if (annotations?.readOnlyHint === true) return "read_only"
  if (annotations?.openWorldHint === true) return "external"
  return "mutating"
}

function asArguments(value: ToolInvocation["input"]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("MCP tool input must be an object")
  }
  return value as Record<string, unknown>
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function bridgeAbortSignal(signal: ToolInvocation["signal"]): {
  readonly signal: AbortSignal | undefined
  dispose(): void
} {
  if (signal === undefined) return { signal: undefined, dispose() {} }
  const controller = new AbortController()
  const abort = (): void => controller.abort()
  if (signal.aborted) controller.abort()
  else signal.addEventListener("abort", abort, { once: true })
  return {
    signal: controller.signal,
    dispose() {
      signal.removeEventListener("abort", abort)
    }
  }
}
