import {
  parseOptionalPositiveInteger,
  parseSelectorJsonInput,
  splitFirstToken
} from "./line-session-parser-core.js"

export type ProductAppTuiLineCommand =
  | {
      readonly kind: "command"
      readonly name: "help" | "commands" | "overview" | "refresh" | "quit"
    }
  | {
      readonly kind: "command"
      readonly name: "ask"
      readonly text: string
    }
  | {
      readonly kind: "command"
      readonly name: "attach"
      readonly path: string
    }
  | {
      readonly kind: "command"
      readonly name: "select"
      readonly sessionId: string
    }
  | {
      readonly kind: "command"
      readonly name: "workbench"
      readonly sessionId?: string
    }
  | {
      readonly kind: "command"
      readonly name: "operation" | "regenerate"
      readonly sessionId?: string
    }
  | {
      readonly kind: "command"
      readonly name: "cancel"
      readonly reason?: string
    }
  | {
      readonly kind: "command"
      readonly name: "palette"
      readonly paletteSelector?: string
      readonly input?: unknown
    }
  | {
      readonly kind: "command"
      readonly name: "preview" | "execute"
      readonly commandId: string
      readonly input?: unknown
    }
  | {
      readonly kind: "command"
      readonly name: "events"
      readonly limit?: number
    }
  | {
      readonly kind: "command"
      readonly name: "execution"
      readonly jobId: string
    }
  | {
      readonly kind: "error"
      readonly message: string
    }

export function parseProductAppTuiLineCommand(
  line: string
): ProductAppTuiLineCommand {
  const [name, rest] = splitFirstToken(line)
  switch (name) {
    case "help":
    case "commands":
    case "overview":
    case "refresh":
      if (rest.length > 0) {
        return {
          kind: "error",
          message: `${name} does not accept arguments`
        }
      }
      return { kind: "command", name }
    case "quit":
    case "exit":
      if (rest.length > 0) {
        return {
          kind: "error",
          message: `${name} does not accept arguments`
        }
      }
      return { kind: "command", name: "quit" }
    case "ask":
      return parseTextCommand(rest)
    case "attach":
      return parsePathCommand(rest)
    case "select":
      return parseSelectCommand(rest)
    case "workbench":
      return parseWorkbenchCommand(rest)
    case "operation":
    case "regenerate":
      return parseOptionalSessionCommand(name, rest)
    case "cancel":
      return {
        kind: "command",
        name: "cancel",
        ...(rest.trim().length === 0 ? {} : { reason: rest.trim() })
      }
    case "palette":
      return parsePaletteCommand(rest)
    case "preview":
    case "execute":
      return parseProductCommandInvocation(name, rest)
    case "execution":
      return parseExecutionCommand(rest)
    case "events":
      return parseEventsCommand(rest)
    default:
      return {
        kind: "error",
        message: `unknown command: ${name}`
      }
  }
}

function parsePathCommand(rest: string): ProductAppTuiLineCommand {
  const path = rest.trim()
  if (path.length === 0) {
    return { kind: "error", message: "attach requires a local path" }
  }
  return { kind: "command", name: "attach", path }
}

function parseExecutionCommand(rest: string): ProductAppTuiLineCommand {
  const jobId = rest.trim()
  if (jobId.length === 0) {
    return { kind: "error", message: "execution requires a job id" }
  }
  if (jobId.includes(" ")) {
    return { kind: "error", message: "execution accepts exactly one job id" }
  }
  return { kind: "command", name: "execution", jobId }
}

function parseTextCommand(rest: string): ProductAppTuiLineCommand {
  const text = rest.trim()
  if (text.length === 0) {
    return {
      kind: "error",
      message: "ask requires text"
    }
  }
  return {
    kind: "command",
    name: "ask",
    text
  }
}

function parseOptionalSessionCommand(
  name: "operation" | "regenerate",
  rest: string
): ProductAppTuiLineCommand {
  const sessionId = rest.trim()
  if (sessionId.length === 0) {
    return { kind: "command", name }
  }
  if (sessionId.includes(" ")) {
    return {
      kind: "error",
      message: `${name} accepts at most one session id`
    }
  }
  return { kind: "command", name, sessionId }
}

function parseSelectCommand(rest: string): ProductAppTuiLineCommand {
  const sessionId = rest.trim()
  if (sessionId.length === 0) {
    return {
      kind: "error",
      message: "select requires a session id"
    }
  }
  if (sessionId.includes(" ")) {
    return {
      kind: "error",
      message: "select accepts exactly one session id"
    }
  }
  return {
    kind: "command",
    name: "select",
    sessionId
  }
}

function parseWorkbenchCommand(rest: string): ProductAppTuiLineCommand {
  const sessionId = rest.trim()
  if (sessionId.length === 0) {
    return {
      kind: "command",
      name: "workbench"
    }
  }
  if (sessionId.includes(" ")) {
    return {
      kind: "error",
      message: "workbench accepts at most one session id"
    }
  }
  return {
    kind: "command",
    name: "workbench",
    sessionId
  }
}

function parsePaletteCommand(rest: string): ProductAppTuiLineCommand {
  const parsed = parseSelectorJsonInput({
    commandName: "palette",
    rest,
    selectorLabel: "a palette entry id, command id, or index"
  })
  if (!parsed.ok) {
    return {
      kind: "error",
      message: parsed.message
    }
  }
  return {
    kind: "command",
    name: "palette",
    ...(parsed.selector === undefined
      ? {}
      : { paletteSelector: parsed.selector }),
    ...(parsed.input === undefined ? {} : { input: parsed.input })
  }
}

function parseProductCommandInvocation(
  name: "preview" | "execute",
  rest: string
): ProductAppTuiLineCommand {
  const parsed = parseSelectorJsonInput({
    commandName: name,
    rest,
    selectorLabel: "a product command id"
  })
  if (!parsed.ok) {
    return {
      kind: "error",
      message: parsed.message
    }
  }
  if (parsed.selector === undefined) {
    return {
      kind: "error",
      message: `${name} requires a product command id`
    }
  }
  return {
    kind: "command",
    name,
    commandId: parsed.selector,
    ...(parsed.input === undefined ? {} : { input: parsed.input })
  }
}

function parseEventsCommand(rest: string): ProductAppTuiLineCommand {
  try {
    const limit = parseOptionalPositiveInteger(rest, "events limit")
    return {
      kind: "command",
      name: "events",
      ...(limit === undefined ? {} : { limit })
    }
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : String(error)
    }
  }
}
