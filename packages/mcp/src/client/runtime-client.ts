import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import {
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
      invoke: async (invocation) => await this.invokeRemote(remoteName, invocation)
    }
  }

  private async invokeRemote(
    remoteName: string,
    invocation: ToolInvocation
  ): Promise<ToolExecutionResult> {
    const client = this.requireClient()
    const signal = bridgeAbortSignal(invocation.signal)
    try {
      const result = await client.callTool(
        {
          name: remoteName,
          arguments: asArguments(invocation.input)
        },
        undefined,
        this.requestOptions(signal.signal)
      )
      return {
        toolCallId: invocation.toolCallId,
        result: jsonValue({
          protocol: "mcp",
          content: "content" in result ? result.content : [],
          ...(result.structuredContent === undefined
            ? {}
            : { structuredContent: result.structuredContent }),
          ...(result._meta === undefined ? {} : { meta: result._meta })
        }),
        isError: "isError" in result && result.isError === true
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

function jsonValue(value: unknown): ToolExecutionResult["result"] {
  return JSON.parse(JSON.stringify(value)) as ToolExecutionResult["result"]
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
