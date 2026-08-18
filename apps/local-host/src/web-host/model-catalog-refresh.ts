import type { IncomingMessage, ServerResponse } from "node:http"
import type { LocalModelCatalogCommands } from "../model.js"
import { readJsonBody } from "./request-body.js"
import { sendJson } from "./response.js"

export async function handleLocalModelCatalogRefresh(request: {
  readonly commands: LocalModelCatalogCommands
  readonly maxBodyBytes: number
  readonly request: IncomingMessage
  readonly response: ServerResponse
}): Promise<void> {
  const input = await readJsonBody(request.request, request.maxBodyBytes)
  if (!isRecord(input) || Object.keys(input).length !== 0) {
    sendJson(request.response, 400, {
      ok: false,
      error: {
        code: "invalid_model_catalog_refresh",
        message: "Model catalog refresh request must be an empty object"
      }
    })
    return
  }
  const refresh = await request.commands.refresh()
  if (refresh.kind === "local-host.model-catalog.refresh-failed") {
    sendJson(request.response, 503, {
      ok: false,
      kind: "web.model-catalog-refresh-response",
      refresh,
      error: { code: refresh.code, message: refresh.message }
    })
    return
  }
  sendJson(request.response, 200, {
    ok: true,
    kind: "web.model-catalog-refresh-response",
    refresh,
    suggestions: request.commands.readConversationModelSuggestions()
  })
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
