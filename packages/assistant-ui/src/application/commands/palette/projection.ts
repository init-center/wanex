import type {
  CommandPaletteViewModel
} from "./model.js"
import type { Snapshot } from "../../model.js"
import { projectCommandInput } from "../input/projection.js"

export function projectCommandPalette(
  result: Snapshot["commandCatalog"]
): CommandPaletteViewModel {
  if (!result.ok) {
    return {
      kind: "web.command-palette",
      state: "unavailable",
      message: "Command palette unavailable",
      rows: [],
      diagnostics: []
    }
  }

  const commands = result.value.commands.filter(
    (command) => command.paletteVisibility === "visible"
  )

  return {
    kind: "web.command-palette",
    state: "ready",
    message: commandPaletteMessage(commands.length),
    rows: commands.map((command) => ({
      id: command.id,
      name: command.name,
      title: command.title,
      handlerRef: command.handlerRef,
      sourceKind: command.sourceKind,
      sourceId: command.sourceId,
      trust: command.trust,
      input: projectCommandInput(command.inputSchema),
      ...(command.category === undefined ? {} : { category: command.category })
    })),
    diagnostics: result.value.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      ...(diagnostic.contributionId === undefined
        ? {}
        : { contributionId: diagnostic.contributionId }),
      ...(diagnostic.sourceId === undefined
        ? {}
        : { sourceId: diagnostic.sourceId })
    }))
  }
}

function commandPaletteMessage(count: number): string {
  if (count === 0) {
    return "No commands available"
  }
  return `${count} command${count === 1 ? "" : "s"} available`
}
