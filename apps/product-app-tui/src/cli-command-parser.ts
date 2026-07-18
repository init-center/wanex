import type {
  ProductAppTuiCliCommand
} from "./cli-types.js"

const knownCommands = new Set([
  "overview",
  "commands",
  "events",
  "palette",
  "preview",
  "execute",
  "execution",
  "interactive"
])

export function parseProductAppTuiCliCommand(
  argv: readonly string[]
): ProductAppTuiCliCommand {
  const [first, ...rest] = argv
  if (first === undefined) {
    return { name: "overview", output: "text" }
  }
  if (!knownCommands.has(first)) {
    throw new Error(`unknown Product App TUI command: ${first}`)
  }
  if (first === "overview" || first === "commands") {
    return parseOptionalJsonOutputCommand(first, rest)
  }
  if (first === "events") {
    return parseEventsCommand(rest)
  }
  if (first === "interactive") {
    if (rest.length > 0) {
      throw new Error("interactive does not accept arguments")
    }
    return { name: "interactive" }
  }
  if (first === "preview" || first === "execute") {
    return parseProductCommand(first, rest)
  }
  if (first === "execution") {
    return parseExecutionCommand(rest)
  }
  return parsePaletteCommand(rest)
}

function parseExecutionCommand(rest: readonly string[]): ProductAppTuiCliCommand {
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
): ProductAppTuiCliCommand {
  if (rest.length > 1 || (rest.length === 1 && rest[0] !== "--json")) {
    throw new Error(`${name} accepts only --json`)
  }
  return {
    name,
    output: rest[0] === "--json" ? "json" : "text"
  }
}

function parseEventsCommand(rest: readonly string[]): ProductAppTuiCliCommand {
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

function parsePaletteCommand(rest: readonly string[]): ProductAppTuiCliCommand {
  const [paletteSelector, inputText, ...extra] = rest
  if (paletteSelector === undefined || paletteSelector.trim().length === 0) {
    throw new Error("palette requires a palette entry id or command id")
  }
  if (extra.length > 0) {
    throw new Error("palette accepts at most one JSON input argument")
  }
  return {
    name: "palette",
    paletteSelector,
    ...(inputText === undefined ? {} : { input: parseJsonInput(inputText) })
  }
}

function parseProductCommand(
  name: "preview" | "execute",
  rest: readonly string[]
): ProductAppTuiCliCommand {
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
