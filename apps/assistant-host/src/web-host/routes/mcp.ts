import type { IncomingMessage, ServerResponse } from "node:http"
import type { LocalMcpSettingsPort } from "../../mcp/index.js"
import {
  LocalMcpSettingsValidationError,
  parseLocalMcpSettingsCommand,
} from "../../mcp/index.js"
import { WebHostHttpError } from "../http-error.js"
import { readJsonBody } from "../request-body.js"
import { sendJson } from "../response.js"

export async function handleMcpSettings(request: {
  readonly settings?: LocalMcpSettingsPort
  readonly maxBodyBytes: number
  readonly request: IncomingMessage
  readonly response: ServerResponse
}): Promise<void> {
  if (request.settings === undefined) {
    throw new WebHostHttpError(
      404,
      "not_found",
      "MCP settings are not available"
    )
  }
  if (request.request.method === "GET") {
    sendJson(request.response, 200, {
      ok: true,
      kind: "web.mcp-server-list-response",
      servers: await request.settings.readServers(),
    })
    return
  }
  const body = await readJsonBody(request.request, request.maxBodyBytes)
  let command
  try {
    command = parseLocalMcpSettingsCommand(body)
  } catch (error) {
    if (error instanceof LocalMcpSettingsValidationError) {
      sendJson(request.response, 400, {
        ok: false,
        error: {
          code: "invalid_mcp_settings_request",
          field: error.field,
          message: error.message,
        },
      })
      return
    }
    throw error
  }

  let result: unknown
  try {
    switch (command.operation) {
      case "stage-credential":
        result = await request.settings.stageCredential(command.request)
        break
      case "save-server":
        result = await request.settings.saveServer(command.request)
        break
      case "update-server":
        result = await request.settings.updateServer(command.request)
        break
      case "set-server-enabled":
        result = await request.settings.setServerEnabled(command.request)
        break
      case "remove-server":
        result = await request.settings.removeServer(command.request)
        break
      case "reload-servers":
        result = await request.settings.reloadServers(command.request)
        break
    }
  } catch {
    throw new WebHostHttpError(
      500,
      "mcp_settings_operation_failed",
      "MCP settings operation could not be completed"
    )
  }
  sendJson(request.response, 200, {
    ok: true,
    kind: "web.mcp-settings-response",
    operation: command.operation,
    result,
  })
}
