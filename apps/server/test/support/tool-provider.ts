import { createServer } from "node:http"

/** Deterministic provider response; tool execution still uses the production Host. */
export async function startToolProvider(options: { readonly accessPath?: string } = {}) {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    const messages = body.messages as { role: string; content: string }[]
    const lastUser = messages.map((message) => message.role).lastIndexOf("user")
    const toolMessages = messages.slice(lastUser + 1).filter((message) => message.role === "tool")
    const hasResult = toolMessages.length > 0
    const input = JSON.parse(messages[lastUser]!.content)
    const accessGrantId = input.tool === "access" && toolMessages.length === 1
      ? findGrantId(toolMessages[0]!.content)
      : undefined
    const delta = accessGrantId !== undefined
      ? {
          tool_calls: [{ index: 0, id: "workspace_read_text-call", type: "function", function: {
            name: "workspace_read_text",
            arguments: JSON.stringify({
              path: "note.txt",
              grantId: accessGrantId
            })
          } }]
        }
      : hasResult
        ? { content: toolMessages[toolMessages.length - 1]!.content }
        : (() => {
          const toolName = input.tool === "direct"
            ? "workspace_apply_changeset"
            : input.tool === "access"
              ? "workspace_request_access"
              : "workspace_prepare_isolated_changes"
          const { tool: _tool, ...toolInput } = input
          if (input.tool === "access" && options.accessPath !== undefined) {
            toolInput.path = options.accessPath
          }
          return {
            tool_calls: [{ index: 0, id: `${toolName}-call`, type: "function", function: {
              name: toolName, arguments: JSON.stringify(toolInput)
            } }]
          }
        })()
    response.writeHead(200, { "content-type": "text/event-stream" })
    const emitsToolCall = accessGrantId !== undefined || !hasResult
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: emitsToolCall ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("provider did not listen")
  return {
    endpoint: {
      id: "workspace-provider",
      connection: { id: "workspace-provider", providerId: "openai-compatible", baseUrl: `http://127.0.0.1:${address.port}/v1`, secretRef: "env://WORKSPACE_TEST_KEY" },
      protocol: { id: "openai-chat-completions" as const },
      model: {
        id: "workspace-model", operations: ["conversation" as const], inputModalities: ["text" as const], outputModalities: ["text" as const], features: ["tool_calling" as const],
        catalog: { source: "custom" as const, catalogId: "test.remote-workspace", revision: "1" }
      }
    },
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
      server.closeAllConnections()
    })
  }
}

function findGrantId(content: string): string | undefined {
  const parsed: unknown = JSON.parse(content)
  const value = findProperty(parsed, "grantId")
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function findProperty(value: unknown, property: string): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProperty(item, property)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (value === null || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  if (property in record) return record[property]
  for (const child of Object.values(record)) {
    const found = findProperty(child, property)
    if (found !== undefined) return found
  }
  return undefined
}
