import type { TuiShellCommandExecutor } from "./tui/shell/index.js"
import {
  PRODUCT_APP_TUI_COMMANDS,
  productAppTuiCommandRow
} from "./commands.js"
import type {
  ExecuteProductAppTuiCommandRequest,
  ProductAppTuiCommandId,
  ProductAppTuiCommandResult
} from "./types.js"

export function createProductAppTuiCommandExecutor(
  client: ExecuteProductAppTuiCommandRequest["client"]
): TuiShellCommandExecutor {
  return async (invocation) =>
    await executeProductAppTuiCommand({ client, invocation })
}

export async function executeProductAppTuiCommand(
  request: ExecuteProductAppTuiCommandRequest
): Promise<ProductAppTuiCommandResult> {
  const command = productAppTuiCommandRow(request.invocation.commandId)
  if (command === undefined) {
    return {
      kind: "product-app-tui.command.rejected",
      commandId: request.invocation.commandId,
      reason: "unknown_command",
      message: `unknown Product App TUI command: ${request.invocation.commandId}`
    }
  }
  const value = await runCommand({
    commandId: command.id,
    client: request.client,
    input: request.invocation.input
  })
  return {
    kind: "product-app-tui.command.completed",
    commandId: command.id,
    value,
    mutatesState: command.mutatesState
  }
}

async function runCommand(request: {
  readonly commandId: ProductAppTuiCommandId
  readonly client: ExecuteProductAppTuiCommandRequest["client"]
  readonly input?: unknown
}): Promise<unknown> {
  switch (request.commandId) {
    case PRODUCT_APP_TUI_COMMANDS.refresh:
      return {
        status: await request.client.status(),
        home: await request.client.readHome()
      }
    case PRODUCT_APP_TUI_COMMANDS.status:
      return await request.client.status()
    case PRODUCT_APP_TUI_COMMANDS.readHome:
      return await request.client.readHome(parseHomeOptions(request.input))
    case PRODUCT_APP_TUI_COMMANDS.selectSession:
      return await request.client.selectSession(parseSessionSelector(request.input))
    case PRODUCT_APP_TUI_COMMANDS.openWorkbench:
      return await request.client.openWorkbench(parseOpenWorkbenchInput(request.input))
    case PRODUCT_APP_TUI_COMMANDS.startWorkbench:
      return await request.client.startWorkbench(parseStartWorkbenchInput(request.input))
    case PRODUCT_APP_TUI_COMMANDS.continueWorkbench:
      return await request.client.continueWorkbench(parseContinueWorkbenchInput(request.input))
  }
}

function parseHomeOptions(input: unknown): Parameters<
  ExecuteProductAppTuiCommandRequest["client"]["readHome"]
>[0] {
  if (input === undefined) {
    return undefined
  }
  if (!isRecord(input)) {
    throw new Error("readHome input must be an object")
  }
  return input
}

function parseSessionSelector(input: unknown): { readonly sessionId: string } {
  const record = requireRecord(input, "selectSession input")
  return {
    sessionId: requireString(record.sessionId, "selectSession input.sessionId")
  }
}

function parseOpenWorkbenchInput(
  input: unknown
): { readonly sessionId?: string } | undefined {
  if (input === undefined) {
    return undefined
  }
  const record = requireRecord(input, "openWorkbench input")
  if (record.sessionId === undefined) {
    return {}
  }
  return {
    sessionId: requireString(record.sessionId, "openWorkbench input.sessionId")
  }
}

function parseContinueWorkbenchInput(input: unknown): {
  readonly text: string
  readonly sessionId?: string
} {
  if (typeof input === "string") {
    return { text: input }
  }
  const record = requireRecord(input, "continueWorkbench input")
  return {
    text: requireString(record.text, "continueWorkbench input.text"),
    ...(record.sessionId === undefined
      ? {}
      : {
          sessionId: requireString(
            record.sessionId,
            "continueWorkbench input.sessionId"
          )
        })
  }
}

function parseStartWorkbenchInput(input: unknown): {
  readonly text: string
  readonly sessionId?: string
} {
  if (typeof input === "string") {
    return { text: input }
  }
  const record = requireRecord(input, "startWorkbench input")
  return {
    text: requireString(record.text, "startWorkbench input.text"),
    ...(record.sessionId === undefined
      ? {}
      : {
          sessionId: requireString(
            record.sessionId,
            "startWorkbench input.sessionId"
          )
        })
  }
}

function requireRecord(
  input: unknown,
  context: string
): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new Error(`${context} must be an object`)
  }
  return input
}

function requireString(input: unknown, context: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string`)
  }
  return input
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}
