export function requireOption(
  options: Readonly<Record<string, string>>,
  name: string
): string {
  const value = options[name]
  if (value === undefined || value.length === 0) {
    throw new Error(`missing --${name}`)
  }
  return value
}

export function requireValue(
  args: readonly string[],
  index: number,
  option: string
): string {
  const value = args[index]
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value`)
  }
  return value
}

export function parsePositiveInteger(raw: string, option: string): number {
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${option} must be a positive integer`)
  }
  return value
}

export function splitCsv(value: string): readonly string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean)
}

export function ensureNoPositionals(
  positionals: readonly string[],
  command: string
): void {
  if (positionals.length > 0) {
    throw new Error(`${command} does not accept positional arguments`)
  }
}
