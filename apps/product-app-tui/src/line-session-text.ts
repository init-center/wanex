import type {
  ProductAppTuiLineSessionOptions
} from "./types.js"

export function helpText(): string {
  return [
    "Commands:",
    "  help",
    "  ask <text>",
    "  attach <local-path>",
    "  select <session-id>",
    "  workbench [session-id]",
    "  operation [session-id]",
    "  cancel [reason]",
    "  regenerate [session-id]",
    "  commands",
    "  palette",
    "  palette <index|palette-id|command-id> [json-input]",
    "  preview <command-id> [json-input]",
    "  execute <command-id> [json-input]",
    "  execution <job-id>",
    "  events [limit]",
    "  overview",
    "  refresh",
    "  quit"
  ].join("\n")
}

export function paletteText(options: ProductAppTuiLineSessionOptions): string {
  const palette = options.surface.readModel().palette
  return [
    "Palette:",
    ...palette.map(
      (entry, index) =>
        `  ${index + 1}. ${entry.id} -> ${entry.command.commandId} - ${entry.title}`
    )
  ].join("\n")
}

export function resolvePaletteSelector(
  options: ProductAppTuiLineSessionOptions,
  selector: string
): string {
  const palette = options.surface.readModel().palette
  const asNumber = Number(selector)
  if (Number.isInteger(asNumber) && asNumber > 0) {
    const entry = palette[asNumber - 1]
    if (entry === undefined) {
      throw new Error(`palette index not found: ${selector}`)
    }
    return entry.id
  }
  const byEntryId = palette.find((entry) => entry.id === selector)
  if (byEntryId !== undefined) {
    return byEntryId.id
  }
  const byCommandId = palette.find(
    (entry) => entry.command.commandId === selector
  )
  return byCommandId?.id ?? selector
}

export function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}
