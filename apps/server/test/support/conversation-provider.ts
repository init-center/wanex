import { createServer } from "node:http"

/**
 * Deterministic OpenAI-compatible fixture for one unified conversation.
 *
 * Plain-text user input receives an ordinary chat reply naming the frozen model.
 * JSON user input drives production Workspace tools; the fixture only decides
 * which tool the model calls. Every tool still executes through the real Host.
 */
export async function startConversationProvider(options: { readonly accessPath: string }) {
  let grantId: string | undefined
  const requests: { readonly model: string; readonly lastUser: string }[] = []
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      readonly model: string
      readonly messages: readonly { readonly role: string; readonly content: string }[]
    }
    const messages = body.messages
    const lastUser = messages.map((message) => message.role).lastIndexOf("user")
    const userText = messages[lastUser]!.content
    requests.push({ model: body.model, lastUser: userText })
    const toolMessages = messages.slice(lastUser + 1).filter((message) => message.role === "tool")
    const input = parseJsonObject(userText)
    const delta = input === undefined
      ? { content: `chat reply from ${body.model}: ${userText}` }
      : nextToolStep(input, toolMessages)
    response.writeHead(200, { "content-type": "text/event-stream" })
    const finish = "tool_calls" in delta ? "tool_calls" : "stop"
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: finish }] })}\n\ndata: [DONE]\n\n`)
  })

  function nextToolStep(
    input: Record<string, unknown>,
    toolMessages: readonly { readonly content: string }[]
  ): { readonly content: string } | { readonly tool_calls: readonly unknown[] } {
    const { tool, ...toolInput } = input
    if (tool === "access") {
      const { readPath, ...accessInput } = toolInput
      if (toolMessages.length === 0) {
        return call("workspace_request_access", { ...accessInput, path: options.accessPath })
      }
      if (toolMessages.length === 1) {
        grantId = findGrantId(toolMessages[0]!.content)
        if (grantId === undefined) return { content: toolMessages[0]!.content }
        return call("workspace_read_text", { path: String(readPath), grantId })
      }
      return { content: toolMessages.at(-1)!.content }
    }
    if (toolMessages.length > 0) return { content: toolMessages.at(-1)!.content }
    if (tool === "direct") {
      if (grantId === undefined) throw new Error("fixture requires an approved grant before direct mutation")
      const changes = (toolInput.changes as Record<string, unknown>[]).map((change) => ({ ...change, grantId }))
      return call("workspace_apply_changeset", { changes })
    }
    return call("workspace_prepare_isolated_changes", toolInput)
  }

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("provider did not listen")
  const endpoint = (id: string, modelId: string) => ({
    id,
    connection: { id: "conversation-provider", providerId: "openai-compatible", baseUrl: `http://127.0.0.1:${address.port}/v1`, secretRef: "env://WORKSPACE_TEST_KEY" },
    protocol: { id: "openai-chat-completions" as const },
    model: {
      id: modelId, operations: ["conversation" as const], inputModalities: ["text" as const], outputModalities: ["text" as const], features: ["tool_calling" as const],
      catalog: { source: "custom" as const, catalogId: "test.unified-conversation", revision: "1" }
    }
  })
  return {
    primary: endpoint("conversation-primary", "primary-model"),
    secondary: endpoint("conversation-secondary", "secondary-model"),
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
      server.closeAllConnections()
    })
  }
}

function call(name: string, input: unknown) {
  return {
    tool_calls: [{ index: 0, id: `${name}-call`, type: "function", function: { name, arguments: JSON.stringify(input) } }]
  }
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  if (!text.startsWith("{")) return undefined
  const parsed: unknown = JSON.parse(text)
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : undefined
}

function findGrantId(content: string): string | undefined {
  const value = findProperty(JSON.parse(content), "grantId")
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
