import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { JsonValue, ToolResultContentPart } from "@wanex/protocol"
import {
  assertExecutionEnvironmentBindingValid,
  assertExecutionPolicySupported
} from "@wanex/runtime/execution"
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
import { WanexManagedStdioClientTransport } from "./managed-stdio-transport.js"

export const WANEX_MCP_CLIENT = "wanex-mcp-client" as const

export class WanexMcpRuntimeClient {
  private readonly options: WanexMcpRuntimeClientOptions
  private client: Client | undefined
  private started = false
  private disposed = false
  private lifecycle: Promise<void> = Promise.resolve()

  constructor(options: WanexMcpRuntimeClientOptions) {
    if (options.id.trim().length === 0) throw new Error("MCP client id must not be empty")
    if (options.capabilityRevision.trim().length === 0) {
      throw new Error("MCP capabilityRevision must not be empty")
    }
    positiveInteger(options.connectTimeoutMs, "MCP connectTimeoutMs")
    positiveInteger(options.requestTimeoutMs, "MCP requestTimeoutMs")
    if (options.transport.kind === "stdio") validateStdioTransport(options.transport)
    this.options = options
  }

  status(): WanexMcpClientStatus {
    return { started: this.started, disposed: this.disposed }
  }

  async start(): Promise<void> {
    return await this.enqueueLifecycle(async () => {
      if (this.disposed) throw new Error("MCP client is disposed")
      if (this.started) return
      await this.startNow()
    })
  }

  private async startNow(): Promise<void> {
    const client = new Client(
      { name: `wanex-${this.options.id}`, version: "0.0.0" },
      { capabilities: {} }
    )
    client.onclose = () => {
      if (this.client !== client) return
      this.client = undefined
      this.started = false
    }
    this.client = client
    try {
      await client.connect(createClientTransport(this.options.transport), {
        timeout: this.options.connectTimeoutMs
      })
      if (this.client !== client) {
        throw new Error("MCP client closed during initialization")
      }
      this.started = true
    } catch (error) {
      if (this.client === client) this.client = undefined
      this.started = false
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
    return await this.enqueueLifecycle(async () => await this.stopNow())
  }

  private async stopNow(): Promise<void> {
    if (!this.started) return
    const client = this.client
    this.client = undefined
    this.started = false
    await client?.close()
  }

  async dispose(): Promise<void> {
    return await this.enqueueLifecycle(async () => {
      if (this.disposed) return
      this.disposed = true
      await this.stopNow()
    })
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
      } catch {
        return {
          outcome: "ambiguous",
          toolCallId: invocation.toolCallId,
          message: "MCP tool response was not observed.",
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
      timeout: this.options.requestTimeoutMs
    }
  }

  private enqueueLifecycle(operation: () => Promise<void>): Promise<void> {
    const current = this.lifecycle.then(operation, operation)
    this.lifecycle = current.catch(() => undefined)
    return current
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
        cwd: options.transport.cwd,
        environmentKeys: Object.keys(options.transport.env ?? {}).sort(),
        execution: {
          providerId: options.transport.execution.binding.providerId,
          providerRevision: options.transport.execution.binding.providerRevision,
          capabilityDigest: options.transport.execution.binding.capabilityDigest,
          policyDigest: options.transport.execution.binding.policyDigest
        },
        maxBufferSize: options.transport.maxBufferSize ?? null
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
    connectTimeoutMs: options.connectTimeoutMs,
    requestTimeoutMs: options.requestTimeoutMs
  }
}

type RemoteTool = Awaited<ReturnType<Client["listTools"]>>["tools"][number]

function createClientTransport(config: WanexMcpClientTransportConfig): Transport {
  if (config.kind === "stdio") {
    return new WanexManagedStdioClientTransport(config)
  }
  return new StreamableHTTPClientTransport(new URL(config.url), {
    ...(config.headers === undefined
      ? {}
      : { requestInit: { headers: { ...config.headers } } })
  }) as unknown as Transport
}

function validateStdioTransport(
  config: Extract<WanexMcpClientTransportConfig, { readonly kind: "stdio" }>
): void {
  if (
    config.command.trim().length === 0 ||
    config.command.includes("\0") ||
    config.cwd.trim().length === 0 ||
    config.cwd.includes("\0") ||
    (config.args ?? []).some((argument) => argument.includes("\0"))
  ) {
    throw new Error("MCP stdio transport contains invalid process input")
  }
  if (config.maxBufferSize !== undefined) {
    positiveInteger(config.maxBufferSize, "MCP stdio maxBufferSize")
  }
  assertExecutionEnvironmentBindingValid(config.execution.binding)
  assertExecutionPolicySupported(
    config.execution.binding.policy,
    config.execution.binding.capabilities
  )
  const process = config.execution.binding.policy.process
  if (!process.managed || process.cleanup !== "durable_supervisor") {
    throw new Error(
      "MCP stdio transport requires managed durable-supervisor execution"
    )
  }
}

function positiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
}

function toolRisk(annotations: RemoteTool["annotations"]): ToolRisk {
  if (annotations?.openWorldHint === true) return "external"
  if (annotations?.destructiveHint === true) return "mutating"
  if (annotations?.readOnlyHint === true) return "read_only"
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
