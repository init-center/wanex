import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js"

const tools = [
  {
    name: "echo",
    description: "Echo structured input.",
    inputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: true, idempotentHint: true }
  },
  {
    name: "fail",
    description: "Return a structured MCP error.",
    inputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: true, idempotentHint: true }
  },
  {
    name: "hang",
    description: "Wait for cancellation.",
    inputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: true, idempotentHint: true }
  },
  {
    name: "media",
    description: "Return embedded MCP media.",
    inputSchema: { type: "object", additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true }
  }
]

const server = new Server(
  { name: "wanex-stdio-fixture", version: "0.0.0" },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  if (request.params.name === "hang") {
    await new Promise((_, reject) => {
      const abort = () => reject(new Error("fixture call aborted"))
      if (extra.signal.aborted) abort()
      else extra.signal.addEventListener("abort", abort, { once: true })
    })
  }
  if (request.params.name === "fail") {
    return {
      content: [{ type: "text", text: "fixture failure" }],
      structuredContent: { error: "fixture_failure" },
      isError: true
    }
  }
  if (request.params.name === "media") {
    return {
      content: [
        { type: "image", data: "AQID", mimeType: "image/png" },
        {
          type: "resource",
          resource: {
            uri: "wanex://fixture/blob",
            blob: "BAUG",
            mimeType: "application/octet-stream"
          }
        }
      ],
      isError: false
    }
  }
  const value = { echo: request.params.arguments ?? {} }
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
    isError: false
  }
})

await server.connect(new StdioServerTransport())
