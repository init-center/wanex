import {
  parseOptionalPositiveInteger,
  parseSelectorJsonInput,
  splitFirstToken
} from "./core.js"
import { parseGoalStartCommand } from "./goal.js"
import type { TuiLineCommand } from "./model.js"

export type { TuiLineCommand } from "./model.js"

export function parseTuiLineCommand(
  line: string
): TuiLineCommand {
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
    case "steer": {
      const text = rest.trim()
      return text.length === 0
        ? { kind: "error", message: "steer requires guidance text" }
        : { kind: "command", name: "steer", text }
    }
    case "btw":
      return parseSideQueryCommand(rest)
    case "btw-cancel":
    case "btw-dismiss":
      if (rest.length > 0) {
        return {
          kind: "error",
          message: `${name} does not accept arguments`
        }
      }
      return { kind: "command", name }
    case "plan":
      return parsePlanCommand(rest)
    case "plan-show":
    case "plan-cancel":
    case "plan-dismiss":
    case "plan-approve":
    case "plan-execute":
      if (rest.length > 0) {
        return { kind: "error", message: `${name} does not accept arguments` }
      }
      return { kind: "command", name }
    case "plan-reject":
    case "plan-withdraw":
      return {
        kind: "command",
        name,
        ...(rest.trim().length === 0 ? {} : { reason: rest.trim() })
      }
    case "goal":
      if (rest.length > 0) {
        return { kind: "error", message: "goal does not accept arguments" }
      }
      return { kind: "command", name: "goal" }
    case "goal-start":
      return parseGoalStartCommand(rest)
    case "goal-pause":
    case "goal-resume":
      return {
        kind: "command",
        name,
        ...(rest.length === 0 ? {} : { reason: rest })
      }
    case "goal-cancel":
      return rest.length === 0
        ? { kind: "error", message: "goal-cancel requires a reason" }
        : { kind: "command", name: "goal-cancel", reason: rest }
    case "attach":
      return parsePathCommand(rest)
    case "select":
      return parseSelectCommand(rest)
    case "model":
      return parseModelCommand(rest)
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
    case "approval-approve":
    case "approval-deny":
      return parseApprovalDecisionCommand(name, rest)
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

function parseModelCommand(rest: string): TuiLineCommand {
  const endpointId = rest.trim()
  if (endpointId.length === 0) {
    return { kind: "error", message: "model requires an endpoint id" }
  }
  if (endpointId.length > 512) {
    return { kind: "error", message: "model endpoint id is too long" }
  }
  return { kind: "command", name: "model", endpointId }
}

function parseApprovalDecisionCommand(
  name: "approval-approve" | "approval-deny",
  rest: string
): TuiLineCommand {
  const [approvalId, reason] = splitFirstToken(rest)
  if (approvalId.length === 0) {
    return { kind: "error", message: `${name} requires an approval id` }
  }
  if (approvalId.length > 512) {
    return { kind: "error", message: `${name} approval id is too long` }
  }
  if (reason.length === 0) {
    return { kind: "error", message: `${name} requires a reason` }
  }
  if (reason.length > 1_024) {
    return { kind: "error", message: `${name} reason is too long` }
  }
  return { kind: "command", name, approvalId, reason }
}

function parsePathCommand(rest: string): TuiLineCommand {
  const path = rest.trim()
  if (path.length === 0) {
    return { kind: "error", message: "attach requires a local path" }
  }
  return { kind: "command", name: "attach", path }
}

function parseExecutionCommand(rest: string): TuiLineCommand {
  const jobId = rest.trim()
  if (jobId.length === 0) {
    return { kind: "error", message: "execution requires a job id" }
  }
  if (jobId.includes(" ")) {
    return { kind: "error", message: "execution accepts exactly one job id" }
  }
  return { kind: "command", name: "execution", jobId }
}

function parseTextCommand(rest: string): TuiLineCommand {
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

function parseSideQueryCommand(rest: string): TuiLineCommand {
  const question = rest.trim()
  return question.length === 0
    ? { kind: "error", message: "btw requires a question" }
    : { kind: "command", name: "btw", question }
}

function parsePlanCommand(rest: string): TuiLineCommand {
  const text = rest.trim()
  return text.length === 0
    ? { kind: "error", message: "plan requires a planning request" }
    : { kind: "command", name: "plan", text }
}

function parseOptionalSessionCommand(
  name: "operation" | "regenerate",
  rest: string
): TuiLineCommand {
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

function parseSelectCommand(rest: string): TuiLineCommand {
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

function parseWorkbenchCommand(rest: string): TuiLineCommand {
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

function parseProductCommandInvocation(
  name: "preview" | "execute",
  rest: string
): TuiLineCommand {
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

function parseEventsCommand(rest: string): TuiLineCommand {
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
