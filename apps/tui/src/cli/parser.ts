import type {
  TuiCliCommand
} from "./model.js"

const knownCommands = new Set([
  "overview",
  "commands",
  "events",
  "preview",
  "execute",
  "execution",
  "interactive",
  "fullscreen"
])

export function parseTuiCliCommand(
  argv: readonly string[]
): TuiCliCommand {
  const [first, ...rest] = argv
  if (first === undefined) {
    return { name: "overview", output: "text" }
  }
  if (!knownCommands.has(first)) {
    throw new Error(`unknown TUI command: ${first}`)
  }
  if (first === "overview" || first === "commands") {
    return parseOptionalJsonOutputCommand(first, rest)
  }
  if (first === "events") {
    return parseEventsCommand(rest)
  }
  if (first === "interactive" || first === "fullscreen") {
    if (rest.length > 0) {
      throw new Error(`${first} does not accept arguments`)
    }
    return { name: first }
  }
  if (first === "preview" || first === "execute") {
    return parseProductCommand(first, rest)
  }
  if (first === "execution") {
    return parseExecutionCommand(rest)
  }
  throw new Error(`unsupported TUI command: ${first}`)
}

function parseExecutionCommand(rest: readonly string[]): TuiCliCommand {
  const [jobId, ...extra] = rest
  if (jobId === undefined || jobId.trim().length === 0) {
    throw new Error("execution requires a job id")
  }
  if (extra.length > 0) {
    throw new Error("execution accepts exactly one job id")
  }
  return { name: "execution", jobId }
}

function parseOptionalJsonOutputCommand(
  name: "overview" | "commands",
  rest: readonly string[]
): TuiCliCommand {
  if (rest.length > 1 || (rest.length === 1 && rest[0] !== "--json")) {
    throw new Error(`${name} accepts only --json`)
  }
  return {
    name,
    output: rest[0] === "--json" ? "json" : "text"
  }
}

function parseEventsCommand(rest: readonly string[]): TuiCliCommand {
  let output: "text" | "json" = "text"
  let limit: number | undefined

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (arg === "--json") {
      output = "json"
      continue
    }
    if (arg === "--limit") {
      limit = parsePositiveInteger(requireValue(rest, (index += 1), arg), arg)
      continue
    }
    throw new Error("events accepts only --json and --limit")
  }

  return {
    name: "events",
    output,
    ...(limit === undefined ? {} : { limit })
  }
}

function parseProductCommand(
  name: "preview" | "execute",
  rest: readonly string[]
): TuiCliCommand {
  const [commandId, inputText, ...extra] = rest
  if (commandId === undefined || commandId.trim().length === 0) {
    throw new Error(`${name} requires a product command id`)
  }
  if (extra.length > 0) {
    throw new Error(`${name} accepts at most one JSON input argument`)
  }
  return {
    name,
    commandId,
    ...(inputText === undefined ? {} : { input: parseJsonInput(inputText) })
  }
}

function parseJsonInput(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error("command input must be valid JSON")
  }
}

function requireValue(
  args: readonly string[],
  index: number,
  option: string
): string {
  const value = args[index]
  if (value === undefined || value.length === 0) {
    throw new Error(`${option} requires a value`)
  }
  return value
}

function parsePositiveInteger(text: string, option: string): number {
  const value = Number(text)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${option} must be a positive integer`)
  }
  return value
}
