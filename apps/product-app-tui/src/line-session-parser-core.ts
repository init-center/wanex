export function splitFirstToken(line: string): readonly [string, string] {
  const trimmed = line.trim()
  if (trimmed.length === 0) {
    return ["", ""]
  }
  const firstSpace = trimmed.search(/\s/)
  if (firstSpace < 0) {
    return [trimmed, ""]
  }
  return [trimmed.slice(0, firstSpace), trimmed.slice(firstSpace).trim()]
}

export function parseOptionalPositiveInteger(
  value: string,
  context: string
): number | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return undefined
  }
  if (trimmed.includes(" ")) {
    throw new Error(`${context} accepts at most one number`)
  }
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${context} must be a positive integer`)
  }
  return parsed
}

export function parseSelectorJsonInput(options: {
  readonly commandName: string
  readonly rest: string
  readonly selectorLabel: string
}):
  | {
      readonly ok: true
      readonly selector?: string
      readonly input?: unknown
    }
  | {
      readonly ok: false
      readonly message: string
    } {
  if (options.rest.trim().length === 0) {
    return { ok: true }
  }
  const [selector, inputText] = splitFirstToken(options.rest)
  if (selector.length === 0) {
    return {
      ok: false,
      message: `${options.commandName} requires ${options.selectorLabel}`
    }
  }
  if (inputText.length === 0) {
    return {
      ok: true,
      selector
    }
  }
  try {
    return {
      ok: true,
      selector,
      input: JSON.parse(inputText) as unknown
    }
  } catch {
    return {
      ok: false,
      message: `${options.commandName} input must be valid JSON`
    }
  }
}
